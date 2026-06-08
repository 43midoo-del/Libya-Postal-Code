@echo off
chcp 65001 >nul
cd /d "%~dp0"
REM If MySQL root has a password, uncomment and set it (or set the same in config\database.php):
REM set DB_PASSWORD=your_password_here
echo Starting PHP dev server at http://127.0.0.1:8080
echo Press Ctrl+C to stop.
php -S 127.0.0.1:8080 -t .
pause
