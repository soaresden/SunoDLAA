@echo off
title SUNODLAA - rename Suno folders
rem Renames your workspace folders to the format set in SunoAAWeb (default "Suno - {workspace}").
rem Shows the list first and asks before changing anything. You can also drop a folder on this file.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0desktop\rename-folders.ps1" %*
echo.
pause
