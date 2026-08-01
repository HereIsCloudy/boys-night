#!/usr/bin/env python3
"""
generate_layout.py

CLI to generate an optimized layout blueprint for a rectangular grid using
snapping rules and a build catalog.
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

DEFAULT_CATALOG = {
    "Wall": {"unit_cost": 5},
    "Shelf": {"unit_cost": 10, "thickness": 1},
    "Walkway": {"unit_cost": 0},
    "Door": {"unit_cost": 50}
}

DEFAULT_RULES = {
    "grid": {"width": 12, "height": 18},
    "min_walkway_width": 1,
    "door_count": 2,
    "door_positions": ["top", "bottom"],
    "shelf_orientation": "horizontal",
    "shelf_length": "full",
    "shelf_thickness": 1,
    "snap_to_grid": True
}


def load_json_maybe(path: Optional[str], default):
    if not path:
        return default
    p = Path(path)
    if not p.exists():
        print(f"Warning: {path} not found. Using defaults.", file=sys.stderr)
        return default
    try:
        return json.loads(p.read_text())
    except Exception as e:
        print(f"Error reading {path}: {e}. Using defaults.", file=sys.stderr)
        return default


def make_grid(width: int, height: int, fill: str = " ") -> List[List[str]]:
    return [[fill for _ in range(width)] for _ in range(height)]


def place_perimeter_walls(grid: List[List[str]]):
    h = len(grid)
    w = len(grid[0])
    for x in range(w):
        grid[0][x] = "W"
        grid[h - 1][x] = "W"
    for y in range(1, h - 1):
        grid[y][0] = "W"
        grid[y][w - 1] = "W"


def validate_perimeter_cells(width: int, height: int, side: str):
    cand = []
    if side == "top":
        y = 0
        for x in range(1, width - 1):
            cand.append((y, x))
    elif side == "bottom":
        y = height - 1
        for x in range(1, width - 1):
            cand.append((y, x))
    elif side == "left":
        x = 0
        for y in range(1, height - 1):
            cand.append((y, x))
    elif side == "right":
        x = width - 1
        for y in range(1, height - 1):
            cand.append((y, x))
    elif side == "any":
        for x in range(1, width - 1):
            cand.append((0, x))
            cand.append((height - 1, x))
        for y in range(1, height - 1):
            cand.append((y, 0))
            cand.append((y, width - 1))
    return cand


def place_doors(grid: List[List[str]], rules: Dict) -> List[Tuple[int, int]]:
    h = len(grid)
    w = len(grid[0])
    placed: List[Tuple[int, int]] = []
    door_coords = rules.get("door_coords")
    if isinstance(door_coords, list) and door_coords:
        for coord in door_coords:
            if not (isinstance(coord, (list, tuple)) and len(coord) == 2):
                continue
            y, x = int(coord[0]), int(coord[1])
            if 0 <= y < h and 0 <= x < w and (y == 0 or y == h - 1 or x == 0 or x == w - 1):
                grid[y][x] = "D"
                placed.append((y, x))
        return placed
    door_count = int(rules.get("door_count", 1))
    positions = rules.get("door_positions", ["top"])
    candidates = []
    for side in positions:
        candidates.extend(validate_perimeter_cells(w, h, side))
    candidates = sorted(set(candidates))
    if not candidates:
        return placed
    step = max(1, len(candidates) / door_count)
    for i in range(door_count):
        idx = int(round(i * step)) % len(candidates)
        y, x = candidates[idx]
        grid[y][x] = "D"
        placed.append((y, x))
    return placed


def place_shelves_strict(grid: List[List[str]], rules: Dict) -> List[Tuple[int, int]]:
    h = len(grid)
    w = len(grid[0])
    inner_y0, inner_x0 = 1, 1
    inner_h = h - 2
    inner_w = w - 2
    orientation = rules.get("shelf_orientation", "horizontal")
    min_walk = max(1, int(rules.get("min_walkway_width", 1)))
    thickness = max(1, int(rules.get("shelf_thickness", 1)))
    shelf_length = rules.get("shelf_length", "full")
    shelf_cells: List[Tuple[int, int]] = []
    for y in range(inner_y0, inner_y0 + inner_h):
        for x in range(inner_x0, inner_x0 + inner_w):
            if grid[y][x] not in ("W", "D"):
                grid[y][x] = " "
    if orientation == "horizontal":
        y = inner_y0
        while y <= inner_y0 + inner_h - 1:
            for wy in range(y, min(y + min_walk, inner_y0 + inner_h)):
                for x in range(inner_x0, inner_x0 + inner_w):
                    if grid[wy][x] == " ":
                        grid[wy][x] = "."
            y += min_walk
            if y > inner_y0 + inner_h - 1:
                break
            for sy in range(y, min(y + thickness, inner_y0 + inner_h)):
                if shelf_length == "full":
                    for x in range(inner_x0, inner_x0 + inner_w):
                        if grid[sy][x] == " ":
                            grid[sy][x] = "S"
                            shelf_cells.append((sy, x))
                else:
                    L = int(shelf_length)
                    if L <= 0:
                        continue
                    max_blocks = max(1, (inner_w + 1) // (L + 1))
                    used = max_blocks * L + max(0, max_blocks - 1) * 1
                    left_pad = max(0, (inner_w - used) // 2)
                    x0 = inner_x0 + left_pad
                    for b in range(max_blocks):
                        start = x0 + b * (L + 1)
                        for x in range(start, min(start + L, inner_x0 + inner_w)):
                            if grid[sy][x] == " ":
                                grid[sy][x] = "S"
                                shelf_cells.append((sy, x))
            y += thickness
    else:
        x = inner_x0
        while x <= inner_x0 + inner_w - 1:
            for wx in range(x, min(x + min_walk, inner_x0 + inner_w)):
                for y in range(inner_y0, inner_y0 + inner_h):
                    if grid[y][wx] == " ":
                        grid[y][wx] = "."
            x += min_walk
            if x > inner_x0 + inner_w - 1:
                break
            for sx in range(x, min(x + thickness, inner_x0 + inner_w)):
                if shelf_length == "full":
                    for y in range(inner_y0, inner_y0 + inner_h):
                        if grid[y][sx] == " ":
                            grid[y][sx] = "S"
                            shelf_cells.append((y, sx))
                else:
                    L = int(shelf_length)
                    if L <= 0:
                        continue
                    max_blocks = max(1, (inner_h + 1) // (L + 1))
                    used = max_blocks * L + max(0, max_blocks - 1) * 1
                    top_pad = max(0, (inner_h - used) // 2)
                    y0 = inner_y0 + top_pad
                    for b in range(max_blocks):
                        start = y0 + b * (L + 1)
                        for y in range(start, min(start + L, inner_y0 + inner_h)):
                            if grid[y][sx] == " ":
                                grid[y][sx] = "S"
                                shelf_cells.append((y, sx))
            x += thickness
    for y in range(inner_y0, inner_y0 + inner_h):
        for x in range(inner_x0, inner_x0 + inner_w):
            if grid[y][x] == " ":
                grid[y][x] = "."
    return shelf_cells


def compute_costs(grid: List[List[str]], catalog: Dict):
    counts = {"W": 0, "S": 0, "D": 0, ".": 0}
    for row in grid:
        for c in row:
            if c in counts:
                counts[c] += 1
    wall_cost = float(catalog.get("Wall", {}).get("unit_cost", 0))
    shelf_cost = float(catalog.get("Shelf", {}).get("unit_cost", 0))
    door_cost = float(catalog.get("Door", {}).get("unit_cost", 0))
    walkway_cost = float(catalog.get("Walkway", {}).get("unit_cost", 0))
    wall_total = counts["W"] * wall_cost
    shelf_total = counts["S"] * shelf_cost
    door_total = counts["D"] * door_cost
    walkway_total = counts["."] * walkway_cost
    total = wall_total + shelf_total + door_total + walkway_total
    bill_lines = []
    if counts["W"] > 0:
        bill_lines.append(("Walls", counts["W"], wall_cost, wall_total))
    if counts["S"] > 0:
        bill_lines.append(("Shelves", counts["S"], shelf_cost, shelf_total))
    if counts["D"] > 0:
        bill_lines.append(("Doors", counts["D"], door_cost, door_total))
    if counts["."] > 0:
        bill_lines.append(("Walkways", counts["."], walkway_cost, walkway_total))
    return bill_lines, total


def print_ascii(grid: List[List[str]]):
    print("ASCII Layout (W=Wall, S=Shelf, .=Walkway, D=Door):")
    for row in grid:
        print("".join(row))


def print_bill(bill_lines, total):
    print("\nItemized bill:")
    for name, units, unit_cost, subtotal in bill_lines:
        print(f"  {name:8s}  units: {units:5d}  unit cost: ${unit_cost:7.2f}  subtotal: ${subtotal:8.2f}")
    print("  " + "-" * 48)
    print(f"  TOTAL: ${total:,.2f}")


def generate_layout(width: int, height: int, catalog: Dict, rules: Dict):
    grid = make_grid(width, height, fill=" ")
    place_perimeter_walls(grid)
    place_doors(grid, rules)
    place_shelves_strict(grid, rules)
    bill_lines, total = compute_costs(grid, catalog)
    return grid, bill_lines, total


def main():
    parser = argparse.ArgumentParser(description="Generate layout blueprint for a grid.")
    parser.add_argument("--width", type=int, default=None, help="Grid width (columns)")
    parser.add_argument("--height", type=int, default=None, help="Grid height (rows)")
    parser.add_argument("--catalog", type=str, default=None, help="Path to build catalog JSON")
    parser.add_argument("--rules", type=str, default=None, help="Path to snapping rules JSON")
    parser.add_argument("--show-catalog", action="store_true", help="Print default catalog and exit")
    parser.add_argument("--show-rules", action="store_true", help="Print default rules and exit")
    args = parser.parse_args()

    catalog = load_json_maybe(args.catalog, DEFAULT_CATALOG)
    rules = load_json_maybe(args.rules, DEFAULT_RULES)

    grid_w = args.width if args.width is not None else int(rules.get("grid", {}).get("width", DEFAULT_RULES["grid"]["width"]))
    grid_h = args.height if args.height is not None else int(rules.get("grid", {}).get("height", DEFAULT_RULES["grid"]["height"]))

    if grid_w < 3 or grid_h < 3:
        print("Error: grid must be at least 3x3 to have an inner space.", file=sys.stderr)
        sys.exit(1)

    if args.show_catalog:
        print(json.dumps(catalog, indent=2))
        return
    if args.show_rules:
        print(json.dumps(rules, indent=2))
        return

    grid, bill_lines, total = generate_layout(grid_w, grid_h, catalog, rules)
    print_ascii(grid)
    print_bill(bill_lines, total)


if __name__ == "__main__":
    main()
