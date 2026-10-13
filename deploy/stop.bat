@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0manage-windows.ps1" -Action Stop
set "FU_EXIT=%ERRORLEVEL%"
pause
exit /b %FU_EXIT%
