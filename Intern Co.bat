@echo off
rem Opens Intern Co. in its own window, without a terminal. Closing the window stops it.
rem (To see errors, run "python app\main.py" in a terminal instead.)
cd /d "%~dp0"
start "" pythonw app\main.py
