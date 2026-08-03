@echo off
title CGV IMAX API Watcher - One Time Check
chcp 65001 >nul
cd /d "%~dp0\..\.."
".venv\Scripts\python.exe" "run.py" --once
pause
