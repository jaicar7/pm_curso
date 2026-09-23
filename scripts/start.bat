@echo off
setlocal

set PROJECT_ROOT=%~dp0..
cd /d "%PROJECT_ROOT%\backend"

where python >nul 2>nul
if errorlevel 1 (
  echo python is required to start the app.
  exit /b 1
)

python -c "import fastapi" >nul 2>nul
if errorlevel 1 (
  echo Installing backend dependencies...
  python -m pip install -r requirements.txt
)

start "Project Management MVP" /B python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

for /L %%i in (1,1,20) do (
  curl -fsS http://127.0.0.1:8000/api/health >nul 2>nul
  if not errorlevel 1 (
    echo Backend is running on http://127.0.0.1:8000
    curl -fsS http://127.0.0.1:8000/
    exit /b 0
  )
  timeout /t 1 >nul
)

echo Backend did not start successfully.
exit /b 1
