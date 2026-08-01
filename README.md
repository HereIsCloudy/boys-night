# Layout Generator

This project contains a simple Python CLI for generating a layout blueprint for a rectangular grid based on snapping rules and a build catalog.

## Files

- `generate_layout.py` — CLI script that generates an ASCII layout and cost bill.
- `rules.json` — Default snapping rules and grid settings.
- `catalog.json` — Default item costs.

## Usage

Open `index.html` in your browser or visit the GitHub Pages site to use the interactive 3D layout builder. It now renders a clean 3D grid where you can place walls, shelves, walkways, doors, and erase objects with accurate grid snapping.

If you want to run the Python CLI generator instead, use:

```powershell
python generate_layout.py
```

To use custom catalog or rules files:

```powershell
python generate_layout.py --catalog catalog.json --rules rules.json
```

Override the command-line grid size:

```powershell
python generate_layout.py --width 16 --height 20
```

View defaults:

```powershell
python generate_layout.py --show-catalog
python generate_layout.py --show-rules
```
