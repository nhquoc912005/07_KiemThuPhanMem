const { getPool, sql } = require('../../src/db');

async function seed() {
    try {
        const pool = await getPool();
        console.log('🔄 Bắt đầu tạo dữ liệu giả lập cho Dashboard "Điều phối lộ trình"...');

        // Lấy hoặc tạo 1 Nhân viên điều phối
        let maNhanVien = 1;
        const nv = await pool.request().query('SELECT TOP 1 MaNhanVien FROM NhanVienDieuPhoi');
        if (nv.recordset.length > 0) {
            maNhanVien = nv.recordset[0].MaNhanVien;
        } else {
            const newNv = await pool.request().query("INSERT INTO NhanVienDieuPhoi (HoTen, SoDienThoai, TrangThai) OUTPUT INSERTED.MaNhanVien VALUES (N'Nhân viên Dashboard', '0901111111', N'Hoạt động')");
            maNhanVien = newNv.recordset[0].MaNhanVien;
        }

        // Lấy thời điểm hiện tại và set về năm 2026
        const now = new Date();
        now.setFullYear(2026);

        // ==========================================
        // 1. Tạo 20 Xe sẵn sàng ("Rảnh") và 20 Tài xế "Rảnh"
        // ==========================================
        for(let i=1; i<=20; i++) {
            const bienSo = i % 2 === 0 ? `43B-200.${String(i).padStart(2, '0')}` : `43E-200.${String(i).padStart(2, '0')}`;
            await pool.request().input('bienSo', sql.VarChar, bienSo).query(`
                IF NOT EXISTS (SELECT 1 FROM XeTrungChuyen WHERE BienSo = @bienSo)
                    INSERT INTO XeTrungChuyen (BienSo, LoaiXe, SoCho, TrangThaiXe) VALUES (@bienSo, N'Xe 16 chỗ', 16, N'Rảnh')
            `);

            const sdt = `099111${String(i).padStart(4, '0')}`;
            const cccd = `04820111${String(i).padStart(4, '0')}`;
            await pool.request().input('sdt', sql.VarChar, sdt).input('cccd', sql.VarChar, cccd).query(`
                IF NOT EXISTS (SELECT 1 FROM TaiXe WHERE SoDienThoai = @sdt)
                    INSERT INTO TaiXe (HoTen, SoDienThoai, CCCD, LoaiBangLai, TrangThaiTaiXe) VALUES (N'Tài xế rảnh ${i}', @sdt, @cccd, N'D', N'Rảnh')
            `);
        }
        console.log('✅ Đã tạo/đảm bảo 20 Xe mang trạng thái "Rảnh" & 20 Tài xế mang trạng thái "Rảnh"');

        // ==========================================
        // 2. Tạo 8 yêu cầu "Chờ xử lý" (Cần trung chuyển)
        // ==========================================
        const pendingCustomers = [
            { name: 'Nguyễn Văn C', phone: '0901234501', don: '123 Lê Duẩn, Quận Hải Châu', tra: 'Bến xe Trung tâm Đà Nẵng' },
            { name: 'Trần Thị B', phone: '0901234502', don: 'Bệnh viện Phụ sản - Nhi', tra: 'Bến xe Trung tâm Đà Nẵng' },
            { name: 'Lê Hoàng D', phone: '0901234503', don: 'Sân bay Quốc tế Đà Nẵng', tra: 'Bến xe Trung tâm Đà Nẵng' },
            { name: 'Phạm Quang E', phone: '0901234504', don: 'Chợ Hàn', tra: 'Bến xe Trung tâm Đà Nẵng' },
            { name: 'Vũ Thị F', phone: '0901234505', don: 'Trạm xe buýt Xuân Diệu', tra: 'Bến xe Trung tâm Đà Nẵng' },
            { name: 'Đặng Tuấn G', phone: '0901234506', don: 'Đại học Duy Tân', tra: 'Bến xe Trung tâm Đà Nẵng' },
            { name: 'Ngô Lê H', phone: '0901234507', don: 'Đại học Bách Khoa', tra: 'Bến xe Trung tâm Đà Nẵng' },
            { name: 'Châu Minh K', phone: '0901234508', don: 'Cầu Rồng', tra: 'Bến xe Trung tâm Đà Nẵng' }
        ];

        for(const c of pendingCustomers) {
            const khRs = await pool.request()
                .input('name', sql.NVarChar, c.name).input('phone', sql.VarChar, c.phone)
                .input('don', sql.NVarChar, c.don).input('tra', sql.NVarChar, c.tra)
                .query(`INSERT INTO KhachHang (TenKhachHang, SoDienThoai, DiaChiDon, DiaChiTra, TrangThai) OUTPUT INSERTED.MaKhachHang VALUES (@name, @phone, @don, @tra, N'Hoạt động')`);
            
            const maKH = khRs.recordset[0].MaKhachHang;

            await pool.request()
                .input('maKH', sql.Int, maKH)
                .query(`INSERT INTO VeTrungChuyen (KhungGioTrungChuyen, SoLuongGhe, TrangThaiVe, MaKhachHang) VALUES (N'Hôm nay', 1, N'Cần trung chuyển', @maKH)`);
        }
        console.log('✅ Đã tạo 8 khách hàng chờ gán xe, trạng thái vé "Cần trung chuyển" (Đang chờ xử lý).');

        // ==========================================
        // 3. Tạo 4 "Lộ trình đang diễn ra" 
        // ==========================================
        const inProgressRoutes = [
            { xe: '43B-333.31', txPhone: '0993333001', txName: 'Đoàn Bận Đi', route: 'Bến xe Trung tâm -> Đường Nguyễn Văn Linh -> Cầu Rồng' },
            { xe: '43E-333.32', txPhone: '0993333002', txName: 'Võ Đang Chạy', route: 'Bến xe Trung tâm -> Ngũ Hành Sơn' },
            { xe: '43B-333.33', txPhone: '0993333003', txName: 'Trịnh Đang Chở', route: 'Bến xe Trung tâm -> Phạm Văn Đồng -> Bãi biển Mỹ Khê' },
            { xe: '43E-333.34', txPhone: '0993333004', txName: 'Đỗ Lên Xe', route: 'Bến xe Trung tâm -> Bệnh viện Đà Nẵng' }
        ];

        for(let j=0; j<4; j++) {
            const r = inProgressRoutes[j];
            
            // Xử lý logic tạo Xe mang trạng thái Đang chạy
            const xeRs = await pool.request()
                .input('bienSo', sql.VarChar, r.xe)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM XeTrungChuyen WHERE BienSo = @bienSo)
                        INSERT INTO XeTrungChuyen (BienSo, LoaiXe, SoCho, TrangThaiXe) OUTPUT INSERTED.MaXe VALUES (@bienSo, N'Xe 16 chỗ', 16, N'Đang chạy')
                    ELSE
                        SELECT MaXe FROM XeTrungChuyen WHERE BienSo = @bienSo
                `);
            const maXeBan = xeRs.recordset[0].MaXe;
            await pool.request().input('maXeBan', sql.Int, maXeBan).query("UPDATE XeTrungChuyen SET TrangThaiXe = N'Đang chạy' WHERE MaXe = @maXeBan");

            // Xử lý logic tạo Tài xế mang trạng thái Đang thực hiện
            const txRs = await pool.request()
                .input('hoTen', sql.NVarChar, r.txName).input('sdt', sql.VarChar, r.txPhone)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM TaiXe WHERE SoDienThoai = @sdt)
                        INSERT INTO TaiXe (HoTen, SoDienThoai, CCCD, LoaiBangLai, TrangThaiTaiXe) OUTPUT INSERTED.MaTaiXe VALUES (@hoTen, @sdt, '04820333000${j}', N'D', N'Đang thực hiện')
                    ELSE
                        SELECT MaTaiXe FROM TaiXe WHERE SoDienThoai = @sdt
                `);
            const maTxBan = txRs.recordset[0].MaTaiXe;
            await pool.request().input('maTxBan', sql.Int, maTxBan).query("UPDATE TaiXe SET TrangThaiTaiXe = N'Đang thực hiện' WHERE MaTaiXe = @maTxBan");

            // Thời gian lộ trình trừ lùi 15 đến 30 phút so với hiện tại
            const timeOffset = new Date(now.getTime() - (15 + j*5)*60000); 
            
            const ltRs = await pool.request()
                .input('tgbd', sql.DateTime, timeOffset)
                .input('loTrinh', sql.NVarChar, r.route)
                .input('maXe', sql.Int, maXeBan).input('maTX', sql.Int, maTxBan).input('maNV', sql.Int, maNhanVien)
                .query(`
                    INSERT INTO LoTrinhTrungChuyen (ThoiGianBatDau, LoTrinhDuKien, TrangThaiLoTrinh, GhiChu, MaXe, MaTaiXe, MaNhanVien)
                    OUTPUT INSERTED.MaLoTrinh
                    VALUES (@tgbd, @loTrinh, N'Đang thực hiện', N'Mã chuyến: CX8888800${j}', @maXe, @maTX, @maNV)
                `);
            const maLoTrinh = ltRs.recordset[0].MaLoTrinh;

            // Gắn 2 hành khách cho xe này (ChiTietLoTrinh => Ve => KH)
            for(let k=1; k<=2; k++) {
                const khRs = await pool.request()
                    .input('name', sql.NVarChar, `Hành khách xe ${r.xe} - Ghế ${k}`)
                    .input('phone', sql.VarChar, `0903330${j}${k}`)
                    .query(`INSERT INTO KhachHang (TenKhachHang, SoDienThoai, DiaChiDon, DiaChiTra, TrangThai) OUTPUT INSERTED.MaKhachHang VALUES (@name, @phone, N'Bến xe Trung tâm Đà Nẵng', N'Dọc đường đi', N'Hoạt động')`);
                const kId = khRs.recordset[0].MaKhachHang;

                const veRs = await pool.request().input('kId', sql.Int, kId)
                    .query(`INSERT INTO VeTrungChuyen (KhungGioTrungChuyen, SoLuongGhe, TrangThaiVe, MaKhachHang) OUTPUT INSERTED.MaVe VALUES (N'Hôm nay', 1, N'Đang trung chuyển', @kId)`);
                const veId = veRs.recordset[0].MaVe;

                await pool.request().input('maLT', sql.Int, maLoTrinh).input('maVe', sql.Int, veId).input('time', sql.DateTime, timeOffset)
                    .query(`INSERT INTO ChiTietLoTrinh (ThuTuDonTra, DiemDon, DiemTra, ThoiGianDonDuKien, TrangThaiKhach, MaLoTrinh, MaVe) VALUES (${k}, N'Bến xe Trung tâm Đà Nẵng', N'Dọc đường đi', @time, N'Đã đón', @maLT, @maVe)`);
            }
        }
        console.log('✅ Đã tạo 4 Lộ trình mang trạng thái "Đang thực hiện" kèm Tài xế bận, Xe chạy và Hành khách có trên xe.');

        console.log('🎉 Tạo dữ liệu giả lập cho Dashboard Tổng quan thành công!');
        process.exit(0);
    } catch (err) {
        console.error('Lỗi khi seed data DB:', err);
        process.exit(1);
    }
}
seed();
