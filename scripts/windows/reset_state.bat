@echo off
title CGV IMAX API Watcher - Reset State
chcp 65001 >nul
cd /d "%~dp0\..\.."
".venv\Scripts\python.exe" "run.py" --reset-state
pause
