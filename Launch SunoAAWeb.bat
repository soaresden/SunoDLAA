@echo off
title SunoAAWeb - SUNODLAA desktop
cd /d "%~dp0desktop"
echo.
echo   ============================================================
echo    SunoAAWeb  -  browse, download and tag your Suno library
echo   ============================================================
echo.
echo   Your browser opens by itself in a few seconds.
echo   Keep this window open. Close it to stop SunoAAWeb.
echo   (If an older SunoAAWeb window is still open, this one replaces it.)
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0desktop\server.ps1"
echo.
echo   Server stopped.
pause
