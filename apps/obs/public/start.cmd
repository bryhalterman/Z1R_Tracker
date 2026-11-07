@echo off
REM Serves the Z1R Tracker OBS pages on a local http origin. Requires Node.js:
REM the pages are module scripts, which do not load from file://, and the
REM docks and the overlay only sync when they share one http origin.
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Node.js was not found. Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)
node serve.mjs %*
