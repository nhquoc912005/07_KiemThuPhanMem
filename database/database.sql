-- Script táº¡o database vÃ  cÃ¡c báº£ng cho
-- Há»‡ thá»‘ng quáº£n lÃ½ vÃ  Ä‘iá»u phá»‘i lá»™ trÃ¬nh xe trung chuyá»ƒn
-- PhiÃªn báº£n Ä‘Ã£ vÃ¡ lá»—i seed + FK + dá»¯ liá»‡u trÃ¹ng
-- SQL Server / SSMS

------------------------------------------------------------
-- 1. Táº¡o database (náº¿u chÆ°a tá»“n táº¡i)
------------------------------------------------------------
IF DB_ID(N'TrungChuyenDB') IS NULL
BEGIN
    CREATE DATABASE TrungChuyenDB;
END;
GO

USE TrungChuyenDB;
GO

------------------------------------------------------------
-- 2. XÃ³a báº£ng náº¿u tá»“n táº¡i (theo thá»© tá»± FK an toÃ n)
------------------------------------------------------------
IF OBJECT_ID('dbo.route_plan_logs', 'U') IS NOT NULL DROP TABLE dbo.route_plan_logs;
IF OBJECT_ID('dbo.route_plan_driver_assignments', 'U') IS NOT NULL DROP TABLE dbo.route_plan_driver_assignments;
IF OBJECT_ID('dbo.route_plan_vehicle_assignments', 'U') IS NOT NULL DROP TABLE dbo.route_plan_vehicle_assignments;
IF OBJECT_ID('dbo.route_plan_customers', 'U') IS NOT NULL DROP TABLE dbo.route_plan_customers;
IF OBJECT_ID('dbo.route_plans', 'U') IS NOT NULL DROP TABLE dbo.route_plans;
IF OBJECT_ID('dbo.import_logs', 'U') IS NOT NULL DROP TABLE dbo.import_logs;
IF OBJECT_ID('dbo.source_metadata', 'U') IS NOT NULL DROP TABLE dbo.source_metadata;
IF OBJECT_ID('dbo.external_vehicles', 'U') IS NOT NULL DROP TABLE dbo.external_vehicles;
IF OBJECT_ID('dbo.external_drivers', 'U') IS NOT NULL DROP TABLE dbo.external_drivers;
IF OBJECT_ID('dbo.external_customers', 'U') IS NOT NULL DROP TABLE dbo.external_customers;

IF OBJECT_ID('dbo.TheoDoiTrangThai', 'U') IS NOT NULL DROP TABLE dbo.TheoDoiTrangThai;
IF OBJECT_ID('dbo.ChiTietLoTrinh', 'U') IS NOT NULL DROP TABLE dbo.ChiTietLoTrinh;
IF OBJECT_ID('dbo.LoTrinhTrungChuyen', 'U') IS NOT NULL DROP TABLE dbo.LoTrinhTrungChuyen;
IF OBJECT_ID('dbo.VeTrungChuyen', 'U') IS NOT NULL DROP TABLE dbo.VeTrungChuyen;
IF OBJECT_ID('dbo.KhachHang', 'U') IS NOT NULL DROP TABLE dbo.KhachHang;
IF OBJECT_ID('dbo.XeTrungChuyen', 'U') IS NOT NULL DROP TABLE dbo.XeTrungChuyen;
IF OBJECT_ID('dbo.TaiXe', 'U') IS NOT NULL DROP TABLE dbo.TaiXe;
IF OBJECT_ID('dbo.NhanVienDieuPhoi', 'U') IS NOT NULL DROP TABLE dbo.NhanVienDieuPhoi;
IF OBJECT_ID('dbo.TaiKhoanNguoiDung', 'U') IS NOT NULL DROP TABLE dbo.TaiKhoanNguoiDung;
GO

------------------------------------------------------------
-- 3. Táº¡o báº£ng chÃ­nh
------------------------------------------------------------
CREATE TABLE TaiKhoanNguoiDung (
    MaTaiKhoan        INT IDENTITY(1,1) PRIMARY KEY,
    TenDangNhap       VARCHAR(50) NOT NULL UNIQUE,
    MatKhauMaHoa      VARCHAR(255) NOT NULL,
    SoDienThoai       VARCHAR(15) NULL,
    VaiTro            NVARCHAR(30) NULL,
    TrangThaiTaiKhoan BIT NOT NULL DEFAULT 1,
    YeuCauDoiMatKhau  BIT NOT NULL DEFAULT 0,
    SoLanDangNhapSai  INT NOT NULL DEFAULT 0,
    KhoaTamThoiDenLuc DATETIME NULL,
    NgayTao           DATETIME NOT NULL DEFAULT GETDATE()
);
GO

IF COL_LENGTH('dbo.TaiKhoanNguoiDung', 'YeuCauDoiMatKhau') IS NULL
BEGIN
    ALTER TABLE dbo.TaiKhoanNguoiDung
    ADD YeuCauDoiMatKhau BIT NOT NULL
        CONSTRAINT DF_TaiKhoanNguoiDung_YeuCauDoiMatKhau DEFAULT 0 WITH VALUES;
END;
GO

IF COL_LENGTH('dbo.TaiKhoanNguoiDung', 'SoLanDangNhapSai') IS NULL
BEGIN
    ALTER TABLE dbo.TaiKhoanNguoiDung
    ADD SoLanDangNhapSai INT NOT NULL
        CONSTRAINT DF_TaiKhoanNguoiDung_SoLanDangNhapSai DEFAULT 0 WITH VALUES;
END;
GO

IF COL_LENGTH('dbo.TaiKhoanNguoiDung', 'KhoaTamThoiDenLuc') IS NULL
BEGIN
    ALTER TABLE dbo.TaiKhoanNguoiDung
    ADD KhoaTamThoiDenLuc DATETIME NULL;
END;
GO

CREATE TABLE NhanVienDieuPhoi (
    MaNhanVien   INT IDENTITY(1,1) PRIMARY KEY,
    HoTen        NVARCHAR(100) NOT NULL,
    SoDienThoai  VARCHAR(15) NULL,
    TrangThai    NVARCHAR(30) NULL,
    MaTaiKhoan   INT NULL,
    CONSTRAINT FK_NVDP_TaiKhoanNguoiDung
        FOREIGN KEY (MaTaiKhoan) REFERENCES TaiKhoanNguoiDung(MaTaiKhoan)
);
GO

CREATE TABLE TaiXe (
    MaTaiXe         INT IDENTITY(1,1) PRIMARY KEY,
    MaNhanVienTaiXe VARCHAR(20) NULL,
    HoTen           NVARCHAR(100) NOT NULL,
    SoDienThoai     VARCHAR(15) NOT NULL UNIQUE,
    CCCD            VARCHAR(20) NOT NULL UNIQUE,
    LoaiBangLai     NVARCHAR(50) NULL,
    TrangThaiTaiXe  NVARCHAR(30) NULL,
    MaTaiKhoan      INT NULL,
    CONSTRAINT FK_TaiXe_TaiKhoanNguoiDung
        FOREIGN KEY (MaTaiKhoan) REFERENCES TaiKhoanNguoiDung(MaTaiKhoan)
);
GO

IF COL_LENGTH('dbo.TaiXe', 'MaNhanVienTaiXe') IS NULL
BEGIN
    ALTER TABLE dbo.TaiXe
    ADD MaNhanVienTaiXe VARCHAR(20) NULL;
END;
GO

CREATE TABLE XeTrungChuyen (
    MaXe         INT IDENTITY(1,1) PRIMARY KEY,
    BienSo       VARCHAR(50) NOT NULL UNIQUE,
    LoaiXe       NVARCHAR(50) NOT NULL,
    SoCho        INT NOT NULL,
    TrangThaiXe  NVARCHAR(30) NULL
);
GO

CREATE TABLE KhachHang (
    MaKhachHang   INT IDENTITY(1,1) PRIMARY KEY,
    TenKhachHang  NVARCHAR(100) NOT NULL,
    SoDienThoai   VARCHAR(15) NOT NULL UNIQUE,
    DiaChiDon     NVARCHAR(255) NOT NULL,
    DiaChiTra     NVARCHAR(255) NOT NULL,
    TrangThai     NVARCHAR(30) NULL
);
GO

CREATE TABLE VeTrungChuyen (
    MaVe                INT IDENTITY(1,1) PRIMARY KEY,
    KhungGioTrungChuyen NVARCHAR(100) NULL,
    SoLuongGhe          INT NOT NULL,
    TrangThaiVe         NVARCHAR(50) NOT NULL,
    MaKhachHang         INT NOT NULL,
    CONSTRAINT FK_VeTrungChuyen_KhachHang
        FOREIGN KEY (MaKhachHang) REFERENCES KhachHang(MaKhachHang)
);
GO

CREATE TABLE LoTrinhTrungChuyen (
    MaLoTrinh         INT IDENTITY(1,1) PRIMARY KEY,
    ThoiGianBatDau    DATETIME NOT NULL,
    ThoiGianKetThuc   DATETIME NULL,
    LoTrinhDuKien     NVARCHAR(MAX) NULL,
    GhiChu            NVARCHAR(MAX) NULL,
    TrangThaiLoTrinh  NVARCHAR(50) NOT NULL,
    MaXe              INT NOT NULL,
    MaTaiXe           INT NOT NULL,
    MaNhanVien        INT NOT NULL,
    CONSTRAINT FK_LoTrinh_XeTrungChuyen
        FOREIGN KEY (MaXe) REFERENCES XeTrungChuyen(MaXe),
    CONSTRAINT FK_LoTrinh_TaiXe
        FOREIGN KEY (MaTaiXe) REFERENCES TaiXe(MaTaiXe),
    CONSTRAINT FK_LoTrinh_NhanVienDieuPhoi
        FOREIGN KEY (MaNhanVien) REFERENCES NhanVienDieuPhoi(MaNhanVien)
);
GO

CREATE TABLE ChiTietLoTrinh (
    MaChiTiet         INT IDENTITY(1,1) PRIMARY KEY,
    ThuTuDonTra       INT NOT NULL,
    DiemDon           NVARCHAR(255) NOT NULL,
    DiemTra           NVARCHAR(255) NOT NULL,
    ThoiGianDonDuKien DATETIME NULL,
    TrangThaiKhach    NVARCHAR(50) NULL,
    MaLoTrinh         INT NOT NULL,
    MaVe              INT NOT NULL,
    CONSTRAINT FK_ChiTietLoTrinh_LoTrinh
        FOREIGN KEY (MaLoTrinh) REFERENCES LoTrinhTrungChuyen(MaLoTrinh),
    CONSTRAINT FK_ChiTietLoTrinh_VeTrungChuyen
        FOREIGN KEY (MaVe) REFERENCES VeTrungChuyen(MaVe)
);
GO

CREATE TABLE TheoDoiTrangThai (
    MaTheoDoi        INT IDENTITY(1,1) PRIMARY KEY,
    ViTriHienTai     NVARCHAR(255) NULL,
    ThoiDiemCapNhat  DATETIME NOT NULL DEFAULT GETDATE(),
    TrangThai        NVARCHAR(50) NULL,
    MaLoTrinh        INT NOT NULL,
    CONSTRAINT FK_TheoDoiTrangThai_LoTrinh
        FOREIGN KEY (MaLoTrinh) REFERENCES LoTrinhTrungChuyen(MaLoTrinh)
);
GO

------------------------------------------------------------
-- 3.1. Constraint / index cÆ¡ báº£n
------------------------------------------------------------
ALTER TABLE XeTrungChuyen
ADD CONSTRAINT CK_XeTrungChuyen_SoCho
CHECK (SoCho BETWEEN 4 AND 45);
GO

ALTER TABLE VeTrungChuyen
ADD CONSTRAINT CK_VeTrungChuyen_SoLuongGhe
CHECK (SoLuongGhe BETWEEN 1 AND 10);
GO

ALTER TABLE LoTrinhTrungChuyen
ADD CONSTRAINT CK_LoTrinh_TrungChuyen_ThoiGian
CHECK (ThoiGianKetThuc IS NULL OR ThoiGianKetThuc >= ThoiGianBatDau);
GO

CREATE UNIQUE INDEX UX_TaiKhoanNguoiDung_SoDienThoai
ON TaiKhoanNguoiDung(SoDienThoai)
WHERE SoDienThoai IS NOT NULL;
GO

CREATE UNIQUE INDEX UX_TaiXe_MaNhanVienTaiXe
ON TaiXe(MaNhanVienTaiXe)
WHERE MaNhanVienTaiXe IS NOT NULL;
GO

CREATE INDEX IX_LoTrinhTrungChuyen_MaTaiXe_TrangThai_ThoiGianBatDau
ON LoTrinhTrungChuyen(MaTaiXe, TrangThaiLoTrinh, ThoiGianBatDau);
GO

CREATE INDEX IX_LoTrinhTrungChuyen_MaXe_TrangThai_ThoiGianBatDau
ON LoTrinhTrungChuyen(MaXe, TrangThaiLoTrinh, ThoiGianBatDau);
GO

CREATE INDEX IX_VeTrungChuyen_MaKhachHang_TrangThaiVe
ON VeTrungChuyen(MaKhachHang, TrangThaiVe);
GO

CREATE INDEX IX_ChiTietLoTrinh_MaLoTrinh_ThuTuDonTra
ON ChiTietLoTrinh(MaLoTrinh, ThuTuDonTra);
GO

------------------------------------------------------------
-- 4. Seed dá»¯ liá»‡u chÃ­nh
------------------------------------------------------------
-- TÃ i khoáº£n máº«u: nhÃ¢n viÃªn Ä‘iá»u phá»‘i
INSERT INTO TaiKhoanNguoiDung (TenDangNhap, MatKhauMaHoa, SoDienThoai, VaiTro, TrangThaiTaiKhoan)
VALUES ('dieuphoi1', '$2b$10$EHsLxVEd.xxShRMhCJ8jouTDAlnLzyecGZrHbVk262hVk6YvPd.RS', '0812345678', N'NhÃ¢n viÃªn Ä‘iá»u phá»‘i', 1);

DECLARE @MaTK_NVDP INT = SCOPE_IDENTITY();

INSERT INTO NhanVienDieuPhoi (HoTen, SoDienThoai, TrangThai, MaTaiKhoan)
VALUES (N'NhÃ¢n viÃªn Ä‘iá»u phá»‘i 1', '0812345678', N'Hoáº¡t Ä‘á»™ng', @MaTK_NVDP);

-- TÃ i khoáº£n máº«u: tÃ i xáº¿ chÃ­nh
INSERT INTO TaiKhoanNguoiDung (TenDangNhap, MatKhauMaHoa, SoDienThoai, VaiTro, TrangThaiTaiKhoan)
VALUES ('taixe1', '$2b$10$EHsLxVEd.xxShRMhCJ8jouTDAlnLzyecGZrHbVk262hVk6YvPd.RS', '0912345678', N'TÃ i xáº¿', 1);

DECLARE @MaTK_TaiXe INT = SCOPE_IDENTITY();

INSERT INTO TaiXe (MaNhanVienTaiXe, HoTen, SoDienThoai, CCCD, LoaiBangLai, TrangThaiTaiXe, MaTaiKhoan)
VALUES ('NVTX001', N'Nguyá»…n Minh Tuáº¥n', '0912345678', '012345678901', N'B2', N'Ráº£nh', @MaTK_TaiXe);

-- ThÃªm tÃ i xáº¿ demo
INSERT INTO TaiXe (MaNhanVienTaiXe, HoTen, SoDienThoai, CCCD, LoaiBangLai, TrangThaiTaiXe, MaTaiKhoan)
VALUES
    ('NVTX002', N'Tráº§n VÄƒn HÃ¹ng',  '0912345671', '012345678902', N'B2', N'Ráº£nh', NULL),
    ('NVTX003', N'LÃª Thanh Nam',   '0912345672', '012345678903', N'C',  N'Äang thá»±c hiá»‡n chuyáº¿n', NULL),
    ('NVTX004', N'Pháº¡m VÄƒn Long',  '0912345673', '012345678904', N'B2', N'Ráº£nh', NULL),
    ('NVTX005', N'HoÃ ng Minh Äá»©c', '0912345674', '012345678905', N'C',  N'ÄÃ£ phÃ¢n cÃ´ng', NULL);

-- Xe demo
INSERT INTO XeTrungChuyen (BienSo, LoaiXe, SoCho, TrangThaiXe)
VALUES
    ('51A-12345', N'Xe 7 chá»—', 7, N'Ráº£nh'),
    ('51B-67890', N'Xe 4 chá»—', 4, N'Ráº£nh'),
    ('51C-11111', N'Xe 16 chá»—', 16, N'Ráº£nh'),
    ('51D-22222', N'Xe 7 chá»—', 7, N'Ráº£nh'),
    ('51E-33333', N'Xe 4 chá»—', 4, N'Ráº£nh');

-- KhÃ¡ch hÃ ng demo
INSERT INTO KhachHang (TenKhachHang, SoDienThoai, DiaChiDon, DiaChiTra, TrangThai)
VALUES
    (N'HÃ  VÄƒn Nam',         '0389123456', N'56 Chu Máº¡nh Trinh',        N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'Nguyá»…n Thá»‹ Thuáº­n',   '0389123452', N'36 TÃº Quá»³',                N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'LÃª Minh Äáº¡i',        '0981234567', N'12 Nguyá»…n VÄƒn Linh',       N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'Pháº¡m Thá»‹ Dung',      '0912345670', N'34 LÃª Duáº©n',               N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'Tráº§n HoÃ ng BÃ¡ch',    '0901234567', N'56 Tráº§n PhÃº',              N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'Nguyá»…n VÄƒn PhÆ°Æ¡ng',  '0922333444', N'78 HÃ¹ng VÆ°Æ¡ng',            N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'LÃ½ Thá»‹ Giang',       '0933444555', N'90 Äiá»‡n BiÃªn Phá»§',         N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'VÃµ ThÃ nh HÃ²a',       '0944555666', N'123 Nguyá»…n Táº¥t ThÃ nh',     N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'Äá»— Minh Hiáº¿u',       '0955666777', N'45 Báº¡ch Äáº±ng',             N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'BÃ¹i VÄƒn HoÃ ng',      '0966777888', N'67 Tráº§n HÆ°ng Äáº¡o',         N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'NgÃ´ Tuáº¥n Anh',       '0977888999', N'89 LÃª Lá»£i',                N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'Phan Thá»‹ Lan',       '0988999000', N'101 Nguyá»…n HoÃ ng',         N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'Äáº·ng Há»¯u Minh',      '0999000111', N'202 TÃ´n Äá»©c Tháº¯ng',        N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'Há»“ Ngá»c Nhi',        '0911222333', N'303 Nguyá»…n LÆ°Æ¡ng Báº±ng',    N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'DÆ°Æ¡ng Quá»‘c Äáº¡t',     '0922333445', N'404 Pháº¡m HÃ¹ng',            N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'Mai Anh PhÆ°Æ¡ng',     '0933444556', N'505 LÃª Trá»ng Táº¥n',         N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'Trá»‹nh Cáº©m Quang',    '0944555667', N'606 TrÆ°á»ng Chinh',         N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'Äinh Trá»ng ThÃ nh',   '0955666778', N'707 Äiá»‡n BiÃªn Phá»§',        N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'LÃ¢m Báº£o SÆ¡n',        '0966777889', N'808 Háº£i PhÃ²ng',            N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'ThÃ¡i Huy ThÃ´ng',     '0977888900', N'909 NÃºi ThÃ nh',            N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'ChÃ¢u Gia Uy',        '0988999011', N'1010 Tiá»ƒu La',             N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng'),
    (N'TrÆ°Æ¡ng Há»¯u VÅ©',      '0999000122', N'1111 Phan ÄÄƒng LÆ°u',       N'Báº¿n xe ÄÃ  Náºµng', N'Hoáº¡t Ä‘á»™ng');

-- VÃ© trung chuyá»ƒn: map theo sá»‘ Ä‘iá»‡n thoáº¡i Ä‘á»ƒ trÃ¡nh lá»‡ thuá»™c ID cá»©ng
INSERT INTO VeTrungChuyen (KhungGioTrungChuyen, SoLuongGhe, TrangThaiVe, MaKhachHang)
SELECT
    v.KhungGioTrungChuyen,
    v.SoLuongGhe,
    v.TrangThaiVe,
    kh.MaKhachHang
FROM
(
    VALUES
        ('0389123456', N'7:00 - 9:00',   1, N'Cáº§n trung chuyá»ƒn'),
        ('0389123452', N'7:00 - 9:00',   2, N'Cáº§n trung chuyá»ƒn'),
        ('0981234567', N'7:00 - 9:00',   1, N'Cáº§n trung chuyá»ƒn'),
        ('0912345670', N'7:00 - 9:00',   1, N'Cáº§n trung chuyá»ƒn'),
        ('0901234567', N'7:00 - 9:00',   2, N'Cáº§n trung chuyá»ƒn'),
        ('0922333444', N'7:00 - 9:00',   1, N'Cáº§n trung chuyá»ƒn'),

        ('0933444555', N'9:00 - 11:00',  1, N'Cáº§n trung chuyá»ƒn'),
        ('0944555666', N'9:00 - 11:00',  2, N'Cáº§n trung chuyá»ƒn'),
        ('0955666777', N'9:00 - 11:00',  1, N'Cáº§n trung chuyá»ƒn'),
        ('0966777888', N'9:00 - 11:00',  1, N'Cáº§n trung chuyá»ƒn'),
        ('0977888999', N'9:00 - 11:00',  2, N'Cáº§n trung chuyá»ƒn'),
        ('0988999000', N'9:00 - 11:00',  1, N'Cáº§n trung chuyá»ƒn'),

        ('0999000111', N'11:00 - 13:00', 1, N'Cáº§n trung chuyá»ƒn'),
        ('0911222333', N'11:00 - 13:00', 2, N'Cáº§n trung chuyá»ƒn'),
        ('0922333445', N'11:00 - 13:00', 1, N'Cáº§n trung chuyá»ƒn'),
        ('0933444556', N'11:00 - 13:00', 1, N'Cáº§n trung chuyá»ƒn'),
        ('0944555667', N'11:00 - 13:00', 2, N'Cáº§n trung chuyá»ƒn'),
        ('0955666778', N'11:00 - 13:00', 1, N'Cáº§n trung chuyá»ƒn'),

        ('0966777889', N'13:00 - 15:00', 1, N'Cáº§n trung chuyá»ƒn'),
        ('0977888900', N'13:00 - 15:00', 2, N'Cáº§n trung chuyá»ƒn'),
        ('0988999011', N'15:00 - 17:00', 1, N'Cáº§n trung chuyá»ƒn'),
        ('0999000122', N'15:00 - 17:00', 1, N'Cáº§n trung chuyá»ƒn')
) AS v(SoDienThoai, KhungGioTrungChuyen, SoLuongGhe, TrangThaiVe)
INNER JOIN KhachHang kh
    ON kh.SoDienThoai = v.SoDienThoai;
GO

------------------------------------------------------------
-- 5. Táº¡o má»™t lá»™ trÃ¬nh máº«u + chi tiáº¿t + theo dÃµi tráº¡ng thÃ¡i
------------------------------------------------------------
DECLARE @MaXe1 INT = (SELECT TOP 1 MaXe FROM XeTrungChuyen WHERE BienSo = '51A-12345');
DECLARE @MaTaiXe1 INT = (SELECT TOP 1 MaTaiXe FROM TaiXe WHERE SoDienThoai = '0912345678');
DECLARE @MaNhanVien1 INT = (SELECT TOP 1 MaNhanVien FROM NhanVienDieuPhoi ORDER BY MaNhanVien);

INSERT INTO LoTrinhTrungChuyen
    (ThoiGianBatDau, ThoiGianKetThuc, LoTrinhDuKien, GhiChu, TrangThaiLoTrinh, MaXe, MaTaiXe, MaNhanVien)
VALUES
    (DATEADD(HOUR, 1, GETDATE()), NULL, N'Háº£i ChÃ¢u â†’ Thanh KhÃª â†’ Báº¿n xe ÄÃ  Náºµng', N'Lá»™ trÃ¬nh demo', N'Äang thá»±c hiá»‡n', @MaXe1, @MaTaiXe1, @MaNhanVien1);

DECLARE @MaLoTrinh1 INT = SCOPE_IDENTITY();

DECLARE @MaVe1 INT =
(
    SELECT TOP 1 v.MaVe
    FROM VeTrungChuyen v
    INNER JOIN KhachHang kh ON kh.MaKhachHang = v.MaKhachHang
    WHERE kh.SoDienThoai = '0389123456'
    ORDER BY v.MaVe
);

INSERT INTO ChiTietLoTrinh
    (ThuTuDonTra, DiemDon, DiemTra, ThoiGianDonDuKien, TrangThaiKhach, MaLoTrinh, MaVe)
VALUES
    (1, N'56 Chu Máº¡nh Trinh', N'Báº¿n xe ÄÃ  Náºµng', DATEADD(HOUR, 1, GETDATE()), N'ÄÃ£ Ä‘áº¿n Ä‘iá»ƒm Ä‘Ã³n', @MaLoTrinh1, @MaVe1);

INSERT INTO TheoDoiTrangThai (ViTriHienTai, TrangThai, MaLoTrinh)
VALUES (N'Äang táº¡i khu vá»±c Háº£i ChÃ¢u', N'Äang thá»±c hiá»‡n', @MaLoTrinh1);
GO

------------------------------------------------------------
-- 6. Gá»£i Ã½ Ä‘Äƒng nháº­p
------------------------------------------------------------
-- TÃªn Ä‘Äƒng nháº­p: dieuphoi1
-- Mật khẩu:      12345678
--
-- Hoáº·c tÃ i xáº¿:
-- TÃªn Ä‘Äƒng nháº­p: taixe1
-- Mật khẩu:      12345678

------------------------------------------------------------
-- 7. OPTION 1 - External master data (giáº£ láº­p) + Dispatch schema
------------------------------------------------------------
CREATE TABLE dbo.external_customers (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    legacy_ma_khach_hang INT NOT NULL,
    customer_code NVARCHAR(20) NOT NULL,
    full_name NVARCHAR(100) NOT NULL,
    phone VARCHAR(15) NOT NULL,
    default_pickup_address NVARCHAR(255) NULL,
    default_dropoff_address NVARCHAR(255) NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_external_customers_status DEFAULT N'ACTIVE',
    is_active BIT NOT NULL CONSTRAINT DF_external_customers_is_active DEFAULT 1,
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_external_customers_created_at DEFAULT GETDATE(),
    updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_external_customers_updated_at DEFAULT GETDATE(),
    CONSTRAINT UQ_external_customers_customer_code UNIQUE (customer_code),
    CONSTRAINT UQ_external_customers_legacy_ma_khach_hang UNIQUE (legacy_ma_khach_hang),
    CONSTRAINT UQ_external_customers_phone UNIQUE (phone),
    CONSTRAINT CK_external_customers_status CHECK (status IN (N'ACTIVE', N'INACTIVE'))
);
GO

CREATE INDEX IX_external_customers_phone ON dbo.external_customers(phone);
GO

CREATE TABLE dbo.external_drivers (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    legacy_ma_tai_xe INT NOT NULL,
    driver_code NVARCHAR(20) NOT NULL,
    employee_code NVARCHAR(20) NULL,
    full_name NVARCHAR(100) NOT NULL,
    phone VARCHAR(15) NOT NULL,
    national_id VARCHAR(20) NOT NULL,
    license_no VARCHAR(30) NULL,
    license_class NVARCHAR(50) NULL,
    work_status NVARCHAR(20) NOT NULL CONSTRAINT DF_external_drivers_work_status DEFAULT N'ACTIVE',
    availability_status NVARCHAR(20) NOT NULL CONSTRAINT DF_external_drivers_availability_status DEFAULT N'AVAILABLE',
    is_active BIT NOT NULL CONSTRAINT DF_external_drivers_is_active DEFAULT 1,
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_external_drivers_created_at DEFAULT GETDATE(),
    updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_external_drivers_updated_at DEFAULT GETDATE(),
    CONSTRAINT UQ_external_drivers_driver_code UNIQUE (driver_code),
    CONSTRAINT UQ_external_drivers_legacy_ma_tai_xe UNIQUE (legacy_ma_tai_xe),
    CONSTRAINT UQ_external_drivers_phone UNIQUE (phone),
    CONSTRAINT UQ_external_drivers_national_id UNIQUE (national_id),
    CONSTRAINT CK_external_drivers_work_status CHECK (work_status IN (N'ACTIVE', N'INACTIVE')),
    CONSTRAINT CK_external_drivers_availability CHECK (availability_status IN (N'AVAILABLE', N'ASSIGNED', N'BUSY', N'OFF'))
);
GO

IF COL_LENGTH('dbo.external_drivers', 'employee_code') IS NULL
BEGIN
    ALTER TABLE dbo.external_drivers
    ADD employee_code NVARCHAR(20) NULL;
END;
GO

CREATE INDEX IX_external_drivers_availability_status ON dbo.external_drivers(availability_status);
GO

CREATE UNIQUE INDEX UX_external_drivers_employee_code
ON dbo.external_drivers(employee_code)
WHERE employee_code IS NOT NULL;
GO

CREATE TABLE dbo.external_vehicles (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    legacy_ma_xe INT NOT NULL,
    vehicle_code NVARCHAR(20) NOT NULL,
    plate_number VARCHAR(20) NOT NULL,
    vehicle_type NVARCHAR(50) NULL,
    capacity INT NOT NULL,
    seat_count INT NOT NULL,
    operational_status NVARCHAR(20) NOT NULL CONSTRAINT DF_external_vehicles_operational_status DEFAULT N'ACTIVE',
    availability_status NVARCHAR(20) NOT NULL CONSTRAINT DF_external_vehicles_availability_status DEFAULT N'AVAILABLE',
    is_active BIT NOT NULL CONSTRAINT DF_external_vehicles_is_active DEFAULT 1,
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_external_vehicles_created_at DEFAULT GETDATE(),
    updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_external_vehicles_updated_at DEFAULT GETDATE(),
    CONSTRAINT UQ_external_vehicles_vehicle_code UNIQUE (vehicle_code),
    CONSTRAINT UQ_external_vehicles_legacy_ma_xe UNIQUE (legacy_ma_xe),
    CONSTRAINT UQ_external_vehicles_plate_number UNIQUE (plate_number),
    CONSTRAINT CK_external_vehicles_capacity CHECK (capacity > 0),
    CONSTRAINT CK_external_vehicles_seat_count CHECK (seat_count > 0),
    CONSTRAINT CK_external_vehicles_operational CHECK (operational_status IN (N'ACTIVE', N'INACTIVE')),
    CONSTRAINT CK_external_vehicles_availability CHECK (availability_status IN (N'AVAILABLE', N'ASSIGNED', N'ON_TRIP', N'MAINTENANCE'))
);
GO

CREATE INDEX IX_external_vehicles_availability_status ON dbo.external_vehicles(availability_status);
GO

------------------------------------------------------------
-- 8. OPTION 1 - Dispatch tables
------------------------------------------------------------
CREATE TABLE dbo.route_plans (
    id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    plan_code NVARCHAR(30) NOT NULL,
    planned_start_at DATETIME2(0) NOT NULL,
    planned_end_at DATETIME2(0) NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_route_plans_status DEFAULT N'DRAFT',
    notes NVARCHAR(500) NULL,
    created_by NVARCHAR(50) NULL,
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_route_plans_created_at DEFAULT GETDATE(),
    updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_route_plans_updated_at DEFAULT GETDATE(),
    CONSTRAINT UQ_route_plans_plan_code UNIQUE (plan_code),
    CONSTRAINT CK_route_plans_status CHECK (status IN (N'DRAFT', N'CONFIRMED', N'IN_PROGRESS', N'COMPLETED', N'CANCELLED'))
);
GO

CREATE INDEX IX_route_plans_planned_start_at ON dbo.route_plans(planned_start_at);
GO

CREATE TABLE dbo.route_plan_customers (
    id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    route_plan_id BIGINT NOT NULL,
    external_customer_id INT NOT NULL,
    sequence_no INT NOT NULL,
    customer_code_snapshot NVARCHAR(20) NOT NULL,
    customer_name_snapshot NVARCHAR(100) NOT NULL,
    customer_phone_snapshot VARCHAR(15) NOT NULL,
    pickup_address_snapshot NVARCHAR(255) NOT NULL,
    dropoff_address_snapshot NVARCHAR(255) NOT NULL,
    note NVARCHAR(255) NULL,
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_route_plan_customers_created_at DEFAULT GETDATE(),
    updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_route_plan_customers_updated_at DEFAULT GETDATE(),
    CONSTRAINT FK_route_plan_customers_route_plans
        FOREIGN KEY (route_plan_id) REFERENCES dbo.route_plans(id),
    CONSTRAINT FK_route_plan_customers_external_customers
        FOREIGN KEY (external_customer_id) REFERENCES dbo.external_customers(id),
    CONSTRAINT UQ_route_plan_customers_plan_sequence UNIQUE (route_plan_id, sequence_no),
    CONSTRAINT CK_route_plan_customers_sequence CHECK (sequence_no > 0)
);
GO

CREATE INDEX IX_route_plan_customers_plan_seq ON dbo.route_plan_customers(route_plan_id, sequence_no);
GO

CREATE TABLE dbo.route_plan_vehicle_assignments (
    id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    route_plan_id BIGINT NOT NULL,
    external_vehicle_id INT NOT NULL,
    assignment_status NVARCHAR(20) NOT NULL CONSTRAINT DF_route_plan_vehicle_assignments_status DEFAULT N'SELECTED',
    assigned_at DATETIME2(0) NOT NULL CONSTRAINT DF_route_plan_vehicle_assignments_assigned_at DEFAULT GETDATE(),
    vehicle_code_snapshot NVARCHAR(20) NOT NULL,
    vehicle_plate_snapshot VARCHAR(20) NOT NULL,
    vehicle_type_snapshot NVARCHAR(50) NULL,
    vehicle_capacity_snapshot INT NOT NULL,
    vehicle_seat_count_snapshot INT NOT NULL,
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_route_plan_vehicle_assignments_created_at DEFAULT GETDATE(),
    updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_route_plan_vehicle_assignments_updated_at DEFAULT GETDATE(),
    CONSTRAINT FK_route_plan_vehicle_assignments_route_plans
        FOREIGN KEY (route_plan_id) REFERENCES dbo.route_plans(id),
    CONSTRAINT FK_route_plan_vehicle_assignments_external_vehicles
        FOREIGN KEY (external_vehicle_id) REFERENCES dbo.external_vehicles(id),
    CONSTRAINT UQ_route_plan_vehicle_assignments_plan_vehicle UNIQUE (route_plan_id, external_vehicle_id),
    CONSTRAINT CK_route_plan_vehicle_assignments_status CHECK (assignment_status IN (N'SELECTED', N'CONFIRMED', N'REPLACED'))
);
GO

CREATE INDEX IX_route_plan_vehicle_assignments_plan ON dbo.route_plan_vehicle_assignments(route_plan_id);
GO

CREATE TABLE dbo.route_plan_driver_assignments (
    id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    route_plan_id BIGINT NOT NULL,
    external_driver_id INT NOT NULL,
    route_plan_vehicle_assignment_id BIGINT NULL,
    assignment_status NVARCHAR(20) NOT NULL CONSTRAINT DF_route_plan_driver_assignments_status DEFAULT N'SELECTED',
    assigned_at DATETIME2(0) NOT NULL CONSTRAINT DF_route_plan_driver_assignments_assigned_at DEFAULT GETDATE(),
    driver_code_snapshot NVARCHAR(20) NOT NULL,
    driver_name_snapshot NVARCHAR(100) NOT NULL,
    driver_phone_snapshot VARCHAR(15) NOT NULL,
    driver_national_id_snapshot VARCHAR(20) NULL,
    driver_license_no_snapshot VARCHAR(30) NULL,
    driver_license_class_snapshot NVARCHAR(50) NULL,
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_route_plan_driver_assignments_created_at DEFAULT GETDATE(),
    updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_route_plan_driver_assignments_updated_at DEFAULT GETDATE(),
    CONSTRAINT FK_route_plan_driver_assignments_route_plans
        FOREIGN KEY (route_plan_id) REFERENCES dbo.route_plans(id),
    CONSTRAINT FK_route_plan_driver_assignments_external_drivers
        FOREIGN KEY (external_driver_id) REFERENCES dbo.external_drivers(id),
    CONSTRAINT FK_route_plan_driver_assignments_vehicle_assignment
        FOREIGN KEY (route_plan_vehicle_assignment_id) REFERENCES dbo.route_plan_vehicle_assignments(id),
    CONSTRAINT UQ_route_plan_driver_assignments_plan_driver UNIQUE (route_plan_id, external_driver_id),
    CONSTRAINT CK_route_plan_driver_assignments_status CHECK (assignment_status IN (N'SELECTED', N'CONFIRMED', N'REPLACED'))
);
GO

CREATE INDEX IX_route_plan_driver_assignments_plan ON dbo.route_plan_driver_assignments(route_plan_id);
GO

------------------------------------------------------------
-- 9. OPTION 1 - Support tables
------------------------------------------------------------
CREATE TABLE dbo.source_metadata (
    source_system NVARCHAR(30) NOT NULL PRIMARY KEY,
    source_name NVARCHAR(100) NOT NULL,
    description NVARCHAR(255) NULL,
    last_import_at DATETIME2(0) NULL,
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_source_metadata_created_at DEFAULT GETDATE(),
    updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_source_metadata_updated_at DEFAULT GETDATE()
);
GO

CREATE TABLE dbo.import_logs (
    id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    source_system NVARCHAR(30) NOT NULL,
    entity_type NVARCHAR(30) NOT NULL,
    total_records INT NOT NULL CONSTRAINT DF_import_logs_total DEFAULT 0,
    succeeded_records INT NOT NULL CONSTRAINT DF_import_logs_succeeded DEFAULT 0,
    failed_records INT NOT NULL CONSTRAINT DF_import_logs_failed DEFAULT 0,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_import_logs_status DEFAULT N'SUCCESS',
    started_at DATETIME2(0) NOT NULL CONSTRAINT DF_import_logs_started DEFAULT GETDATE(),
    finished_at DATETIME2(0) NULL,
    error_message NVARCHAR(MAX) NULL
);
GO

CREATE TABLE dbo.route_plan_logs (
    id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    route_plan_id BIGINT NOT NULL,
    event_type NVARCHAR(50) NOT NULL,
    message NVARCHAR(500) NULL,
    payload NVARCHAR(MAX) NULL,
    created_by NVARCHAR(50) NULL,
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_route_plan_logs_created_at DEFAULT GETDATE(),
    CONSTRAINT FK_route_plan_logs_route_plans
        FOREIGN KEY (route_plan_id) REFERENCES dbo.route_plans(id)
);
GO

CREATE INDEX IX_route_plan_logs_plan_time ON dbo.route_plan_logs(route_plan_id, created_at);
GO

------------------------------------------------------------
-- 10. Seed external_* tá»« schema hiá»‡n táº¡i
------------------------------------------------------------
INSERT INTO dbo.source_metadata (source_system, source_name, description, last_import_at)
VALUES (N'SIMULATED', N'Dá»¯ liá»‡u ngoÃ i (giáº£ láº­p)', N'Master data mÃ´ phá»ng cho Ä‘á»“ Ã¡n', GETDATE());
GO

INSERT INTO dbo.external_customers (
    legacy_ma_khach_hang,
    customer_code,
    full_name,
    phone,
    default_pickup_address,
    default_dropoff_address,
    status,
    is_active
)
SELECT
    kh.MaKhachHang,
    CONCAT('KH', RIGHT('00000000' + CAST(kh.MaKhachHang AS VARCHAR(8)), 8)),
    kh.TenKhachHang,
    kh.SoDienThoai,
    kh.DiaChiDon,
    kh.DiaChiTra,
    CASE WHEN kh.TrangThai IS NULL OR kh.TrangThai = N'Hoáº¡t Ä‘á»™ng' THEN N'ACTIVE' ELSE N'INACTIVE' END,
    CASE WHEN kh.TrangThai IS NULL OR kh.TrangThai = N'Hoáº¡t Ä‘á»™ng' THEN 1 ELSE 0 END
FROM dbo.KhachHang kh;
GO

INSERT INTO dbo.external_drivers (
    legacy_ma_tai_xe,
    driver_code,
    employee_code,
    full_name,
    phone,
    national_id,
    license_no,
    license_class,
    work_status,
    availability_status,
    is_active
)
SELECT
    tx.MaTaiXe,
    CASE
        WHEN tx.MaTaiXe < 1000 THEN CONCAT('TX', RIGHT('000' + CAST(tx.MaTaiXe AS VARCHAR(10)), 3))
        ELSE CONCAT('TX', CAST(tx.MaTaiXe AS VARCHAR(10)))
    END,
    tx.MaNhanVienTaiXe,
    tx.HoTen,
    tx.SoDienThoai,
    tx.CCCD,
    NULL,
    tx.LoaiBangLai,
    CASE
        WHEN tx.TrangThaiTaiXe IN (N'Ngá»«ng hoáº¡t Ä‘á»™ng') THEN N'INACTIVE'
        ELSE N'ACTIVE'
    END,
    CASE
        WHEN tx.TrangThaiTaiXe IN (N'Ráº£nh') THEN N'AVAILABLE'
        WHEN tx.TrangThaiTaiXe IN (N'ÄÃ£ phÃ¢n cÃ´ng') THEN N'ASSIGNED'
        WHEN tx.TrangThaiTaiXe IN (N'Äang thá»±c hiá»‡n', N'Äang thá»±c hiá»‡n chuyáº¿n') THEN N'BUSY'
        WHEN tx.TrangThaiTaiXe IN (N'KhÃ´ng sáºµn sÃ ng', N'Ngá»«ng hoáº¡t Ä‘á»™ng') THEN N'OFF'
        ELSE N'AVAILABLE'
    END,
    CASE
        WHEN tx.TrangThaiTaiXe IN (N'Ngá»«ng hoáº¡t Ä‘á»™ng') THEN 0
        ELSE 1
    END
FROM dbo.TaiXe tx;
GO

INSERT INTO dbo.external_vehicles (
    legacy_ma_xe,
    vehicle_code,
    plate_number,
    vehicle_type,
    capacity,
    seat_count,
    operational_status,
    availability_status,
    is_active
)
SELECT
    xe.MaXe,
    CASE
        WHEN xe.MaXe < 1000 THEN CONCAT('XE', RIGHT('000' + CAST(xe.MaXe AS VARCHAR(10)), 3))
        ELSE CONCAT('XE', CAST(xe.MaXe AS VARCHAR(10)))
    END,
    xe.BienSo,
    xe.LoaiXe,
    xe.SoCho,
    xe.SoCho,
    CASE
        WHEN xe.TrangThaiXe IN (N'Ngá»«ng hoáº¡t Ä‘á»™ng') THEN N'INACTIVE'
        ELSE N'ACTIVE'
    END,
    CASE
        WHEN xe.TrangThaiXe IN (N'Ráº£nh') THEN N'AVAILABLE'
        WHEN xe.TrangThaiXe IN (N'ÄÃ£ phÃ¢n cÃ´ng') THEN N'ASSIGNED'
        WHEN xe.TrangThaiXe IN (N'Äang cháº¡y', N'Äang thá»±c hiá»‡n') THEN N'ON_TRIP'
        WHEN xe.TrangThaiXe IN (N'Báº£o trÃ¬') THEN N'MAINTENANCE'
        ELSE N'AVAILABLE'
    END,
    CASE
        WHEN xe.TrangThaiXe IN (N'Ngá»«ng hoáº¡t Ä‘á»™ng') THEN 0
        ELSE 1
    END
FROM dbo.XeTrungChuyen xe;
GO

------------------------------------------------------------
-- 11. Dá»¯ liá»‡u máº«u cho route_plans (Option 1)
------------------------------------------------------------
INSERT INTO dbo.route_plans (plan_code, planned_start_at, planned_end_at, status, notes, created_by)
VALUES (N'RP0001', DATEADD(HOUR, 2, GETDATE()), DATEADD(HOUR, 4, GETDATE()), N'CONFIRMED', N'Káº¿ hoáº¡ch Ä‘iá»u phá»‘i demo', N'dieuphoi1');
GO

DECLARE @RoutePlanId BIGINT = (SELECT TOP 1 id FROM dbo.route_plans WHERE plan_code = N'RP0001');
DECLARE @ExternalCustomer1 INT = (SELECT TOP 1 id FROM dbo.external_customers WHERE phone = '0389123456');
DECLARE @ExternalCustomer2 INT = (SELECT TOP 1 id FROM dbo.external_customers WHERE phone = '0389123452');
DECLARE @ExternalVehicle1 INT = (SELECT TOP 1 id FROM dbo.external_vehicles WHERE plate_number = '51A-12345');
DECLARE @ExternalDriver1 INT = (SELECT TOP 1 id FROM dbo.external_drivers WHERE phone = '0912345678');

INSERT INTO dbo.route_plan_customers (
    route_plan_id,
    external_customer_id,
    sequence_no,
    customer_code_snapshot,
    customer_name_snapshot,
    customer_phone_snapshot,
    pickup_address_snapshot,
    dropoff_address_snapshot,
    note
)
SELECT
    @RoutePlanId,
    ec.id,
    s.sequence_no,
    ec.customer_code,
    ec.full_name,
    ec.phone,
    ec.default_pickup_address,
    ec.default_dropoff_address,
    s.note
FROM dbo.external_customers ec
INNER JOIN (
    VALUES
        ('0389123456', 1, N'KhÃ¡ch Æ°u tiÃªn Ä‘Ã³n trÆ°á»›c'),
        ('0389123452', 2, N'KhÃ¡ch Ä‘i cÃ¹ng chuyáº¿n')
) s(phone, sequence_no, note)
    ON ec.phone = s.phone;

INSERT INTO dbo.route_plan_vehicle_assignments (
    route_plan_id,
    external_vehicle_id,
    assignment_status,
    vehicle_code_snapshot,
    vehicle_plate_snapshot,
    vehicle_type_snapshot,
    vehicle_capacity_snapshot,
    vehicle_seat_count_snapshot
)
SELECT
    @RoutePlanId,
    ev.id,
    N'CONFIRMED',
    ev.vehicle_code,
    ev.plate_number,
    ev.vehicle_type,
    ev.capacity,
    ev.seat_count
FROM dbo.external_vehicles ev
WHERE ev.id = @ExternalVehicle1;

DECLARE @RoutePlanVehicleAssignmentId BIGINT = (
    SELECT TOP 1 id
    FROM dbo.route_plan_vehicle_assignments
    WHERE route_plan_id = @RoutePlanId
      AND external_vehicle_id = @ExternalVehicle1
);

INSERT INTO dbo.route_plan_driver_assignments (
    route_plan_id,
    external_driver_id,
    route_plan_vehicle_assignment_id,
    assignment_status,
    driver_code_snapshot,
    driver_name_snapshot,
    driver_phone_snapshot,
    driver_national_id_snapshot,
    driver_license_no_snapshot,
    driver_license_class_snapshot
)
SELECT
    @RoutePlanId,
    ed.id,
    @RoutePlanVehicleAssignmentId,
    N'CONFIRMED',
    ed.driver_code,
    ed.full_name,
    ed.phone,
    ed.national_id,
    ed.license_no,
    ed.license_class
FROM dbo.external_drivers ed
WHERE ed.id = @ExternalDriver1;

INSERT INTO dbo.route_plan_logs (route_plan_id, event_type, message, payload, created_by)
VALUES
    (@RoutePlanId, N'CREATE_PLAN', N'Táº¡o káº¿ hoáº¡ch Ä‘iá»u phá»‘i demo', NULL, N'dieuphoi1'),
    (@RoutePlanId, N'ASSIGN_VEHICLE', N'GÃ¡n xe cho káº¿ hoáº¡ch demo', NULL, N'dieuphoi1'),
    (@RoutePlanId, N'ASSIGN_DRIVER', N'GÃ¡n tÃ i xáº¿ cho káº¿ hoáº¡ch demo', NULL, N'dieuphoi1');
GO

------------------------------------------------------------
-- 12. Kiá»ƒm tra nhanh sau khi cháº¡y
------------------------------------------------------------
SELECT COUNT(*) AS SoTaiKhoan FROM dbo.TaiKhoanNguoiDung;
SELECT COUNT(*) AS SoNhanVienDieuPhoi FROM dbo.NhanVienDieuPhoi;
SELECT COUNT(*) AS SoTaiXe FROM dbo.TaiXe;
SELECT COUNT(*) AS SoXeTrungChuyen FROM dbo.XeTrungChuyen;
SELECT COUNT(*) AS SoKhachHang FROM dbo.KhachHang;
SELECT COUNT(*) AS SoVeTrungChuyen FROM dbo.VeTrungChuyen;
SELECT COUNT(*) AS SoLoTrinhTrungChuyen FROM dbo.LoTrinhTrungChuyen;
SELECT COUNT(*) AS SoChiTietLoTrinh FROM dbo.ChiTietLoTrinh;
SELECT COUNT(*) AS SoExternalCustomers FROM dbo.external_customers;
SELECT COUNT(*) AS SoExternalDrivers FROM dbo.external_drivers;
SELECT COUNT(*) AS SoExternalVehicles FROM dbo.external_vehicles;
SELECT COUNT(*) AS SoRoutePlans FROM dbo.route_plans;
GO

