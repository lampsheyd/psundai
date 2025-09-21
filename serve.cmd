@echo off
cd /d "%~dp0"
start "" http://localhost:5000/index.html
py -m http.server 5000
pause
