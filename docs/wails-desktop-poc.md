# Wails Desktop PoC

This document records the desktop shell feasibility check for the current Web app.

## Scope

Branch: `poc/wails-desktop`

Base commit: `63770dd`

Date: `2026-06-08`

Goal: evaluate whether Wails can host the existing Vite build later, without changing the Web mainline.

This PoC does not add a Wails project yet because the local desktop toolchain is not available.

## Local Environment

OS: Windows 10.0.19045.7184

Node: `v24.12.0`

npm: `11.6.2`

Go: not found in `PATH`

Wails CLI: not found in `PATH`

WebView2: not detected by the local directory and registry probes used in this check. The final source of truth should be `wails doctor` after Wails is installed.

## Commands Run

```cmd
cmd.exe /c node --version
cmd.exe /c npm.cmd --version
cmd.exe /c go version
cmd.exe /c wails version
cmd.exe /c wails doctor
cmd.exe /c wails dev
cmd.exe /c wails build
cmd.exe /c dir "%ProgramFiles(x86)%\Microsoft\EdgeWebView\Application"
cmd.exe /c reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9C2BB04}" /v pv
```

Results:

- `go version` failed because `go` is not recognized.
- `wails version`, `wails doctor`, `wails dev`, and `wails build` failed because `wails` is not recognized.
- The WebView2 directory probe did not find the target path.
- The WebView2 registry probe did not find the target key or value.

## Status

Status: `BLOCKED_TOOLCHAIN`

Blocked by:

- Go is not installed or not in `PATH`.
- Wails CLI is not installed or not in `PATH`.
- WebView2 was not detected by the local probes.

Decision: do not scaffold Wails files on this branch until `wails doctor` can run.

## Official References

- Wails installation: https://wails.io/docs/gettingstarted/installation
- Wails CLI reference: https://wails.io/docs/v2.9.0/reference/cli
- Wails development command: https://wails.io/docs/v2.11.0/gettingstarted/development
- Wails build command: https://wails.io/docs/gettingstarted/building

The Wails installation guide lists Go and npm as common dependencies, Windows WebView2 as a platform dependency, `go install github.com/wailsapp/wails/v2/cmd/wails@latest` as the CLI installation command, and `wails doctor` as the system check.

## Files Policy

Files that may exist only on a future Wails PoC branch:

- `wails.json`
- `go.mod`
- `go.sum`
- `main.go`
- `app.go`
- `build/**`
- `wailsjs/**`
- Wails-only package scripts, if needed for the PoC

Files that should not be merged into the Web mainline:

- Wails Go backend files
- generated Wails bindings
- desktop installer output
- package scripts that make Web build or tests depend on Go, Wails, or WebView2
- any direct import of Wails runtime from shared Web code

Files that are safe to carry back later:

- docs that describe desktop boundaries and validation results
- platform-neutral notes for a future `runtimeHost` boundary

## Next Action

Install and verify the local toolchain:

```cmd
go version
go install github.com/wailsapp/wails/v2/cmd/wails@latest
wails version
wails doctor
```

After `wails doctor` passes, create a new Wails PoC branch from the current Web/PWA branch and validate:

```cmd
npm.cmd run test
npm.cmd run build
node scripts/local-smoke-check.mjs
git diff --check
wails dev
wails build
```

Acceptance criteria:

- Web tests and build remain independent from Wails.
- The desktop shell loads the same Vite build output.
- No private endpoint, credential, or local-only provider default is added.
- No Wails-specific code lands in the shared Web runtime without a platform boundary.
