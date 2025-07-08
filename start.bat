@echo off
echo ========================================
echo    Bate Papo Privado Del
echo ========================================
echo.
echo Verificando dependencias...
if not exist node_modules (
    echo Instalando dependencias pela primeira vez...
    npm install
    echo.
)

echo Iniciando servidor de desenvolvimento...
echo.
echo Acesse: http://localhost:3000 
echo.
echo Para parar o servidor, pressione Ctrl+C
echo ========================================
npm run dev
pause