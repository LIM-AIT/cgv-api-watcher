@echo off
title CGV IMAX API Watcher Setup
chcp 65001 >nul
cd /d "%~dp0\..\.."

where py >nul 2>nul
if errorlevel 1 (
  echo Python 3.11 or later is required.
  pause
  exit /b 1
)

if not exist ".venv" py -m venv .venv
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r requirements.txt

if not exist ".env" copy ".env.example" ".env" >nul

echo Setup completed.
pause
