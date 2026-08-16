@echo off
REM Wrapper so the plugin pre-sync setting can be a single path, matching macOS
REM /opt/homebrew/bin/kindle-sync. See scripts/kindle-sync.ps1.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0kindle-sync.ps1" %*
exit /b %ERRORLEVEL%
