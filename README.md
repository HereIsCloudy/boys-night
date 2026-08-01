# Storage Hunters 3D Builder

This repository is a browser-based 3D warehouse layout builder inspired by storage game building mechanics.

## Files

- `index.html` — Interactive homepage and 3D builder interface.
- `style.css` — Responsive UI styling and polished page visuals.
- `app.js` — Three.js scene, precision grid placement, edge-based wall building, and export logic.

## Usage

Open `index.html` directly in your browser or visit the GitHub Pages site to use the builder. The site is fully client-side and does not require a server.

If you want the site published automatically, this repository includes a GitHub Actions workflow (in `.github/workflows/pages.yml`) that will publish the site to GitHub Pages on every push to the `main` branch. Make sure Pages is enabled in Settings → Pages and set to use the `gh-pages` or `main` branch as appropriate (this workflow publishes via the official Pages deploy action).

### Features

- 3D grid preview with orbit camera controls.
- Build walls along grid lines, place doors in wall segments, and paint walkways.
- Auto-generate polished layouts and custom design patterns.
- Live cost summary and ASCII-style layout preview.

## Controls

- `Apply size` — Update the grid dimensions.
- `Auto generate` — Create an automatic layout using the current grid settings.
- `Reset board` — Restore the default empty 12×18 layout.

## Notes

This project focuses on a browser-native 3D builder experience for GitHub Pages.
