# Tool Hub PWA

Your personal offline toolbox. Upload `.html` files and launch them as apps — no server needed.

## Files

```
tool-hub/
├── index.html      — App shell & all UI
├── style.css       — Dark theme styles
├── app.js          — IndexedDB logic, all interactions
├── manifest.json   — PWA manifest
├── sw.js           — Service worker (offline + auto-update)
├── icons/
│   ├── icon-192.png   ← you must create this
│   └── icon-512.png   ← you must create this
└── README.md
```

## Setup for GitHub Pages

1. Create the `icons/` folder and add two PNG icons:
   - `icon-192.png` (192×192 px)
   - `icon-512.png` (512×512 px)

   **Quickest way:** use any online PWA icon generator (e.g. https://maskable.app/editor or https://realfavicongenerator.net) and export at those sizes. A simple dark purple square with the Tool Hub grid logo works great.

2. Push all files to a GitHub repo.

3. Go to **Settings → Pages**, set source to `main` branch / root.

4. Visit `https://yourusername.github.io/your-repo-name/` — Chrome/Android will offer "Add to Home Screen".

## Features

- Upload `.html` tools — stored raw in IndexedDB, nothing modified
- Custom icon per tool (PNG/JPG/WebP)
- Launch tools fullscreen in a sandboxed iframe with `srcdoc`
- Tools can use their own `localStorage` normally inside the iframe
- Rename, Update HTML, Change Icon, Delete
- Export all tools as a single `.json` backup
- Import backup (merges, no overwrite)
- Live search
- Full offline support via service worker
- Auto-update notification when new version is deployed

## Updating the App

Bump `CACHE_VERSION` in `sw.js` (e.g. `tool-hub-v2`) before pushing changes.
Users will see a toast: "Update available — reload to apply".
