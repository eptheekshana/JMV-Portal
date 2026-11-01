#!/usr/bin/env bash
# Quick startup script for Jayakody Maha Vidyalaya School Database Portal

PORT=${PORT:-8000}
echo "================================================================="
echo " Starting Jayakody Maha Vidyalaya Database Management Portal"
echo " School Colors: Royal Maroon & Academic Gold"
echo " URL: http://localhost:${PORT}"
echo "================================================================="

exec python3 server.py

