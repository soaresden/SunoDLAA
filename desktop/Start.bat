@echo off
title SUNODLAA - desktop
cd /d "%~dp0"
echo.
echo   Starting SUNODLAA desktop server...
echo   (keep this window open - close it to stop)
echo.
rem Open the browser after 2 s while the server starts
start "" /min cmd /c "timeout /t 2 >nul & start "" http://localhost:8787/"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
echo.
echo   Server stopped.
pause
