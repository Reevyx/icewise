@echo off
rem ==========================================================================
rem  ASTRA - configurar el servidor de IA (Cloudflare Worker) en un solo paso.
rem  Ejecutalo desde la terminal de VS Code:  .\configurar-astra.bat
rem  o con doble clic. Usa Workers AI de Cloudflare: gratis y sin clave.
rem  Solo te pedira entrar en tu cuenta de Cloudflare la primera vez.
rem ==========================================================================
chcp 65001 >nul
title Configurar ASTRA
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0chatbot\servidor\configurar-astra.ps1"
echo.
pause
