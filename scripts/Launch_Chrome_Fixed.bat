@echo off
:: Launches Chrome with GPU disabled - fixes blank pages and unclickable links
:: Use this when Chrome is broken. Pin to taskbar for easy access.
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --disable-gpu --disable-software-rasterizer --disable-gpu-sandbox
