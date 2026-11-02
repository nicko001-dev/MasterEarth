@echo off
REM IntelliFlood - Script de démarrage automatisé
REM Usage: start.bat [api|web|world|both|stop]

setlocal EnableDelayedExpansion

echo ========================================
echo IntelliFlood - Démarrage automatisé
echo ========================================

REM Traiter les lancements isolés sans démarrer Docker ni les migrations
if "%1"=="web" goto start_web
if "%1"=="api" goto start_api
if "%1"=="world" goto world_only
if "%1"=="stop" goto stop_services

REM Vérifier si Docker est disponible
docker --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo.
    echo [1/5] Démarrage PostgreSQL/PostGIS...
    docker compose up -d postgres
    if %ERRORLEVEL% neq 0 (
        echo ERROR: Impossible de démarrer PostgreSQL
        exit /b 1
    )
    timeout /t 5 /nobreak >nul
)

echo.
echo [2/5] Configuration des environnements...
if not exist "apps/api/.env" (
    if exist "apps/api/.env.example" (
        copy "apps/api/.env.example" "apps/api/.env" >nul
        echo - apps/api/.env cree a partir de l'exemple
    )
)
if not exist "apps/web/.env" (
    if exist "apps/web/.env.example" (
        copy "apps/web/.env.example" "apps/web/.env" >nul
        echo - apps/web/.env cree a partir de l'exemple
    )
)

echo.
echo [3/5] Application des migrations de base de donnees...
cd apps/api
if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
)
alembic upgrade head >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo WARNING: Les migrations ont ete appliquees ou la base n'existe pas pas encore
)
cd ..\..

echo.
echo.
echo ========================================
echo OPTIONS DE DEMARRAGE:
echo ========================================
echo   start.bat api    - Demarrer uniquement le backend API (http://localhost:8000)
echo   start.bat web    - Demarrer le frontend Web et IntelliFlood World
echo   start.bat world  - Demarrer uniquement IntelliFlood World (http://localhost:4173)
echo   start.bat both   - Demarrer l'API, le Web et IntelliFlood World (par defaut)
echo   start.bat stop   - Arreter les services en arriere-plan
echo ========================================
echo.

goto start_both

:start_api
echo Demarrage de l'API backend...
cd apps/api
if exist ".venv\Scripts\activate.bat" (
    echo Activation de l'environnement virtuel...
    start "IntelliFlood API" powershell -NoExit -Command "cd '%cd%'; .\.venv\Scripts\activate.bat; python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
) else (
    echo Utilisation de Python global...
    start "IntelliFlood API" powershell -NoExit -Command "cd '%cd%'; $env:PYTHONPATH='.'; python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
)
cd ..\..
echo API demarree sur http://localhost:8000
echo Swagger UI: http://localhost:8000/docs
goto end

:start_web
echo Demarrage du frontend Web...
cd apps/web
if not defined NodejsCommand (
    set "Path=%LOCALAPPDATA%\npm; %Path%"
)
start "IntelliFlood Web" cmd /c "npm run dev"
cd ..\..
call :launch_world
echo Web demarre sur http://localhost:5173
goto end

:start_both
echo Demarrage des deux services...
cd apps/api
if exist ".venv\Scripts\activate.bat" (
    start "IntelliFlood API" powershell -NoExit -Command "cd '%cd%'; .\.venv\Scripts\activate.bat; python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
) else (
    start "IntelliFlood API" powershell -NoExit -Command "cd '%cd%'; $env:PYTHONPATH='.'; python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
)
cd ..\..
cd apps/web
start "IntelliFlood Web" cmd /c "npm run dev"
cd ..\..
call :launch_world
echo.
echo SERVIS DEMARRS:
echo   API Backend:  http://localhost:8000
echo   Swagger UI:   http://localhost:8000/docs
echo   Frontend Web: http://localhost:5173
echo   IntelliFlood World: http://localhost:4173
goto end

:world_only
call :launch_world
goto end

:launch_world
echo Demarrage d'IntelliFlood World...
cd apps\world
start "IntelliFlood World" cmd /k "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort"
cd ..\..
echo IntelliFlood World demarre sur http://localhost:4173
exit /b 0

:stop_services
echo Arret des services IntelliFlood...
tasklist /FI "IMAGENAME eq powershell.exe" 2>NUL | find /I "uvicorn" >NUL
if "%ERRORLEVEL%"=="0" (
    taskkill /FI "WINDOWTITLE eq IntelliFlood API" /F >nul 2>&1
    echo - API arrêtée
)
tasklist /FI "IMAGENAME eq cmd.exe" 2>NUL | find /I "npm run dev" >NUL
if "%ERRORLEVEL%"=="0" (
    taskkill /FI "WINDOWTITLE eq IntelliFlood Web" /F >nul 2>&1
    echo - Web arrêté
)
if exist "%APPDATA%\Code\User\globalStorage\astronomer.intelliflood\workspaceStorage" (
    echo - Services IntelliFlood arrestes avec succes
) else (
    echo - Aucun service IntelliFlood a arreter
)
goto end

:end
echo.
echo Appuyez sur ENTREE pour fermer ce menu...
pause >nul
endlocal