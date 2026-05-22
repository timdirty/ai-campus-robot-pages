@echo off
setlocal
set "APP2_LAUNCH_DIR=%~dp0"
pushd "%APP2_LAUNCH_DIR%"
if errorlevel 1 (
  echo Failed to enter launcher folder.
  echo If this is a network path, copy the App2-Campus-Service-Robot folder to C:\App2-Campus-Service-Robot and run again.
  pause
  exit /b 1
)

echo.
echo ==============================================
echo   App 2 Campus Service Robot - Windows
echo ==============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Trying to install Node.js LTS with winget...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo winget was not found. Please install Node.js 20+ from:
    echo https://nodejs.org/
    start https://nodejs.org/
    pause
    exit /b 1
  )
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is still not available. Restart this window or sign out and try again.
  pause
  exit /b 1
)

where py >nul 2>nul
if errorlevel 1 (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python was not found. Trying to install Python with winget...
    where winget >nul 2>nul
    if not errorlevel 1 (
      winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
    ) else (
      echo winget was not found. YOLO will fall back to browser CV if Python is unavailable.
    )
  )
)

node scripts\start-app2.mjs
set "APP2_EXIT_CODE=%errorlevel%"

echo.
echo App2 stopped.
popd
pause
exit /b %APP2_EXIT_CODE%
