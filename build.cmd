@echo off
cd /d %~dp0
if exist dist rmdir /s /q dist
mkdir dist
call tsc -p tsconfig.app.json || exit /b 1
call tsc -p tsconfig.worker.json || exit /b 1
node tools\copy-public.mjs || exit /b 1
echo Built static site in dist\
