@echo off
setlocal

for %%i in ("%~dp0..") do set "PROJECT_ROOT=%%~fi"
set "NAME=pm-mvp"

docker build -t %NAME% "%PROJECT_ROOT%" || exit /b 1
docker rm -f %NAME% >nul 2>nul
if not exist "%PROJECT_ROOT%\data" mkdir "%PROJECT_ROOT%\data"
docker run -d --name %NAME% -p 8000:8000 --env-file "%PROJECT_ROOT%\.env" -v "%PROJECT_ROOT%\data:/app/data" %NAME% >nul || exit /b 1

for /L %%i in (1,1,30) do (
  curl -fsS http://127.0.0.1:8000/api/health >nul 2>nul
  if not errorlevel 1 (
    echo App is running on http://127.0.0.1:8000
    exit /b 0
  )
  ping -n 2 127.0.0.1 >nul
)

echo App did not start. Check: docker logs %NAME%
exit /b 1
