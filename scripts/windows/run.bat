@echo off
title CGV IMAX API Watcher
chcp 65001 >nul
cd /d "%~dp0\..\.."
".venv\Scripts\python.exe" "run.py"
pause
