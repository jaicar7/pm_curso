@echo off
setlocal

docker rm -f pm-mvp >nul || exit /b 1
echo App stopped.
