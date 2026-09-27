@echo off
setlocal EnableExtensions
title SUNODLAA - Android Auto test on PC (Desktop Head Unit)
echo.
echo   ============================================================
echo    SUNODLAA - test Android Auto on this PC
echo    (Google "Desktop Head Unit" emulator + your phone over USB)
echo   ============================================================
echo.

rem ---- 1. Android SDK -------------------------------------------------
set "SDK=%LOCALAPPDATA%\Android\Sdk"
if defined ANDROID_HOME if exist "%ANDROID_HOME%" set "SDK=%ANDROID_HOME%"
if not exist "%SDK%" goto :nosdk
echo   [OK] Android SDK: %SDK%

set "ADB=%SDK%\platform-tools\adb.exe"
set "DHU=%SDK%\extras\google\auto\desktop-head-unit.exe"

rem Java for sdkmanager: use the JDK bundled with Android Studio if none is set
if not defined JAVA_HOME if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"

set "SDKM="
if exist "%SDK%\cmdline-tools\latest\bin\sdkmanager.bat" set "SDKM=%SDK%\cmdline-tools\latest\bin\sdkmanager.bat"
if not defined SDKM for /d %%D in ("%SDK%\cmdline-tools\*") do if exist "%%D\bin\sdkmanager.bat" set "SDKM=%%D\bin\sdkmanager.bat"

rem ---- 2. Install what is missing ----------------------------------------
if exist "%ADB%" goto :haveadb
call :install "platform-tools"
if not exist "%ADB%" goto :end
:haveadb
echo   [OK] adb found

if exist "%DHU%" goto :havedhu
call :install "extras;google;auto"
if not exist "%DHU%" goto :end
:havedhu
echo   [OK] Desktop Head Unit found

rem ---- 3. Phone ----------------------------------------------------------
echo.
echo   Checklist on the phone - only needed once:
echo     1. Android Auto installed and opened at least once
echo     2. Android Auto settings - tap "Version" 10 times - developer mode
echo     3. Menu - "Start head unit server"
echo     4. USB debugging enabled, phone plugged in and authorized
echo.
echo   Connected devices:
"%ADB%" devices
"%ADB%" forward tcp:5277 tcp:5277
if errorlevel 1 goto :noforward
echo   [OK] Port 5277 forwarded

rem ---- 4. Start ----------------------------------------------------------
echo   [..] Starting the Desktop Head Unit - pick SUNODLAA in its launcher.
start "Desktop Head Unit" /d "%SDK%\extras\google\auto" "%DHU%"
goto :end

rem ------------------------------------------------------------------------
:install
if defined SDKM goto :doinstall
echo.
echo   [X] Missing SDK component: %~1
echo       Android Studio - Settings - Languages and Frameworks - Android SDK
echo       - "SDK Tools" tab - tick "Android SDK Command-line Tools" and
echo       "Android Auto Desktop Head Unit Emulator" - Apply. Then run me again.
exit /b 1
:doinstall
echo.
echo   [..] Installing %~1 with sdkmanager...
echo        Type y then Enter to accept Google's license when asked.
call "%SDKM%" --install "%~1"
exit /b %errorlevel%

:nosdk
echo   [X] Android SDK not found in %SDK%
echo       Install Android Studio once, or set the ANDROID_HOME variable.
goto :end

:noforward
echo   [X] adb could not reach the phone.
echo       Is it plugged in, with USB debugging allowed on the phone screen?
goto :end

:end
echo.
pause
