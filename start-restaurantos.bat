@echo off
setlocal
cd /d "%~dp0"

title RestaurantOS Launcher

echo ==============================================
echo   Starting RestaurantOS...
echo ==============================================

if not exist "node_modules" (
  echo [Setup] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [Error] npm install failed.
    pause
    exit /b 1
  )
)

if not exist "apps\api\.env" if exist "apps\api\.env.example" (
  copy /Y "apps\api\.env.example" "apps\api\.env" >nul
  echo [Setup] Created apps\api\.env from .env.example
)

if not exist "apps\web\.env" if exist "apps\web\.env.example" (
  copy /Y "apps\web\.env.example" "apps\web\.env" >nul
  echo [Setup] Created apps\web\.env from .env.example
)

echo [Launch] Starting API and Web servers...
start "RestaurantOS Server" cmd /k "node start-server.js"

echo [Launch] Waiting for frontend to initialize...
timeout /t 4 /nobreak >nul

echo [Launch] Opening http://localhost:5173 in your browser...
start "" "http://localhost:5173"

echo.
echo RestaurantOS is running. Close the "RestaurantOS Server" window to stop the servers.
endlocal
