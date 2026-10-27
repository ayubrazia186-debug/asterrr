@echo off
rem Starts Aster on this computer so a tablet or phone on the same Wi-Fi can use your folders.
rem 1. Edit LIBRARY below to your course folder.   2. Double-click this file.
set LIBRARY=D:\ZAINEMETICS CRASHCOURSE
cd /d "%~dp0"
if not exist node_modules ( call npm install )
if not exist dist ( call npm run build )
node tools\serve.mjs "%LIBRARY%" --port 5174
pause
