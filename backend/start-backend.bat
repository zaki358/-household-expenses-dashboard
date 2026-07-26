@echo off
cd /d "%~dp0"
set "PY=C:\Users\barub\AppData\Local\Python\pythoncore-3.14-64\python.exe"

"%PY%" -m uvicorn main:app --port 8000

echo.
echo [Backend stopped]
echo If this closed unexpectedly right after starting, port 8000 is likely
echo already in use by another process. Close it (Task Manager, or
echo   netstat -ano ^| findstr :8000
echo to find the PID, then End Task / taskkill /F /PID ^<pid^>) and try again.
echo.
pause
