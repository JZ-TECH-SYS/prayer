@echo off
echo Fechando Electron...
taskkill /F /IM electron.exe >nul 2>&1

echo Limpando node_modules e package-lock.json...
rmdir /S /Q node_modules
del /F /Q package-lock.json

echo Instalando dependências...
npm install

echo Rebuild do Electron...
npx electron-rebuild

echo --------------------------------
echo Pronto! Pode rodar com: npm start
pause
