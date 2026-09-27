@echo off
REM ============================================================
REM  Launch the Desktop Head Unit (DHU) to test Android Auto
REM  without a car, with your phone plugged in over USB.
REM ============================================================
setlocal
title DHU - Android Auto

set "SDK=%LOCALAPPDATA%\Android\Sdk"
if not exist "%SDK%" if defined ANDROID_HOME set "SDK=%ANDROID_HOME%"
if not exist "%SDK%" (
  echo Android SDK not found. Open Android Studio once, or set ANDROID_HOME.
  pause & exit /b 1
)

set "DHU=%SDK%\extras\google\auto\desktop-head-unit.exe"
set "ADB=%SDK%\platform-tools\adb.exe"

if not exist "%DHU%" (
  echo.
  echo   DHU not found: %DHU%
  echo   Install it: Android Studio ^> SDK Manager ^> "SDK Tools" tab
  echo   ^> tick "Android Auto Desktop Head Unit Emulator" ^> Apply.
  echo.
  pause & exit /b 1
)

echo Forwarding port 5277...
"%ADB%" forward tcp:5277 tcp:5277
if errorlevel 1 (
  echo adb forward failed. Phone plugged in? USB debugging allowed?
  pause & exit /b 1
)

echo Starting DHU...
"%DHU%"
endlocal
