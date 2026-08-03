@echo off
title CGV IMAX API Watcher - Verify
chcp 65001 >nul
cd /d "%~dp0\..\.."
".venv\Scripts\python.exe" "verify.py"
pause
