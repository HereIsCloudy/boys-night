# Layout Generator

This project contains a simple Python CLI for generating a layout blueprint for a rectangular grid based on snapping rules and a build catalog.

## Files

- `generate_layout.py` — CLI script that generates an ASCII layout and cost bill.
- `rules.json` — Default snapping rules and grid settings.
- `catalog.json` — Default item costs.

## Usage

Run the generator with default rules:

```powershell
python generate_layout.py
```

Run using a custom catalog or rules file:

```powershell
python generate_layout.py --catalog catalog.json --rules rules.json
```

Override the grid size:

```powershell
python generate_layout.py --width 16 --height 20
```

View defaults:

```powershell
python generate_layout.py --show-catalog
python generate_layout.py --show-rules
```
