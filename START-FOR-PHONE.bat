@echo off
:: Run this file as Administrator so your phone can connect.
cd /d "%~dp0"

echo.
echo === RHS Playbook - Phone Access ===
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo RIGHT-CLICK this file and choose "Run as administrator"
  echo then try again.
  echo.
  pause
  exit /b 1
)

echo Allowing port 5173 through Windows Firewall...
netsh advfirewall firewall delete rule name="RHS Playbook 5173" >nul 2>&1
netsh advfirewall firewall add rule name="RHS Playbook 5173" dir=in action=allow protocol=TCP localport=5173 profile=any

echo Setting Wi-Fi to Private network...
powershell -NoProfile -Command "try { Set-NetConnectionProfile -InterfaceAlias 'Wi-Fi' -NetworkCategory Private } catch {}"

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do set IP=%%a
set IP=%IP: =%

echo.
echo ============================================
echo  On your phone, open:
echo.
echo    http://172.16.31.230:5173
echo.
echo  (If that fails, use the IPv4 shown below)
ipconfig | findstr /c:"IPv4 Address"
echo ============================================
echo.
echo Keep this window OPEN while using the phone.
echo.

npx --yes serve -l 5173
pause
