#!/bin/bash
set -e
cd "$(dirname "$0")/../.."
.venv/bin/python verify.py --send-email
