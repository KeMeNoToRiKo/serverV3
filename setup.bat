@echo off
set /p CONTINUE_START="Press Enter to start setup process..."
call npm init -y
echo.
set /p CONTINUE_INIT="npm init complete. Press Enter to continue..."

CLS
call npm install
echo.
set /p CONTINUE_INSTALL="npm install complete. Press Enter to close..."
