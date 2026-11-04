@echo off
chcp 65001 >nul
title Stop PostgreSQL 5433
echo 正在停止数据库...
"D:\thingsboard\postgresq1\bin\pg_ctl.exe" -D "D:\pgdata-signup" -m fast stop
echo.
pause
