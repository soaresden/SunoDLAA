@echo off
setlocal EnableExtensions
title SUNODLAA - Android Auto test on PC (Desktop Head Unit)
echo.
echo   ============================================================
echo    SUNODLAA - test Android Auto on this PC
echo    Google "Desktop Head Unit" emulator + your phone over USB
echo    No Android Studio needed.
echo   ============================================================
echo.

set "TOOLS=%LOCALAPPDATA%\SUNODLAA\dhu"
set "DHU_URL=https://dl.google.com/android/repository/desktop-head-unit-windows-x64_r02.0.zip"
set "DHU_SHA1=680418d5aca256cce151eb7f9527294e95b6bb8a"
set "PT_URL=https://dl.google.com/android/repository/platform-tools-latest-windows.zip"
set "SDK=%LOCALAPPDATA%\Android\Sdk"
if defined ANDROID_HOME set "SDK=%ANDROID_HOME%"
if not exist "%TOOLS%" mkdir "%TOOLS%"

rem ---- 1. adb : Android SDK, PATH (Minimal ADB...), usual folders, or our copy
set "ADB="
if exist "%SDK%\platform-tools\adb.exe" set "ADB=%SDK%\platform-tools\adb.exe"
if not defined ADB for /f "delims=" %%A in ('where adb 2^>nul') do if not defined ADB set "ADB=%%A"
if not defined ADB if exist "%ProgramFiles(x86)%\Minimal ADB and Fastboot\adb.exe" set "ADB=%ProgramFiles(x86)%\Minimal ADB and Fastboot\adb.exe"
if not defined ADB if exist "%ProgramFiles%\Minimal ADB and Fastboot\adb.exe" set "ADB=%ProgramFiles%\Minimal ADB and Fastboot\adb.exe"
if not defined ADB if exist "%TOOLS%\platform-tools\adb.exe" set "ADB=%TOOLS%\platform-tools\adb.exe"
if defined ADB goto :haveadb
echo   [!] adb not found.
choice /c YN /m "   Download Google platform-tools (adb, about 7 MB) now"
if errorlevel 2 goto :end
call :download "%PT_URL%" "%TOOLS%\pt.zip" || goto :dlfail
powershell -NoProfile -Command "Expand-Archive -Force '%TOOLS%\pt.zip' '%TOOLS%'" || goto :dlfail
del "%TOOLS%\pt.zip" >nul 2>&1
set "ADB=%TOOLS%\platform-tools\adb.exe"
if not exist "%ADB%" goto :dlfail
:haveadb
echo   [OK] adb: %ADB%

rem ---- 2. Desktop Head Unit : Android SDK copy, or our own copy, or download it
set "DHU="
if exist "%SDK%\extras\google\auto\desktop-head-unit.exe" set "DHU=%SDK%\extras\google\auto\desktop-head-unit.exe"
if not defined DHU if exist "%TOOLS%\desktop-head-unit.exe" set "DHU=%TOOLS%\desktop-head-unit.exe"
if defined DHU goto :havedhu
echo.
echo   [!] The Desktop Head Unit is not installed yet.
echo       It is Google's official car-screen emulator, about 7 MB, from dl.google.com.
echo       It is covered by the Android SDK license: https://developer.android.com/studio/terms
choice /c YN /m "   Download it into %TOOLS%"
if errorlevel 2 goto :end
call :download "%DHU_URL%" "%TOOLS%\dhu.zip" || goto :dlfail
powershell -NoProfile -Command "if ((Get-FileHash -Algorithm SHA1 -LiteralPath '%TOOLS%\dhu.zip').Hash -ne '%DHU_SHA1%') { exit 1 }"
if errorlevel 1 goto :badhash
powershell -NoProfile -Command "Expand-Archive -Force '%TOOLS%\dhu.zip' '%TOOLS%'" || goto :dlfail
del "%TOOLS%\dhu.zip" >nul 2>&1
set "DHU=%TOOLS%\desktop-head-unit.exe"
if not exist "%DHU%" goto :dlfail
:havedhu
echo   [OK] Desktop Head Unit: %DHU%

rem ---- 2b. Car screen to simulate --------------------------------------------
echo.
echo   Car screen to simulate:
echo     1. Mazda MX-5 2024+  - 8.8 inch widescreen, 1280x480  [default]
echo     2. Classic 7 inch    - 800x480, older Mazda / most cars
echo     3. Large Full HD     - 1920x1080
choice /c 123 /n /t 15 /d 1 /m "   Your choice 1-3, automatic 1 in 15 s: "
set "SCREEN=%errorlevel%"
set "RES=1280x720" & set "MH=240" & set "DPI=160" & set "CTRL=true" & set "NAME=Mazda MX-5 2024+ 1280x480"
if "%SCREEN%"=="2" (set "RES=800x480" & set "MH=" & set "DPI=160" & set "CTRL=true" & set "NAME=7 inch 800x480")
if "%SCREEN%"=="3" (set "RES=1920x1080" & set "MH=" & set "DPI=240" & set "CTRL=false" & set "NAME=Full HD 1920x1080")
set "INI=%TOOLS%\sunodlaa-screen.ini"
> "%INI%" echo [general]
>>"%INI%" echo touch = true
>>"%INI%" echo touchpad = false
>>"%INI%" echo controller = %CTRL%
>>"%INI%" echo instrumentcluster = false
>>"%INI%" echo resolution = %RES%
if defined MH >>"%INI%" echo marginheight = %MH%
>>"%INI%" echo dpi = %DPI%
>>"%INI%" echo framerate = 30
>>"%INI%" echo.
>>"%INI%" echo [sensors]
>>"%INI%" echo location = true
>>"%INI%" echo night_mode = true
>>"%INI%" echo driving_status = true
echo   [OK] Screen: %NAME%

rem ---- 3. Phone ------------------------------------------------------------
echo.
echo   Checklist on the phone - only needed once:
echo     1. Android Auto installed and opened at least once
echo     2. Android Auto settings - tap "Version" 10 times - developer mode
echo     3. Top-right menu - "Start head unit server"
echo     4. USB debugging enabled, phone plugged in and authorized
echo.
:forward
echo   Connected devices:
"%ADB%" devices
"%ADB%" forward tcp:5277 tcp:5277
if errorlevel 1 goto :noforward
echo   [OK] Port 5277 forwarded to the phone

rem ---- 4. Start --------------------------------------------------------------
for %%F in ("%DHU%") do set "DHUDIR=%%~dpF"
set "DHUDIR=%DHUDIR:~0,-1%"
echo   [..] Starting the Desktop Head Unit - pick SUNODLAA on the car screen.
start "Desktop Head Unit" /d "%DHUDIR%" "%DHU%" -c "%INI%"
goto :end

rem ------------------------------------------------------------------------------
:download
echo   [..] Downloading %~1
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest -UseBasicParsing -Uri '%~1' -OutFile '%~2'"
if not exist "%~2" exit /b 1
exit /b 0

:dlfail
echo   [X] Download or extraction failed. Check your internet connection and run me again.
goto :end

:badhash
echo   [X] The downloaded file does not match Google's checksum - deleted, nothing installed.
del "%TOOLS%\dhu.zip" >nul 2>&1
goto :end

:noforward
echo   [X] adb could not reach the phone.
echo       Is it plugged in, with USB debugging allowed on the phone screen?
if /i "%ADB%"=="%TOOLS%\platform-tools\adb.exe" goto :end
echo       Your adb may also be too old for this phone - Minimal ADB often is.
choice /c YN /m "   Retry with Google's latest adb, about 7 MB"
if errorlevel 2 goto :end
if exist "%TOOLS%\platform-tools\adb.exe" goto :useptadb
call :download "%PT_URL%" "%TOOLS%\pt.zip" || goto :dlfail
powershell -NoProfile -Command "Expand-Archive -Force '%TOOLS%\pt.zip' '%TOOLS%'" || goto :dlfail
del "%TOOLS%\pt.zip" >nul 2>&1
:useptadb
set "ADB=%TOOLS%\platform-tools\adb.exe"
if not exist "%ADB%" goto :dlfail
echo   [OK] adb: %ADB%
goto :forward

:end
echo.
pause
