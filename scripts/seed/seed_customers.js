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
        console.log('🔄 Bắt đầu tạo 20 bản ghi chuyến xe trung chuyển (Hoàn thành)...');

        // 1. Đảm bảo có ít nhất 1 Nhân viên điều phối
        let maNhanVien = 1;
        const nv = await pool.request().query('SELECT MaNhanVien FROM NhanVienDieuPhoi LIMIT 1');
        if (nv.recordset.length > 0) {
            maNhanVien = nv.recordset[0].MaNhanVien;
        } else {
            const newNv = await pool.request().query("INSERT INTO NhanVienDieuPhoi (HoTen, SoDienThoai, TrangThai) VALUES (N'Tổ Điều Phối', '0901234567', N'Hoạt động') RETURNING MaNhanVien");
            maNhanVien = newNv.recordset[0].MaNhanVien;
        }

        // 20 Địa điểm nổi tiếng/trung tâm tại Đà Nẵng
        const locations = [
            "Bệnh viện Đà Nẵng", "Đại học Bách Khoa Đà Nẵng", "Cầu Rồng", 
            "Sân bay Quốc tế Đà Nẵng", "Chợ Cồn", "Cảng Tiên Sa", 
            "Bãi biển Mỹ Khê", "Công viên Châu Á (Asia Park)", "Khu du lịch Ngũ Hành Sơn", 
            "Đại học Kinh tế Đà Nẵng", "Bệnh viện Phụ sản - Nhi", "Chợ Hàn", 
            "Chùa Linh Ứng", "Ga Đà Nẵng", "Vincom Plaza Ngô Quyền",
            "Đại học Duy Tân", "Bệnh viện Ung Bướu Đà Nẵng", "Bến xe buýt Xuân Diệu",
            "Cầu Trần Thị Lý", "Bảo tàng Điêu khắc Chăm"
        ];
        
        // 20 Tên tài xế Việt Nam
        const drivers = [
            "Nguyễn Văn An", "Trần Bá Bách", "Lê Công Chính", "Phạm Đình Dũng", "Hoàng Ân",
            "Võ Quang Hải", "Đặng Vĩ", "Bùi Khánh", "Đỗ Long", "Hồ Trọng Đạt",
            "Ngô Tấn Tài", "Dương Trí", "Lý Nhất", "Đoàn Kha", "Vũ Quốc",
            "Trịnh Sơn", "Đinh Phong", "Cao Lâm", "Thái Kiên", "Châu Bảo"
        ];

        for (let i = 0; i < 20; i++) {
            // Biển số 43B hoặc 43E
            const prefix = i % 2 === 0 ? '43B' : '43E';
            const numPart1 = String(100 + i).slice(-3);
            const numPart2 = String(10 + i * 2).slice(-2);
            const bienSo = `${prefix}-${numPart1}.${numPart2}`;
            
            // Số điện thoại và CCCD
            const phone = `099000${String(i).padStart(4, '0')}`;
            const cccd = `04820000${String(i).padStart(4, '0')}`;

            // Tạo Xe
            const xeRs = await pool.request()
                .input('bienSo', sql.VarChar, bienSo)
                .input('loaiXe', sql.NVarChar, 'Xe 16 chỗ')
                .input('soCho', sql.Int, 16)
                .input('trangThai', sql.NVarChar, 'Rảnh')
                .query(`
                    INSERT INTO XeTrungChuyen (BienSo, LoaiXe, SoCho, TrangThaiXe)
                    VALUES (@bienSo, @loaiXe, @soCho, @trangThai)
                    ON CONFLICT (BienSo) DO UPDATE
                    SET LoaiXe = EXCLUDED.LoaiXe,
                        SoCho = EXCLUDED.SoCho,
                        TrangThaiXe = EXCLUDED.TrangThaiXe
                    RETURNING MaXe
                `);
            const maXe = xeRs.recordset[0].MaXe;

            // Tạo Tài xế
            const txRs = await pool.request()
                .input('Ten', sql.NVarChar, drivers[i])
                .input('Phone', sql.VarChar, phone)
                .input('cccd', sql.VarChar, cccd)
                .query(`
                    INSERT INTO TaiXe (HoTen, SoDienThoai, CCCD, LoaiBangLai, TrangThaiTaiXe)
                    VALUES (@Ten, @Phone, @cccd, N'D', N'Rảnh')
                    ON CONFLICT (SoDienThoai) DO UPDATE
                    SET HoTen = EXCLUDED.HoTen,
                        LoaiBangLai = EXCLUDED.LoaiBangLai,
                        TrangThaiTaiXe = EXCLUDED.TrangThaiTaiXe
                    RETURNING MaTaiXe
                `);
            const maTaiXe = txRs.recordset[0].MaTaiXe;

            // Thời gian: Tháng 3 năm 2026. Bắt đầu từ 6h sáng -> 15h
            const startHour = 6 + Math.floor(i / 2); 
            const startMin = (i % 2) * 30; // 0 hoặc 30 phút
            const thoiGianBatDau = new Date(2026, 2, Math.floor(i/2) + 1, startHour, startMin, 0); // Tháng 2 = Tháng 3
            
            // Khoảng cách thời gian: 30 - 60 phút
            const durationMins = 30 + (i % 30); 
            const thoiGianKetThuc = new Date(thoiGianBatDau.getTime() + durationMins * 60000);

            // Sinh Mã Chuyến (Lưu vào GhiChu)
            const maChuyenStr = `CX${String(i+1).padStart(8, '0')}`;
            const loTrinh = `Bến xe Trung tâm Đà Nẵng - ${locations[i]}`;

            // Tạo Lộ Trình (Trip) - TrangThaiLoTrinh: 'Hoàn thành'
            const ltRs = await pool.request()
                .input('tgbd', sql.DateTime, thoiGianBatDau)
                .input('tgkt', sql.DateTime, thoiGianKetThuc)
                .input('loTrinh', sql.NVarChar, loTrinh)
                .input('tThai', sql.NVarChar, 'Hoàn thành')
                .input('ghiChu', sql.NVarChar, `Mã số chuyến: ${maChuyenStr}`)
                .input('maXe', sql.Int, maXe)
                .input('maTX', sql.Int, maTaiXe)
                .input('maNV', sql.Int, maNhanVien)
                .query(`
                    INSERT INTO LoTrinhTrungChuyen 
                    (ThoiGianBatDau, ThoiGianKetThuc, LoTrinhDuKien, TrangThaiLoTrinh, GhiChu, MaXe, MaTaiXe, MaNhanVien)
                    VALUES (@tgbd, @tgkt, @loTrinh, @tThai, @ghiChu, @maXe, @maTX, @maNV)
                    RETURNING MaLoTrinh
                `);
            
            const maLoTrinh = ltRs.recordset[0].MaLoTrinh;

            // Seed thêm 1 khách hàng cho chuyến này cho đầy đủ constraints (Khách hàng -> Vé -> Chi tiết)
            const khPhone = `0300123${String(i).padStart(3, '0')}`;
            const khRs = await pool.request()
                .input('name', sql.NVarChar, `Khách Hành Tây ${i+1}`)
                .input('phone', sql.VarChar, khPhone)
                .input('don', sql.NVarChar, 'Bến xe Đà Nẵng')
                .input('tra', sql.NVarChar, locations[i])
                .query(`
                    INSERT INTO KhachHang (TenKhachHang, SoDienThoai, DiaChiDon, DiaChiTra, TrangThai)
                    VALUES (@name, @phone, @don, @tra, N'Hoạt động')
                    RETURNING MaKhachHang
                `);
            const maKH = khRs.recordset[0].MaKhachHang;
            const pickupCoordinates = lookupAddressCoordinates('Bến xe Đà Nẵng');
            const dropoffCoordinates = lookupAddressCoordinates(locations[i]);

            await pool.request()
                .input('maKH', sql.Int, maKH)
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
                    WHERE MaKhachHang = @maKH
                `);

            const veRs = await pool.request()
                .input('khId', sql.Int, maKH)
                .query(`
                    INSERT INTO VeTrungChuyen (KhungGioTrungChuyen, SoLuongGhe, TrangThaiVe, MaKhachHang)
                    VALUES (N'06:00 - 18:00', 1, N'Hoàn tất trung chuyển', @khId)
                    RETURNING MaVe
                `);
            const maVe = veRs.recordset[0].MaVe;

            await pool.request()
                .input('routeId', sql.Int, maLoTrinh)
                .input('veId', sql.Int, maVe)
                .input('pick', sql.NVarChar, 'Bến xe Đà Nẵng')
                .input('drop', sql.NVarChar, locations[i])
                .input('time', sql.DateTime, thoiGianBatDau)
                .query(`
                    INSERT INTO ChiTietLoTrinh (MaLoTrinh, MaVe, ThuTuDonTra, DiemDon, DiemTra, ThoiGianDonDuKien, TrangThaiKhach)
                    VALUES (@routeId, @veId, 1, @pick, @drop, @time, N'Đã trả')
                `);

            await pool.request()
                .input('routeId', sql.Int, maLoTrinh)
                .input('veId', sql.Int, maVe)
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
                    WHERE MaLoTrinh = @routeId AND MaVe = @veId
                `);

            console.log(`✅ [${maChuyenStr}] | Biển số: ${bienSo} | Tài xế: ${drivers[i]} | Lộ trình: ${loTrinh} (${durationMins} phút)`);
        }

        console.log('🎉 Đã tạo thành công 20 bản ghi chuyến xe trung chuyển!');
        process.exit(0);
    } catch (err) {
        console.error('Lỗi khi seed data:', err);
        process.exit(1);
    }
}

seed();
