# Wails Desktop PoC

This directory is an isolated Wails proof of concept for the existing Web app.

It does not own a separate frontend. `wails build` runs the root Web build,
copies `../dist` into `frontend/dist`, and embeds that generated directory.

Useful commands:

```cmd
node scripts/build-web-assets.mjs
wails doctor
wails build -clean -nopackage -nocolour
```

Generated files under `frontend/dist`, `wailsjs`, and `build/bin` are not
committed.
