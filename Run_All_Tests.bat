@echo off
echo ===================================================
echo   KHOI DONG HE THONG VA CHAY AUTOMATION TEST
echo ===================================================

echo [1/4] Dang khoi dong Backend Server...
start "Backend Server" cmd /k "cd backend && npm run dev"
timeout /t 5 /nobreak >nul

echo [2/4] Dang khoi dong Frontend Server...
start "Frontend Server" cmd /k "cd frontend && npm run dev"
timeout /t 5 /nobreak >nul

echo [3/4] Dang tao du lieu ao (Seed Data)...
cd backend
call npm run seed:driver-demo
cd ..
timeout /t 3 /nobreak >nul

echo [4/4] Dang chay kịch bản Selenium Test...
cd tests\selenium-java
call .\mvnw.cmd clean test -DsuiteXmlFile=testng.xml

echo ===================================================
echo   HOAN TAT!
echo ===================================================
pause
