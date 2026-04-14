-- Script tạo database và các bảng cho
-- Hệ thống quản lý và điều phối lộ trình xe trung chuyển
-- Phù hợp với cấu hình Node.js (db.js) hiện tại

------------------------------------------------------------
-- 1. Tạo database (nếu chưa tồn tại)
------------------------------------------------------------
IF DB_ID(N'TrungChuyenDB') IS NULL
BEGIN
    CREATE DATABASE TrungChuyenDB;
END;
GO

USE TrungChuyenDB;
GO

------------------------------------------------------------
-- 2. Xóa bảng nếu tồn tại (theo thứ tự FK an toàn)
------------------------------------------------------------
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
-- 3. Tạo bảng theo SRS (phiên bản rút gọn, chuẩn hóa)
------------------------------------------------------------

CREATE TABLE TaiKhoanNguoiDung (
    MaTaiKhoan        INT IDENTITY(1,1) PRIMARY KEY,
    TenDangNhap       VARCHAR(50) NOT NULL UNIQUE,
    MatKhauMaHoa      VARCHAR(255) NOT NULL,
    SoDienThoai       VARCHAR(15) NULL,
    VaiTro            NVARCHAR(30) NULL, -- 'Nhân viên điều phối' / 'Tài xế'
    TrangThaiTaiKhoan BIT NOT NULL DEFAULT 1, -- 1: hoạt động, 0: khóa
    NgayTao           DATETIME NOT NULL DEFAULT GETDATE()
);
GO

CREATE TABLE NhanVienDieuPhoi (
    MaNhanVien INT IDENTITY(1,1) PRIMARY KEY,
    HoTen      NVARCHAR(100) NOT NULL,
    SoDienThoai VARCHAR(15) NULL,
    TrangThai  NVARCHAR(30) NULL,
    MaTaiKhoan INT NULL,
    CONSTRAINT FK_NVDP_TaiKhoanNguoiDung
        FOREIGN KEY (MaTaiKhoan) REFERENCES TaiKhoanNguoiDung(MaTaiKhoan)
);
GO

CREATE TABLE TaiXe (
    MaTaiXe       INT IDENTITY(1,1) PRIMARY KEY,
    HoTen         NVARCHAR(100) NOT NULL,
    SoDienThoai   VARCHAR(15) NOT NULL UNIQUE,
    CCCD          VARCHAR(20) NOT NULL UNIQUE,
    LoaiBangLai   NVARCHAR(50) NULL,
    TrangThaiTaiXe NVARCHAR(30) NULL, -- Rảnh / Đã phân công / Đang thực hiện / Không sẵn sàng / Ngừng hoạt động
    MaTaiKhoan    INT NULL,
    CONSTRAINT FK_TaiXe_TaiKhoanNguoiDung
        FOREIGN KEY (MaTaiKhoan) REFERENCES TaiKhoanNguoiDung(MaTaiKhoan)
);
GO

CREATE TABLE XeTrungChuyen (
    MaXe        INT IDENTITY(1,1) PRIMARY KEY,
    BienSo      VARCHAR(50) NOT NULL UNIQUE,
    LoaiXe      NVARCHAR(50) NOT NULL,
    SoCho       INT NOT NULL,
    TrangThaiXe NVARCHAR(30) NULL -- Rảnh / Đang chạy / Bảo trì ...
);
GO

CREATE TABLE KhachHang (
    MaKhachHang INT IDENTITY(1,1) PRIMARY KEY,
    TenKhachHang NVARCHAR(100) NOT NULL,
    SoDienThoai VARCHAR(15) NOT NULL UNIQUE,
    DiaChiDon   NVARCHAR(255) NOT NULL,
    DiaChiTra   NVARCHAR(255) NOT NULL,
    TrangThai   NVARCHAR(30) NULL
);
GO

CREATE TABLE VeTrungChuyen (
    MaVe               INT IDENTITY(1,1) PRIMARY KEY,
    KhungGioTrungChuyen NVARCHAR(100) NULL,
    SoLuongGhe         INT NOT NULL,
    TrangThaiVe        NVARCHAR(50) NOT NULL, -- Cần trung chuyển / Đã có xe / Đang trung chuyển / Hoàn tất trung chuyển / Hủy
    MaKhachHang        INT NOT NULL,
    CONSTRAINT FK_VeTrungChuyen_KhachHang
        FOREIGN KEY (MaKhachHang) REFERENCES KhachHang(MaKhachHang)
);
GO

CREATE TABLE LoTrinhTrungChuyen (
    MaLoTrinh            INT IDENTITY(1,1) PRIMARY KEY,
    ThoiGianBatDau       DATETIME NOT NULL,
    ThoiGianKetThuc      DATETIME NULL,
    LoTrinhDuKien        NVARCHAR(MAX) NULL,
    GhiChu               NVARCHAR(MAX) NULL,
    TrangThaiLoTrinh     NVARCHAR(50) NOT NULL, -- Chưa thực hiện / Đang thực hiện / Hoàn thành / Đang gặp sự cố / Đã hủy
    MaXe                 INT NOT NULL,
    MaTaiXe              INT NOT NULL,
    MaNhanVien           INT NOT NULL,
    CONSTRAINT FK_LoTrinh_XeTrungChuyen
        FOREIGN KEY (MaXe) REFERENCES XeTrungChuyen(MaXe),
    CONSTRAINT FK_LoTrinh_TaiXe
        FOREIGN KEY (MaTaiXe) REFERENCES TaiXe(MaTaiXe),
    CONSTRAINT FK_LoTrinh_NhanVienDieuPhoi
        FOREIGN KEY (MaNhanVien) REFERENCES NhanVienDieuPhoi(MaNhanVien)
);
GO

CREATE TABLE ChiTietLoTrinh (
    MaChiTiet          INT IDENTITY(1,1) PRIMARY KEY,
    ThuTuDonTra        INT NOT NULL,
    DiemDon            NVARCHAR(255) NOT NULL,
    DiemTra            NVARCHAR(255) NOT NULL,
    ThoiGianDonDuKien  DATETIME NULL,
    TrangThaiKhach     NVARCHAR(50) NULL, -- Đã đến điểm đón / Đã đón / Đã trả / Khách hủy
    MaLoTrinh          INT NOT NULL,
    MaVe               INT NOT NULL,
    CONSTRAINT FK_ChiTietLoTrinh_LoTrinh
        FOREIGN KEY (MaLoTrinh) REFERENCES LoTrinhTrungChuyen(MaLoTrinh),
    CONSTRAINT FK_ChiTietLoTrinh_VeTrungChuyen
        FOREIGN KEY (MaVe) REFERENCES VeTrungChuyen(MaVe)
);
GO

CREATE TABLE TheoDoiTrangThai (
    MaTheoDoi       INT IDENTITY(1,1) PRIMARY KEY,
    ViTriHienTai    NVARCHAR(255) NULL,
    ThoiDiemCapNhat DATETIME NOT NULL DEFAULT GETDATE(),
    TrangThai       NVARCHAR(50) NULL,
    MaLoTrinh       INT NOT NULL,
    CONSTRAINT FK_TheoDoiTrangThai_LoTrinh
        FOREIGN KEY (MaLoTrinh) REFERENCES LoTrinhTrungChuyen(MaLoTrinh)
);
GO

------------------------------------------------------------
-- 3.1. Constraint / index cơ bản cho dữ liệu demo ổn định hơn
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
-- 4. Seed dữ liệu mẫu để đăng nhập và thử hệ thống
------------------------------------------------------------

-- Tài khoản mẫu: nhân viên điều phối
INSERT INTO TaiKhoanNguoiDung (TenDangNhap, MatKhauMaHoa, SoDienThoai, VaiTro, TrangThaiTaiKhoan)
VALUES
    ('dieuphoi1', '$2b$10$j5ckBh1OXxBcB3YYYUk/WuOr8xCTBGcmLMhInnW1uoGUs5kOaMxIi', '0812345678', N'Nhân viên điều phối', 1);

DECLARE @MaTK_NVDP INT = SCOPE_IDENTITY();

INSERT INTO NhanVienDieuPhoi (HoTen, SoDienThoai, TrangThai, MaTaiKhoan)
VALUES (N'Nhân viên điều phối 1', '0812345678', N'Hoạt động', @MaTK_NVDP);

-- Tài khoản mẫu: tài xế
INSERT INTO TaiKhoanNguoiDung (TenDangNhap, MatKhauMaHoa, SoDienThoai, VaiTro, TrangThaiTaiKhoan)
VALUES
    ('taixe1', '$2b$10$j5ckBh1OXxBcB3YYYUk/WuOr8xCTBGcmLMhInnW1uoGUs5kOaMxIi', '0912345678', N'Tài xế', 1);

DECLARE @MaTK_TaiXe INT = SCOPE_IDENTITY();

INSERT INTO TaiXe (HoTen, SoDienThoai, CCCD, LoaiBangLai, TrangThaiTaiXe, MaTaiKhoan)
VALUES (N'Tài xế 1', '0912345678', '012345678901', N'C', N'Rảnh', @MaTK_TaiXe);

-- Một vài xe mẫu
INSERT INTO XeTrungChuyen (BienSo, LoaiXe, SoCho, TrangThaiXe)
VALUES
    ('43B-012.34', N'Xe 16 chỗ', 16, N'Rảnh'),
    ('43B-246.80', N'Xe 7 chỗ', 7, N'Rảnh');

-- Một vài khách hàng và vé mẫu
INSERT INTO KhachHang (TenKhachHang, SoDienThoai, DiaChiDon, DiaChiTra, TrangThai)
VALUES
    (N'Hà Văn Nam', '0389123456', N'56 Chu Mạnh Trinh', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Nguyễn Thị Thuận', '0389123452', N'36 Tú Quỳ', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Lê Minh Dai', '0981234567', N'12 Nguyễn Văn Linh', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Phạm Thị Dung', '0912345678', N'34 Lê Duẩn', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Trần Hoàng Bách', '0901234567', N'56 Trần Phú', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Nguyễn Văn Phương', '0922333444', N'78 Hùng Vương', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Lý Thị Giang', '0933444555', N'90 Điện Biên Phủ', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Võ Thành Hòa', '0944555666', N'123 Nguyễn Tất Thành', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Đỗ Minh Hiếu', '0955666777', N'45 Bạch Đằng', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Bùi Văn Hoàng', '0966777888', N'67 Trần Hưng Đạo', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Ngô Tuấn Anh', '0977888999', N'89 Lê Lợi', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Phan Thị Lan', '0988999000', N'101 Nguyễn Hoàng', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Đặng Hữu Minh', '0999000111', N'202 Tôn Đức Thắng', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Hồ Ngọc Nhi', '0911222333', N'303 Nguyễn Lương Bằng', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Dương Quốc Đạt', '0922333444', N'404 Phạm Hùng', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Mai Anh Phương', '0933444555', N'505 Lê Trọng Tấn', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Trịnh Cẩm Quang', '0944555666', N'606 Trường Chinh', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Đinh Trọng Thành', '0955666777', N'707 Điện Biên Phủ', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Lâm Bảo Sơn', '0966777888', N'808 Hải Phòng', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Thái Huy Thông', '0977888999', N'909 Núi Thành', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Châu Gia Uy', '0988999000', N'1010 Tiểu La', N'Bến xe Đà Nẵng', N'Hoạt động'),
    (N'Trương Hữu Vũ', '0999000111', N'1111 Phan Đăng Lưu', N'Bến xe Đà Nẵng', N'Hoạt động');

INSERT INTO VeTrungChuyen (KhungGioTrungChuyen, SoLuongGhe, TrangThaiVe, MaKhachHang)
VALUES
    (N'7:00 - 9:00', 1, N'Cần trung chuyển', 1),
    (N'7:00 - 9:00', 2, N'Cần trung chuyển', 2),
    (N'7:00 - 9:00', 1, N'Cần trung chuyển', 3),
    (N'7:00 - 9:00', 1, N'Cần trung chuyển', 4),
    (N'7:00 - 9:00', 2, N'Cần trung chuyển', 5),
    (N'7:00 - 9:00', 1, N'Cần trung chuyển', 6),
    (N'9:00 - 11:00', 1, N'Cần trung chuyển', 7),
    (N'9:00 - 11:00', 2, N'Cần trung chuyển', 8),
    (N'9:00 - 11:00', 1, N'Cần trung chuyển', 9),
    (N'9:00 - 11:00', 1, N'Cần trung chuyển', 10),
    (N'9:00 - 11:00', 2, N'Cần trung chuyển', 11),
    (N'9:00 - 11:00', 1, N'Cần trung chuyển', 12),
    (N'11:00 - 13:00', 1, N'Cần trung chuyển', 13),
    (N'11:00 - 13:00', 2, N'Cần trung chuyển', 14),
    (N'11:00 - 13:00', 1, N'Cần trung chuyển', 15),
    (N'11:00 - 13:00', 1, N'Cần trung chuyển', 16),
    (N'11:00 - 13:00', 2, N'Cần trung chuyển', 17),
    (N'11:00 - 13:00', 1, N'Cần trung chuyển', 18),
    (N'15:00 - 17:00', 1, N'Cần trung chuyển', 19),
    (N'7:00 - 9:00', 2, N'Cần trung chuyển', 20),
    (N'9:00 - 11:00', 1, N'Cần trung chuyển', 21),
    (N'13:00 - 15:00', 1, N'Cần trung chuyển', 22);

------------------------------------------------------------
-- 5. Tạo một lộ trình mẫu + chi tiết + theo dõi trạng thái
------------------------------------------------------------

DECLARE @MaXe1 INT = (SELECT TOP 1 MaXe FROM XeTrungChuyen ORDER BY MaXe);
DECLARE @MaTaiXe1 INT = (SELECT TOP 1 MaTaiXe FROM TaiXe ORDER BY MaTaiXe);
DECLARE @MaNhanVien1 INT = (SELECT TOP 1 MaNhanVien FROM NhanVienDieuPhoi ORDER BY MaNhanVien);

INSERT INTO LoTrinhTrungChuyen
  (ThoiGianBatDau, ThoiGianKetThuc, LoTrinhDuKien, GhiChu, TrangThaiLoTrinh, MaXe, MaTaiXe, MaNhanVien)
VALUES
  (DATEADD(HOUR, 1, GETDATE()), NULL, N'Q5 → Q1 → Bến xe Đà Nẵng', NULL, N'Đang thực hiện', @MaXe1, @MaTaiXe1, @MaNhanVien1);

DECLARE @MaLoTrinh1 INT = SCOPE_IDENTITY();

INSERT INTO ChiTietLoTrinh
  (ThuTuDonTra, DiemDon, DiemTra, ThoiGianDonDuKien, TrangThaiKhach, MaLoTrinh, MaVe)
VALUES
  (1, N'Quận 5', N'Bến xe Đà Nẵng', DATEADD(HOUR, 1, GETDATE()), N'Đã đến điểm đón', @MaLoTrinh1, 1);

INSERT INTO TheoDoiTrangThai (ViTriHienTai, TrangThai, MaLoTrinh)
VALUES (N'Đang tại Quận 5', N'Đang thực hiện', @MaLoTrinh1);

------------------------------------------------------------
-- 6. Gợi ý đăng nhập
------------------------------------------------------------
-- Backend /frontend hiện có thể dùng:
--  Tên đăng nhập: dieuphoi1
--  Mật khẩu:      123456   (đã hash bcrypt trong script seed)
--
-- Hoặc tài xế:
--  Tên đăng nhập: taixe1
--  Mật khẩu:      123456

SELECT*FROM ChiTietLoTrinh
select*from KhachHang