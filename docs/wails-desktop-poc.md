# Wails Desktop PoC

This document records the desktop shell feasibility check for the current Web app.

## Scope

Branch: `poc/wails-desktop`

Base commit: `63770dd`

Date: `2026-06-08`

Goal: evaluate whether Wails can host the existing Vite build without changing the Web mainline.

## Local Environment

OS: Windows 10 Pro for Workstations 22H2, build `19045`

Node: `v24.12.0`

npm: `11.6.2`

Go: `go1.26.4 windows/amd64`

Wails CLI: `v2.12.0`

WebView2 Runtime: `149.0.4022.52`

Current-shell note: the user PATH was updated, but existing terminals may still need an explicit PATH prefix for `%ProgramFiles%\Go\bin` and `%USERPROFILE%\go\bin` until reopened.

## Toolchain Setup

Chocolatey was used to install Go and WebView2 Runtime from an elevated shell.

Wails CLI was installed with:

```cmd
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

The system check passed:

```cmd
wails doctor
```

Result: `SUCCESS Your system is ready for Wails development!`

## PoC Structure

The Wails project is isolated under:

```text
desktop-wails/
```

This avoids overwriting or coupling the Web root files:

- `package.json`
- `package-lock.json`
- `src/`
- `public/`
- `vite.config.ts`
- `index.html`

The desktop PoC does not own a separate frontend. It builds the root Web app, copies `dist/` into `desktop-wails/frontend/dist`, and embeds that generated directory.

Generated outputs are ignored:

- `desktop-wails/frontend/dist`
- `desktop-wails/wailsjs`
- `desktop-wails/build/bin`

## Commands Run

```cmd
cmd.exe /c "%ProgramFiles%\Go\bin\go.exe" version
cmd.exe /c "%USERPROFILE%\go\bin\wails.exe" version
cmd.exe /c "%USERPROFILE%\go\bin\wails.exe" doctor
cmd.exe /c npm.cmd run build
cmd.exe /c node desktop-wails\scripts\build-web-assets.mjs
cmd.exe /c "cd desktop-wails && wails build -clean -nopackage -nocolour"
```

Results:

- `go version` reported `go1.26.4 windows/amd64`.
- `wails version` reported `v2.12.0`.
- `wails doctor` passed and detected WebView2 `149.0.4022.52`.
- Root Web build passed.
- `desktop-wails/scripts/build-web-assets.mjs` built the root Web app and synced it into `desktop-wails/frontend/dist`.
- `wails build -clean -nopackage -nocolour` passed.

Build output:

```text
desktop-wails/build/bin/gpt-image-playground-desktop.exe
```

Observed size: `40,900,608` bytes.

## Dev Mode Attempt

`wails dev -s -assetdir ..\dist -nocolour` was attempted as a limited smoke check.

The command did not return logs before the 45 second timeout, so it is not counted as a passed dev-mode verification. The remaining `wails.exe` process from that attempt was terminated.

## Status

Status: `BUILD_READY`

Desktop feasibility result:

- Wails toolchain is available.
- Wails can build a Windows desktop executable from the current Vite app output.
- The Web mainline does not need Wails dependencies.

Not production-ready yet:

- No installer configuration has been finalized.
- No Wails runtime host boundary has been added.
- No desktop credential store, file picker, notification, or native download adapter has been designed.
- `wails dev` still needs an interactive manual run after reopening the terminal so PATH refreshes normally.

## Next Action

Manual checks:

```cmd
cd desktop-wails
wails dev -s -assetdir ..\dist -nocolour
build\bin\gpt-image-playground-desktop.exe
```

Engineering follow-up:

- Define a `runtimeHost` boundary before adding desktop-only behavior.
- Keep Go/Wails code out of the Web mainline.
- Decide whether the first distributable should be a portable exe or an NSIS installer.
