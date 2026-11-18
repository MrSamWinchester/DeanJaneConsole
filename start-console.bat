@echo off
cd /d "%~dp0"
echo Dean Jane Console is running at http://localhost:8765/index.html
echo Keep this window open while you use the console. Close it to stop.
start "" "http://localhost:8765/index.html"
where py >nul 2>nul
if %errorlevel%==0 (py -m http.server 8765 --bind 127.0.0.1 & goto :eof)
where python >nul 2>nul
if %errorlevel%==0 (python -m http.server 8765 --bind 127.0.0.1 & goto :eof)
echo Python was not found. Install it from python.org, or just open console.html directly.
pause
