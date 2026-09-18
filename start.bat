@echo off
cd /d "%~dp0"
echo.
echo  FormalizaAI MVP + Asistente IA (xAI)
echo  ------------------------------------
echo  Abriendo en http://localhost:8080
echo  Si tienes XAI_API_KEY en .env, el chat usa Grok.
echo  (Ctrl+C para detener)
echo.
if not exist ".env" if exist ".env.example" (
  echo  Tip: copia .env.example a .env y pega tu clave de https://console.x.ai
  echo.
)
start http://localhost:8080
python server.py
if errorlevel 1 (
  echo.
  echo  server.py falló. Intentando servidor estático simple (sin API IA)...
  python -m http.server 8080
  if errorlevel 1 (
    echo Python no disponible. Intentando con npx serve...
    npx --yes serve -l 8080
  )
)
