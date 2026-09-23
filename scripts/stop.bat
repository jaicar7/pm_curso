@echo off
setlocal

for /f %%p in ('tasklist /nh /fi "imagename eq python.exe" /fo csv ^| findstr /I "uvicorn"') do (
  if not "%%~p"=="" (
    taskkill /F /IM python.exe >nul 2>nul
    echo Backend stopped.
    exit /b 0
  )
)

echo No backend process found.
exit /b 0
