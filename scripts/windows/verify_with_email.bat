@echo off
title CGV IMAX API Watcher - Verify With Email
chcp 65001 >nul
cd /d "%~dp0\..\.."
".venv\Scripts\python.exe" "verify.py" --send-email
pause
