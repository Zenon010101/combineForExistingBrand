@echo off
setlocal
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found. Use a Node.js installation containing npm.
  pause
  exit /b 1
)
if not exist node_modules\electron (
  echo Installing project packages for the first run...
  call npm install
  if errorlevel 1 (pause & exit /b 1)
)
call npm start
if errorlevel 1 (pause & exit /b 1)
exit /b 0
