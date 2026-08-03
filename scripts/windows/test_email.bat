@echo off
title CGV IMAX API Watcher - Email Test
chcp 65001 >nul
cd /d "%~dp0\..\.."
".venv\Scripts\python.exe" "run.py" --test-email
pause
