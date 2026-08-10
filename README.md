# RHS Installs Playbook

Offline-capable playbook for DAY1, DAY2, and DAY3 5V5 installs.

## Features

- Tile for each install PDF (DAY1 / DAY2 / DAY3 5V5)
- Search by color + number: `BLUE3`, `ORANGE22`, `BROWN26`, `pink27`
- Tap a play to view the diagram full-screen
- Works offline after the first load (PWA service worker caches pages, images, and PDFs)

## Run it

From this folder:

```bash
npx --yes serve -l 5173
```

Then open [http://localhost:5173](http://localhost:5173).

On a phone on the same Wi‑Fi, use your computer’s IP, e.g. `http://192.168.x.x:5173`.

For offline / home-screen use: open the site once online, then use the browser **Add to Home Screen** / **Install** option.

## Refresh plays later

If you get new PDFs, replace the source files and re-run:

```bash
python ..\scripts\build_playbook.py
```

(or the build script in the repo root if present)
