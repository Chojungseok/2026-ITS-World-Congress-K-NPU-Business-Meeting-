@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is required. Please install Node.js 20 or newer.
  echo https://nodejs.org/
  pause
  exit /b 1
)
echo K-NPU Connect - local preview
echo Keep this window open while using the website.
echo Press Ctrl+C to stop the local server.
echo.
node scripts\serve.mjs --open
if errorlevel 1 pause
