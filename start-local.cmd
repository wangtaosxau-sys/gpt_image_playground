@echo off
setlocal

cd /d "%~dp0"

echo [local] GPT Image Playground
echo [local] project: %CD%

where node >nul 2>nul
if errorlevel 1 (
  echo [local] Node.js was not found. Install Node.js, then run this file again.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [local] npm.cmd was not found. Reinstall Node.js, then run this file again.
  pause
  exit /b 1
)

if not exist package.json (
  echo [local] package.json was not found. Move this file back to the project root.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [local] dependencies are missing.
  echo [local] run: npm.cmd install
  pause
  exit /b 1
)

if exist dev-proxy.config.json (
  echo [local] dev proxy config: dev-proxy.config.json
) else (
  echo [local] dev proxy config: not found
  echo [local] copy dev-proxy.config.example.json to dev-proxy.config.json if you need /api-proxy.
)

if exist .env.local (
  echo [local] env: .env.local
) else (
  echo [local] env: not found
  echo [local] copy .env.local.example to .env.local if you need local overrides.
)

echo [local] starting Vite...
call npm.cmd run dev
set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo Local server exited with code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%
