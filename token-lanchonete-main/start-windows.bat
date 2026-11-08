@echo off
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo npm nao encontrado no PATH. Instale o Node.js 22 ou superior.
  exit /b 1
)

if not exist "backend\.env" (
  copy "backend\.env.example" "backend\.env" >nul
  echo.
  echo Criei backend\.env a partir do exemplo.
  echo Edite backend\.env e informe as credenciais do PostgreSQL; rode este script de novo.
  notepad "backend\.env"
  exit /b 0
)

call npm install
if errorlevel 1 exit /b 1

echo Preparando o banco de dados...
call npm run db:setup --workspace backend
if errorlevel 1 (
  echo Falha ao preparar o banco. Confira DATABASE_URL ou as credenciais e o acesso ao PostgreSQL.
  exit /b 1
)

start "Lanchonete" cmd /k "cd /d ""%~dp0"" && npm run dev"
