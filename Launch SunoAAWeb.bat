@echo off
title SunoAAWeb - SUNODLAA desktop
cd /d "%~dp0desktop"
echo.
echo   ============================================================
echo    SunoAAWeb  -  browse, download and tag your Suno library
echo   ============================================================
echo.
echo   Opening http://localhost:8787 in your browser...
echo   Keep this window open. Close it to stop the server.
echo.
start "" /min cmd /c "timeout /t 2 >nul & start "" http://localhost:8787/"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0desktop\server.ps1"
echo.
echo   Server stopped.
pause
