@echo off
REM Runs Z1R Tracker on a local http origin so offline caching and OBS dock
REM sync both work. Requires Node.js. If you don't have Node, just open
REM index.html directly -- the tracker still works, minus offline caching.
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Node.js was not found. Open index.html directly instead.
  pause
  exit /b 1
)
node serve.mjs %*
