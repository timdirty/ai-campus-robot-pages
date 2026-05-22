# GitHub Pages Demo

This workspace can publish App2 and App3 together as a static online practice demo.

## Build

```powershell
node scripts/build-github-pages.mjs
```

The script writes the deployable site to `docs/`.

## GitHub Pages Setting

Set GitHub Pages source to:

- Branch: your deployed branch
- Folder: `/docs`

## Routes

- Portal: `/`
- App2: `/app2/`
- App2 Robot Display: `/app2/robot-display.html`
- App3: `/app3/`
- App3 Robot Display: `/app3/robot-display.html`

## Static Demo Behavior

The build enables:

- `VITE_STATIC_DEMO=1`
- `VITE_AI_PROXY_DISABLED=1`

Hardware, bridge, WebSocket, and proxy-only AI calls are replaced with browser-safe demo fallbacks. Camera and microphone still require the browser's permission prompt and work best on HTTPS, which GitHub Pages provides.
