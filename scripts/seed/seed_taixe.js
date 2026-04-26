const { getPool, sql } = require('../../backend/src/db');
const { lookupAddressCoordinates } = require('../../backend/src/utils/locationCoordinates');

function attachLocationInputs(request, prefix, address) {
    const coordinates = lookupAddressCoordinates(address);
    return request
        .input(`${prefix}Lat`, sql.Decimal(10, 7), coordinates?.lat ?? null)
        .input(`${prefix}Lng`, sql.Decimal(10, 7), coordinates?.lng ?? null);
}

async function seed() {
    try {
        const pool = await getPool();
        console.log('🔄 Bắt đầu dọn và tạo lại dữ liệu chuyến xe cho tài khoản [taixe1]...');

        // 1. Tìm tài xế tương ứng với tài khoản taixe1
        const rTK = await pool.request().query("SELECT MaTaiKhoan FROM TaiKhoanNguoiDung WHERE TenDangNhap = 'taixe1'");
        if (rTK.recordset.length === 0) throw new Error("Thất bại: Không tìm thấy user taixe1 trong database.");
        const maTK = rTK.recordset[0].MaTaiKhoan;

        const rTX = await pool.request().input('maTK', sql.Int, maTK).query("SELECT MaTaiXe FROM TaiXe WHERE MaTaiKhoan = @maTK");
        if (rTX.recordset.length === 0) throw new Error("Chưa có hồ sơ Tài xế liên kết với user taixe1.");
        const maTX = rTX.recordset[0].MaTaiXe;

        // Cập nhật tên tài xế thành Nguyễn Văn A để đồng bộ UI
        await pool.request().input('maTX', sql.Int, maTX).query("UPDATE TaiXe SET HoTen = N'Nguyễn Văn A' WHERE MaTaiXe = @maTX");

        // 2. Lấy/tạo 1 xe cố định (VD: 43B-12345)
        let maXe;
        const rXe = await pool.request().query("SELECT MaXe FROM XeTrungChuyen WHERE BienSo = '43B-12345'");
        if (rXe.recordset.length === 0) {
            const rx2 = await pool.request().query("INSERT INTO XeTrungChuyen (BienSo, LoaiXe, SoCho, TrangThaiXe) OUTPUT INSERTED.MaXe VALUES ('43B-12345', N'Xe 16 chỗ', 16, N'Rảnh')");
            maXe = rx2.recordset[0].MaXe;
        } else {
            maXe = rXe.recordset[0].MaXe;
        }

        // 3. Truy xuất Điều phối viên để thỏa mãn khóa ngoại
        let maNV = 1;
        const rNV = await pool.request().query("SELECT TOP 1 MaNhanVien FROM NhanVienDieuPhoi");
        if (rNV.recordset.length > 0) maNV = rNV.recordset[0].MaNhanVien;

        // ===================================
        // Cài đặt thời gian gốc
        // ===================================
        const today = new Date();
        today.setFullYear(2026);

        // ===================================
        // 4. Tạo 3 chuyến "Chưa thực hiện"
        // ===================================
        const routes = [
            "Bến xe Trung tâm Đà Nẵng - Bệnh viện Phụ sản Nhi",
            "Bến xe Trung tâm Đà Nẵng - Đại học Bách Khoa Đà Nẵng",
            "Bến xe Trung tâm Đà Nẵng - Cầu Rồng"
        ];
        
        for (let i = 0; i < 3; i++) {
            // Dự kiến chạy sớm: 10, 40, và 70 phút nữa so với thời điểm hiện tại
            const startTime = new Date(today.getTime() + (10 + i * 30) * 60000); 
            const rString = routes[i];
            
            // Format mã chuyến CX + 8 số
            const cxCode = `CX${String(100 + i).padStart(8, '0')}`;
            const diemTra = rString.split(' - ')[1];

            // Thêm lộ trình
            const rInsert = await pool.request()
                .input('tgbd', sql.DateTime, startTime)
                .input('loTrinh', sql.NVarChar, rString)
                .input('ghiChu', sql.NVarChar, `Mã chuyến: ${cxCode}`)
                .input('maXe', sql.Int, maXe)
                .input('maTX', sql.Int, maTX)
                .input('maNV', sql.Int, maNV)
                .query(`
                    INSERT INTO LoTrinhTrungChuyen (ThoiGianBatDau, LoTrinhDuKien, TrangThaiLoTrinh, GhiChu, MaXe, MaTaiXe, MaNhanVien)
                    OUTPUT INSERTED.MaLoTrinh
                    VALUES (@tgbd, @loTrinh, N'Chưa thực hiện', @ghiChu, @maXe, @maTX, @maNV)
                `);
            const maLT = rInsert.recordset[0].MaLoTrinh;
            
            // Thêm chi tiết khách hàng và vé đi liền lộ trình đó
            const kName = `Hành Khách VIP ${i+1}`;
            const kPhone = `099888770${i}`;
            const rKH = await pool.request()
                .input('name', sql.NVarChar, kName).input('phone', sql.VarChar, kPhone).input('tra', sql.NVarChar, diemTra)
                .query(`
                    INSERT INTO KhachHang (TenKhachHang, SoDienThoai, DiaChiDon, DiaChiTra, TrangThai) 
                    OUTPUT INSERTED.MaKhachHang 
                    VALUES (@name, @phone, N'Bến xe Trung tâm Đà Nẵng', @tra, N'Hoạt động')
                `);
            const mKH = rKH.recordset[0].MaKhachHang;
            const pickupCoordinates = lookupAddressCoordinates('Bến xe Trung tâm Đà Nẵng');
            const dropoffCoordinates = lookupAddressCoordinates(diemTra);

            await pool.request()
                .input('mKH', sql.Int, mKH)
                .input('pickupLat', sql.Decimal(10, 7), pickupCoordinates?.lat ?? null)
                .input('pickupLng', sql.Decimal(10, 7), pickupCoordinates?.lng ?? null)
                .input('dropoffLat', sql.Decimal(10, 7), dropoffCoordinates?.lat ?? null)
                .input('dropoffLng', sql.Decimal(10, 7), dropoffCoordinates?.lng ?? null)
                .query(`
                    UPDATE KhachHang
                    SET DiaChiDonLat = @pickupLat,
                        DiaChiDonLng = @pickupLng,
                        DiaChiTraLat = @dropoffLat,
                        DiaChiTraLng = @dropoffLng
                    WHERE MaKhachHang = @mKH
                `);

            const rVe = await pool.request().input('mKH', sql.Int, mKH).query(`
                INSERT INTO VeTrungChuyen (KhungGioTrungChuyen, SoLuongGhe, TrangThaiVe, MaKhachHang) 
                OUTPUT INSERTED.MaVe 
                VALUES (N'Hôm nay', 1, N'Đã có xe', @mKH)
            `);
            const mVe = rVe.recordset[0].MaVe;

            await pool.request()
                .input('maLT', sql.Int, maLT).input('mVe', sql.Int, mVe).input('tra', sql.NVarChar, diemTra)
                .query(`
                    INSERT INTO ChiTietLoTrinh (ThuTuDonTra, DiemDon, DiemTra, TrangThaiKhach, MaLoTrinh, MaVe) 
                    VALUES (1, N'Bến xe Trung tâm Đà Nẵng', @tra, NULL, @maLT, @mVe)
                `);

            await pool.request()
                .input('maLT', sql.Int, maLT)
                .input('mVe', sql.Int, mVe)
                .input('pickupLat', sql.Decimal(10, 7), pickupCoordinates?.lat ?? null)
                .input('pickupLng', sql.Decimal(10, 7), pickupCoordinates?.lng ?? null)
                .input('dropoffLat', sql.Decimal(10, 7), dropoffCoordinates?.lat ?? null)
                .input('dropoffLng', sql.Decimal(10, 7), dropoffCoordinates?.lng ?? null)
                .query(`
                    UPDATE ChiTietLoTrinh
                    SET DiemDonLat = @pickupLat,
                        DiemDonLng = @pickupLng,
                        DiemTraLat = @dropoffLat,
                        DiemTraLng = @dropoffLng
                    WHERE MaLoTrinh = @maLT AND MaVe = @mVe
                `);

            console.log(`✅ [${cxCode}] Đã phân công chuyến "Chưa thực hiện": ${rString}`);
        }

        // ===================================
        // 5. Tạo 1 chuyến "Hoàn thành"
        // ===================================
        const cxCodeDone = `CX${String(103).padStart(8, '0')}`;
        const startTimeDone = new Date(today.getTime() - 120 * 60000); // Cách đây 120 phút
        const endTimeDone = new Date(today.getTime() - 60 * 60000);    // Cách đây 60 phút

        await pool.request()
            .input('tgbd', sql.DateTime, startTimeDone)
            .input('tgkt', sql.DateTime, endTimeDone)
            .input('loTrinh', sql.NVarChar, "Bến xe Trung tâm Đà Nẵng - Sân bay Quốc tế Đà Nẵng")
            .input('ghiChu', sql.NVarChar, `Mã chuyển: ${cxCodeDone}`)
            .input('maXe', sql.Int, maXe)
            .input('maTX', sql.Int, maTX)
            .input('maNV', sql.Int, maNV)
            .query(`
                INSERT INTO LoTrinhTrungChuyen (ThoiGianBatDau, ThoiGianKetThuc, LoTrinhDuKien, TrangThaiLoTrinh, GhiChu, MaXe, MaTaiXe, MaNhanVien)
                VALUES (@tgbd, @tgkt, @loTrinh, N'Hoàn thành', @ghiChu, @maXe, @maTX, @maNV)
            `);
        console.log(`✅ [${cxCodeDone}] Đã tạo lịch sử chuyến "Hoàn thành": Bến xe Trung tâm Đà Nẵng - Sân bay Quốc tế Đà Nẵng`);

        console.log('🎉 Danh sách phân công cho Tài xế taixe1 Đã Sẵn Sàng!');
        process.exit(0);
    } catch(err) {
        console.error("Lỗi tạo dữ liệu Tài xế:", err);
        process.exit(1);
    }
}

seed();
