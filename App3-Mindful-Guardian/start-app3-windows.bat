@echo off
setlocal
set "APP3_LAUNCH_DIR=%~dp0"
pushd "%APP3_LAUNCH_DIR%"
if errorlevel 1 (
  echo Failed to enter launcher folder.
  echo If this is a network path, copy the App3-Mindful-Guardian folder to C:\App3-Mindful-Guardian and run again.
  pause
  exit /b 1
)

echo.
echo ==============================================
echo   App 3 AI Campus Mindful Guardian - Windows
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
      echo winget was not found. YOLO / emotion scan will fall back if Python is unavailable.
    )
  )
)

node scripts\start-app3.mjs
set "APP3_EXIT_CODE=%errorlevel%"

echo.
echo App3 stopped.
popd
pause
exit /b %APP3_EXIT_CODE%
