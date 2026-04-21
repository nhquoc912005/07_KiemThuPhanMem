USE TrungChuyenDB;
GO

SET NOCOUNT ON;
GO

IF OBJECT_ID(N'dbo.TaiKhoanNguoiDung', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.TaiKhoanNguoiDung', N'YeuCauDoiMatKhau') IS NULL
    BEGIN
        ALTER TABLE dbo.TaiKhoanNguoiDung
        ADD YeuCauDoiMatKhau BIT NOT NULL
            CONSTRAINT DF_TaiKhoanNguoiDung_YeuCauDoiMatKhau DEFAULT 0 WITH VALUES;
    END;

    IF COL_LENGTH(N'dbo.TaiKhoanNguoiDung', N'SoLanDangNhapSai') IS NULL
    BEGIN
        ALTER TABLE dbo.TaiKhoanNguoiDung
        ADD SoLanDangNhapSai INT NOT NULL
            CONSTRAINT DF_TaiKhoanNguoiDung_SoLanDangNhapSai DEFAULT 0 WITH VALUES;
    END;

    IF COL_LENGTH(N'dbo.TaiKhoanNguoiDung', N'KhoaTamThoiDenLuc') IS NULL
    BEGIN
        ALTER TABLE dbo.TaiKhoanNguoiDung
        ADD KhoaTamThoiDenLuc DATETIME NULL;
    END;

    EXEC(N'
        UPDATE dbo.TaiKhoanNguoiDung
        SET YeuCauDoiMatKhau = ISNULL(YeuCauDoiMatKhau, 0),
            SoLanDangNhapSai = ISNULL(SoLanDangNhapSai, 0)
        WHERE YeuCauDoiMatKhau IS NULL
           OR SoLanDangNhapSai IS NULL;
    ');
END;
GO

IF OBJECT_ID(N'dbo.TaiXe', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.TaiXe', N'MaNhanVienTaiXe') IS NULL
    BEGIN
        ALTER TABLE dbo.TaiXe
        ADD MaNhanVienTaiXe VARCHAR(20) NULL;
    END;

    EXEC(N'
        UPDATE dbo.TaiXe
        SET MaNhanVienTaiXe =
            CASE
                WHEN MaTaiXe < 1000 THEN CONCAT(''NVTX'', RIGHT(''000'' + CAST(MaTaiXe AS VARCHAR(10)), 3))
                ELSE CONCAT(''NVTX'', CAST(MaTaiXe AS VARCHAR(10)))
            END
        WHERE NULLIF(LTRIM(RTRIM(MaNhanVienTaiXe)), '''') IS NULL;
    ');

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.TaiXe')
          AND name = N'UX_TaiXe_MaNhanVienTaiXe'
    )
    BEGIN
        EXEC(N'
            CREATE UNIQUE INDEX UX_TaiXe_MaNhanVienTaiXe
            ON dbo.TaiXe(MaNhanVienTaiXe)
            WHERE MaNhanVienTaiXe IS NOT NULL;
        ');
    END;
END;
GO

IF OBJECT_ID(N'dbo.external_drivers', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.external_drivers', N'employee_code') IS NULL
    BEGIN
        ALTER TABLE dbo.external_drivers
        ADD employee_code NVARCHAR(20) NULL;
    END;

    EXEC(N'
        UPDATE d
        SET employee_code =
            COALESCE(
                NULLIF(LTRIM(RTRIM(tx.MaNhanVienTaiXe)), ''''),
                CASE
                    WHEN d.legacy_ma_tai_xe < 1000 THEN CONCAT(N''NVTX'', RIGHT(''000'' + CAST(d.legacy_ma_tai_xe AS VARCHAR(10)), 3))
                    ELSE CONCAT(N''NVTX'', CAST(d.legacy_ma_tai_xe AS VARCHAR(10)))
                END
            )
        FROM dbo.external_drivers d
        LEFT JOIN dbo.TaiXe tx
            ON tx.MaTaiXe = d.legacy_ma_tai_xe
        WHERE NULLIF(LTRIM(RTRIM(d.employee_code)), '''') IS NULL;
    ');

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.external_drivers')
          AND name = N'UX_external_drivers_employee_code'
    )
    BEGIN
        EXEC(N'
            CREATE UNIQUE INDEX UX_external_drivers_employee_code
            ON dbo.external_drivers(employee_code)
            WHERE employee_code IS NOT NULL;
        ');
    END;
END;
GO
