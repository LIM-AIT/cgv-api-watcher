#!/bin/bash
set -e
cd "$(dirname "$0")/../.."
.venv/bin/python run.py --test-email
