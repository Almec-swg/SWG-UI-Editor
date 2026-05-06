# SWG UI Editor

A desktop tool for editing Star Wars Galaxies UI layout files (`.inc`), focused on the Galaxy Map / Ticket Purchase screen.

## Features

- Load and parse SWG `.inc` XML UI files
- Visualize planet positions on an interactive 501×486 Galaxy Map canvas
- Render DDS background textures via WebGL (DXT1/DXT5)
- Drag planets to reposition them visually
- Add new planets via a modal dialog (display name, internal key, appearance template, size)
- Load custom planet images (`.png`, `.jpg`, etc.)
- Export modified XML back to SWG `.inc` format
- Copy exported XML to clipboard

## Getting Started

### Run in browser

Just open `SWG-UI-Editor/index.html` directly in a modern browser — no build step required.

### Run as desktop app (Electron)

1. Install dependencies:
   ```bash
   npm install
   ```

2. Launch:
   ```bash
   npm start
   ```

3. Build a Windows installer:
   ```bash
   npm run dist
   ```
   Output will be placed in a `dist-*` folder.

## Usage

1. Click the file input to load a `.inc` file (e.g. `ui_ticketpurchase.inc`).
2. Click **Parse** to populate the canvas and tables.
3. Drag planets on the map to reposition them.
4. Use **Add Planet** to add a new entry.
5. Click **Export** to generate updated XML, then **Copy XML** to copy it.
6. Paste the output back into your `.inc` file.

To change the starfield background, enter a `.dds` file path in the background input and click **Apply Background**.

## Project Structure

```
SWG-UI-Editor/          # Web app (HTML/CSS/JS)
  index.html
  load.js               # Parse, render, drag, export logic
  swgLayoutEngine.js    # SWG UI layout engine
  ddsBackground.js      # WebGL DDS background renderer
  ddsLoader.js          # DDS file parser
  ddsImage.js           # DDS texture helpers
  style.css
  assets/               # Default DDS assets
ui/                     # Sample .inc files
main.js                 # Electron main process
package.json
```

## Requirements

- Modern browser (Chrome/Edge/Firefox) for browser mode
- Node.js 18+ and npm for Electron mode

## License

ISC
