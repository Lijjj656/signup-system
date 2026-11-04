@echo off
chcp 65001 >nul
title PostgreSQL 5433 - Signup System
echo ============================================
echo  启动本地数据库 (PostgreSQL 15, 端口 5433)
echo ============================================
"D:\thingsboard\postgresq1\bin\pg_ctl.exe" -D "D:\pgdata-signup" -l "D:\pgdata-signup\server.log" -o "-p 5433" -w start
echo.
if errorlevel 1 (
  echo 启动失败，请查看日志: D:\pgdata-signup\server.log
) else (
  echo 数据库已就绪，端口 5433
)
echo.
pause
