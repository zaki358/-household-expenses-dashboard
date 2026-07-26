@echo off
cd /d "%~dp0"
echo ============================================
echo   Kakei Dashboard 2 - starting up...
echo   Your browser will open automatically.
echo   To stop: press Ctrl+C or close this window.
echo ============================================
echo.

set "PY=C:\Users\barub\AppData\Local\Python\pythoncore-3.14-64\python.exe"

if not exist "%PY%" (
  echo [ERROR] Python not found at:
  echo   %PY%
  echo Python location may have changed. Ask your secretary for help.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm / Node.js not found on PATH.
  echo Please install Node.js, or ask your secretary for help.
  echo.
  pause
  exit /b 1
)

if not exist "frontend\node_modules" (
  echo Installing frontend dependencies - first run only...
  cd frontend
  call npm install
  cd /d "%~dp0"
  echo.
)

echo Starting backend (FastAPI) in this window...
pushd backend
start /b "" "%PY%" -m uvicorn main:app --port 8000
popd

echo Waiting for backend to start...
timeout /t 3 /nobreak >nul

echo Starting frontend (Vite) - browser will open shortly...
echo (Backend and frontend share this single window now.)
cd frontend
call npm run dev -- --open
cd /d "%~dp0"

echo.
echo Stopping backend...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo.
echo Dashboard stopped.
pause
