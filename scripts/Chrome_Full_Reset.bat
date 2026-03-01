@echo off
setlocal EnableDelayedExpansion
title Chrome FULL Reset - Nuclear Option
color 0C

:: ============================================================
:: Chrome FULL RESET - Deletes EVERYTHING including bookmarks
:: Use when Chrome is completely broken. Run as Administrator.
:: ============================================================

echo.
echo  ============================================
echo   CHROME FULL RESET - NUCLEAR OPTION
echo  ============================================
echo.
echo  WARNING: This will delete ALL Chrome data:
echo    - Bookmarks, saved passwords, extensions
echo    - All profiles, cache, cookies, history
echo    - Chrome will start as if freshly installed
echo.
set /p confirm="Type YES to continue: "
if /i not "%confirm%"=="YES" (
    echo Aborted.
    pause
    exit /b 0
)

echo.
echo [1/3] Closing Chrome...
taskkill /F /IM chrome.exe >nul 2>&1
taskkill /F /IM "Google Chrome.exe" >nul 2>&1
taskkill /F /IM "chrome_proxy.exe" >nul 2>&1
taskkill /F /IM "GoogleCrashHandler*.exe" >nul 2>&1
timeout /t 3 /nobreak >nul

echo [2/3] Deleting entire Chrome User Data folder...
set "ChromeDir=%LOCALAPPDATA%\Google\Chrome\User Data"

if exist "%ChromeDir%" (
    rd /s /q "%ChromeDir%" 2>nul
    if exist "%ChromeDir%" (
        echo     [!] Some files locked. Trying again...
        timeout /t 2 /nobreak >nul
        rd /s /q "%ChromeDir%" 2>nul
    )
    if exist "%ChromeDir%" (
        echo     [X] Could not delete - close all Chrome windows and run as Administrator
        pause
        exit /b 1
    ) else (
        echo     [OK] User Data deleted
    )
) else (
    echo     Chrome User Data not found
)

echo [3/3] Cleaning Chrome temp...
if exist "%LOCALAPPDATA%\Google\Chrome\Temp" (
    rd /s /q "%LOCALAPPDATA%\Google\Chrome\Temp" 2>nul
)

echo.
echo  ============================================
echo   FULL RESET COMPLETE
echo  ============================================
echo   Chrome will start fresh on next launch.
echo.
pause
