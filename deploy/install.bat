@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0manage-windows.ps1" -Action Install
set "FU_EXIT=%ERRORLEVEL%"
pause
exit /b %FU_EXIT%
