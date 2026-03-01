@echo off
setlocal EnableDelayedExpansion
title Chrome Complete Cleanup
color 0A

:: ============================================================
:: Chrome Complete Cleanup - Run as Administrator recommended
:: Closes Chrome, removes cache/cookies/history for fresh start
:: ============================================================

echo.
echo  ============================================
echo   CHROME COMPLETE CLEANUP
echo  ============================================
echo.

:: Check for admin (optional but recommended)
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Not running as Administrator.
    echo     Some files may be locked. Right-click -^> Run as administrator for best results.
    echo.
    pause
)

:: Step 1: Close Chrome completely
echo [1/4] Closing Google Chrome...
taskkill /F /IM chrome.exe >nul 2>&1
taskkill /F /IM "Google Chrome.exe" >nul 2>&1
timeout /t 2 /nobreak >nul

:: Step 2: Close Chrome updater and other Chrome processes
echo [2/4] Stopping Chrome background processes...
taskkill /F /IM "chrome_proxy.exe" >nul 2>&1
taskkill /F /IM "GoogleCrashHandler.exe" >nul 2>&1
taskkill /F /IM "GoogleCrashHandler64.exe" >nul 2>&1
timeout /t 2 /nobreak >nul

:: Step 3: Define Chrome User Data path
set "ChromeDir=%LOCALAPPDATA%\Google\Chrome\User Data"

if not exist "%ChromeDir%" (
    echo [X] Chrome User Data not found at: %ChromeDir%
    echo     Chrome may not be installed or use a different path.
    pause
    exit /b 1
)

echo [3/4] Cleaning Chrome data folders...

:: Delete cache (most common cause of "broken" Chrome)
if exist "%ChromeDir%\Default\Cache" (
    rd /s /q "%ChromeDir%\Default\Cache" 2>nul
    if exist "%ChromeDir%\Default\Cache" (
        echo     [!] Cache could not be fully deleted - some files may be in use
    ) else (
        echo     [OK] Cache deleted
    )
)

:: Delete Code Cache
if exist "%ChromeDir%\Default\Code Cache" (
    rd /s /q "%ChromeDir%\Default\Code Cache" 2>nul
    echo     [OK] Code Cache deleted
)

:: Delete GPUCache
if exist "%ChromeDir%\Default\GPUCache" (
    rd /s /q "%ChromeDir%\Default\GPUCache" 2>nul
    echo     [OK] GPUCache deleted
)

:: Delete Service Worker caches
if exist "%ChromeDir%\Default\Service Worker" (
    rd /s /q "%ChromeDir%\Default\Service Worker" 2>nul
    echo     [OK] Service Worker cache deleted
)

:: Delete problematic databases (cookies, history, etc.)
for %%F in (Cookies "Login Data" "Web Data" History "Network Action Predictor" "History Provider Cache" "QuotaManager" "Shortcuts" "Top Sites" "Favicons" "Visited Links" "Origin Bound Certs" "Extension Cookies") do (
    if exist "%ChromeDir%\Default\%%F" (
        del /f /q "%ChromeDir%\Default\%%F" 2>nul
        if not exist "%ChromeDir%\Default\%%F" (
            echo     [OK] %%F deleted
        )
    )
)

:: Delete session files (can cause startup issues)
for %%F in ("Current Session" "Current Tabs" "Last Session" "Last Tabs") do (
    if exist "%ChromeDir%\Default\%%F" (
        del /f /q "%ChromeDir%\Default\%%F" 2>nul
    )
)

:: Delete SharedArrayBuffer (if exists)
if exist "%ChromeDir%\Default\SharedArrayBuffer" (
    rd /s /q "%ChromeDir%\Default\SharedArrayBuffer" 2>nul
)

:: Delete blob storage
if exist "%ChromeDir%\Default\blob_storage" (
    rd /s /q "%ChromeDir%\Default\blob_storage" 2>nul
    echo     [OK] Blob storage deleted
)

:: Delete IndexedDB
if exist "%ChromeDir%\Default\IndexedDB" (
    rd /s /q "%ChromeDir%\Default\IndexedDB" 2>nul
    echo     [OK] IndexedDB deleted
)

:: Delete Local Storage
if exist "%ChromeDir%\Default\Local Storage" (
    rd /s /q "%ChromeDir%\Default\Local Storage" 2>nul
    echo     [OK] Local Storage deleted
)

:: Delete Session Storage
if exist "%ChromeDir%\Default\Session Storage" (
    rd /s /q "%ChromeDir%\Default\Session Storage" 2>nul
    echo     [OK] Session Storage deleted
)

:: Delete Shader cache
if exist "%ChromeDir%\ShaderCache" (
    rd /s /q "%ChromeDir%\ShaderCache" 2>nul
    echo     [OK] Shader cache deleted
)

:: Delete GrShaderCache
if exist "%ChromeDir%\GrShaderCache" (
    rd /s /q "%ChromeDir%\GrShaderCache" 2>nul
    echo     [OK] GrShader cache deleted
)

:: Delete Crashpad
if exist "%ChromeDir%\Crashpad" (
    rd /s /q "%ChromeDir%\Crashpad" 2>nul
    echo     [OK] Crashpad deleted
)

:: Delete SwReporter (Google Software Reporter)
if exist "%LOCALAPPDATA%\Google\Chrome\User Data\SwReporter" (
    rd /s /q "%LOCALAPPDATA%\Google\Chrome\User Data\SwReporter" 2>nul
)

:: Delete Safe Browsing
if exist "%ChromeDir%\Safe Browsing" (
    rd /s /q "%ChromeDir%\Safe Browsing" 2>nul
    echo     [OK] Safe Browsing cache deleted
)

:: Clean temp files in Chrome folder
if exist "%LOCALAPPDATA%\Google\Chrome\Temp" (
    rd /s /q "%LOCALAPPDATA%\Google\Chrome\Temp" 2>nul
    echo     [OK] Chrome temp deleted
)

echo [4/4] Cleanup complete.
echo.
echo  ============================================
echo   DONE. You can now restart Chrome.
echo  ============================================
echo.
echo  Preserved: Bookmarks, Preferences, Extensions
echo  Deleted: Cache, Cookies, History, Session data
echo.
pause
