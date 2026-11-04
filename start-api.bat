@echo off
chcp 65001 >nul
title API Server - Signup System
cd /d "%~dp0"
echo ============================================
echo  启动 API 服务 (http://localhost:3000)
echo  改代码会自动重启
echo ============================================
echo.
npm run dev
pause
