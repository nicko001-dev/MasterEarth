@echo off
REM ======================================================================
REM MasterEarth - Local development launcher (ASCII only, no accents)
REM Usage: start.bat [api|web|world|both|health|stop]
REM
REM Reliability notes:
REM  - NO_PROXY is set so localhost calls never go through the system proxy.
REM  - The API is started with the venv python directly (activate.bat is not
REM    reliable when called from a PowerShell child process).
REM  - The API binds 0.0.0.0 so a LAN hostname can reach it too.
REM  - "health" probes every endpoint used by the live globe layers.
REM ======================================================================
setlocal EnableDelayedExpansion

set "NO_PROXY=localhost,127.0.0.1,::1"
set "no_proxy=localhost,127.0.0.1,::1"
set "ROOT=%~dp0"

if "%1"=="web" goto start_web
if "%1"=="api" goto start_api
if "%1"=="world" goto world_only
if "%1"=="health" goto health_check
if "%1"=="stop" goto stop_services

echo ========================================
echo MasterEarth - Demarrage automatise
echo ========================================

docker --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [1/4] PostgreSQL/PostGIS...
    docker compose up -d postgres >nul 2>&1
)

echo [2/4] Verification des fichiers .env...
if not exist "%ROOT%apps\api\.env" (
    if exist "%ROOT%apps\api\.env.example" copy "%ROOT%apps\api\.env.example" "%ROOT%apps\api\.env" >nul
)
if not exist "%ROOT%apps\web\.env" (
    if exist "%ROOT%apps\web\.env.example" copy "%ROOT%apps\web\.env.example" "%ROOT%apps\web\.env" >nul
)

echo [3/4] Migrations de base de donnees...
pushd "%ROOT%apps\api"
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" -m alembic upgrade head >nul 2>&1
)
popd

echo [4/4] Lancement des services...
goto start_both

:start_api
echo Demarrage de l'API backend...
pushd "%ROOT%apps\api"
if exist ".venv\Scripts\python.exe" (
    start "MasterEarth API" cmd /k "cd /d "%ROOT%apps\api" && ".venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
) else (
    start "MasterEarth API" cmd /k "cd /d "%ROOT%apps\api" && set PYTHONPATH=. && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
)
popd
echo API: http://localhost:8000  |  Docs: http://localhost:8000/docs
goto wait_and_check

:start_web
echo Demarrage du frontend Web...
pushd "%ROOT%apps\web"
start "MasterEarth Web" cmd /k "cd /d "%ROOT%apps\web" && npm run dev"
popd
call :launch_world
echo Web: http://localhost:5173
goto end

:start_both
pushd "%ROOT%apps\api"
if exist ".venv\Scripts\python.exe" (
    start "MasterEarth API" cmd /k "cd /d "%ROOT%apps\api" && ".venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
) else (
    start "MasterEarth API" cmd /k "cd /d "%ROOT%apps\api" && set PYTHONPATH=. && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
)
popd
pushd "%ROOT%apps\web"
start "MasterEarth Web" cmd /k "cd /d "%ROOT%apps\web" && npm run dev"
popd
call :launch_world
echo.
echo   API Backend      : http://localhost:8000
echo   Swagger UI       : http://localhost:8000/docs
echo   Frontend Web     : http://localhost:5173
echo   MasterEarth World: http://localhost:4173
goto wait_and_check

:wait_and_check
echo.
echo Attente de l'API (30 s max)...
set /a TRIES=0
:wait_loop
set /a TRIES+=1
curl -s --noproxy * -o nul "http://127.0.0.1:8000/health" >nul 2>&1
if %ERRORLEVEL% equ 0 goto api_ready
if %TRIES% geq 15 (
    echo WARNING: l'API ne repond pas encore. Verifiez la fenetre "MasterEarth API".
    goto end
)
timeout /t 2 /nobreak >nul
goto wait_loop

:api_ready
echo API prete. Verification des couches temps reel :
goto health_check

:health_check
if not "%1"=="health" echo.
for %%U in (^
 "http://127.0.0.1:8000/health" ^
 "http://127.0.0.1:8000/api/v1/sensors" ^
 "http://127.0.0.1:8000/api/v1/alerts" ^
 "http://127.0.0.1:8000/api/v1/weather" ^
 "http://127.0.0.1:8000/api/v1/weather/status" ^
 "http://127.0.0.1:8000/api/v1/weather/global-rain" ^
 "http://127.0.0.1:8000/api/v1/live/aircraft/global" ^
 "http://127.0.0.1:8000/api/v1/live/aircraft?west=-20&south=-10&east=20&north=20" ^
 "http://127.0.0.1:8000/api/v1/weather/viewport?west=-20&south=-10&east=20&north=20" ^
 "http://127.0.0.1:8000/api/v1/weather/radar/frames" ^
 "http://127.0.0.1:8000/api/v1/simulations/automatic" ^
) do (
    curl -s --noproxy * -o nul -w "  %%~U -> %%{http_code}\n" --max-time 20 "%%~U"
)
goto end

:world_only
call :launch_world
goto end

:launch_world
echo Demarrage d'MasterEarth World...
pushd "%ROOT%apps\world"
start "MasterEarth World" cmd /k "cd /d "%ROOT%apps\world" && npm run dev -- --host 127.0.0.1 --port 4173 --strictPort"
popd
exit /b 0

:stop_services
echo Arret des services MasterEarth...
taskkill /FI "WINDOWTITLE eq MasterEarth API*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq MasterEarth Web*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq MasterEarth World*" /F >nul 2>&1
echo - Fenetres de service fermees
goto end

:end
echo.
if not "%1"=="health" (
    echo Appuyez sur ENTREE pour fermer ce menu...
    pause >nul
)
endlocal
