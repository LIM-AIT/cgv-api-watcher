#!/bin/bash
set -e
cd "$(dirname "$0")/../.."

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3.11 or later is required."
  echo "Install with Homebrew: brew install python"
  exit 1
fi

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt

if [ ! -f ".env" ]; then
  cp .env.example .env
fi

echo "Setup completed."
