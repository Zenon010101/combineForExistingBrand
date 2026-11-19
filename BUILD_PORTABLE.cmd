@echo off
setlocal
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found. Install or use portable Node.js with npm, then retry.
  pause
  exit /b 1
)
call npm install
if errorlevel 1 goto fail
call npm run validate
if errorlevel 1 goto fail
call npm run build:portable
if errorlevel 1 goto fail
echo.
echo SUCCESS: Find the portable Windows EXE in the dist folder.
pause
exit /b 0
:fail
echo.
echo BUILD FAILED. See the errors above.
pause
exit /b 1
