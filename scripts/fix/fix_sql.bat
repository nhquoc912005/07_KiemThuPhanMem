@echo off
echo ===================================================
echo   Cong cu tu dong sua loi dang nhap SQL Server
echo ===================================================
echo.
echo [1/2] Dang doi che do xac thuc sang Mixed Mode va cap nhat password 'sa'...
sqlcmd -S .\MSSQLSERVER03 -E -Q "EXEC xp_instance_regwrite N'HKEY_LOCAL_MACHINE', N'Software\Microsoft\MSSQLServer\MSSQLServer', N'LoginMode', REG_DWORD, 2; ALTER LOGIN sa WITH PASSWORD='123456'; ALTER LOGIN sa ENABLE;"

echo.
echo [2/2] Dang khoi dong lai dich vu SQL Server (MSSQLSERVER03)...
net stop MSSQL$MSSQLSERVER03
net start MSSQL$MSSQLSERVER03

echo.
echo ===================================================
echo HOAN TAT! Bay gio ban co the dang nhap kieu gi cung duoc.
echo ===================================================
pause
