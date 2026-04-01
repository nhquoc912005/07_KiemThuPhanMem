const fs = require('fs');
const path = require('path');

const frontendSrcDir = path.resolve(__dirname, '..', '..', 'frontend', 'src');

// 1. PlanRoutePage.tsx
let f1 = path.join(frontendSrcDir, 'pages', 'dispatch', 'PlanRoutePage.tsx');
if (fs.existsSync(f1)) {
    let c1 = fs.readFileSync(f1, 'utf8');
    if (!c1.includes('interface VehicleData')) {
        c1 = c1.replace(
        'export const PlanRoutePage: React.FC = () => {',
        `interface VehicleData { MaXe: number; BienSo: string; SucChuaToiDa: number; }
interface DriverData { MaTaiXe: number; TenTaiXe: string; SoDienThoai: string; TrangThaiTaiXe: string; }

export const PlanRoutePage: React.FC = () => {`
        );
        c1 = c1.replace('const [vehicles, setVehicles] = useState<any[]>([]);', 'const [vehicles, setVehicles] = useState<VehicleData[]>([]);');
        c1 = c1.replace('const [drivers, setDrivers] = useState<any[]>([]);', 'const [drivers, setDrivers] = useState<DriverData[]>([]);');
        fs.writeFileSync(f1, c1);
    }
}

// 2. TrackStatusPage.tsx
let f2 = path.join(frontendSrcDir, 'pages', 'dispatch', 'TrackStatusPage.tsx');
if (fs.existsSync(f2)) {
    let c2 = fs.readFileSync(f2, 'utf8');
    c2 = c2.replace('route: any;', 'route: { TrangThaiLoTrinh?: string; MaTaiXe?: number; ThoiGianBatDau?: string; [key: string]: unknown };');
    c2 = c2.replace('stops: any[];', 'stops: unknown[];');
    fs.writeFileSync(f2, c2);
}

// 3. OverviewPage.tsx
let f3 = path.join(frontendSrcDir, 'pages', 'dispatch', 'OverviewPage.tsx');
if (fs.existsSync(f3)) {
    let c3 = fs.readFileSync(f3, 'utf8');
    c3 = c3.replace('Xe?: any;', 'Xe?: { BienSo?: string; [key: string]: unknown };');
    c3 = c3.replace('TaiXe?: any;', 'TaiXe?: { HoTen?: string; [key: string]: unknown };');
    c3 = c3.replace("filter((v: any) => v.TrangThaiXe === 'Rảnh')", "filter((v: { TrangThaiXe?: string }) => v.TrangThaiXe === 'Rảnh')");
    c3 = c3.replace("filter((d: any) => d.TrangThaiTaiXe === 'Rảnh')", "filter((d: { TrangThaiTaiXe?: string }) => d.TrangThaiTaiXe === 'Rảnh')");
    c3 = c3.replace("find((v: any) => v.MaXe === r.MaXe)", "find((v: { MaXe?: number; BienSo?: string }) => v.MaXe === r.MaXe)");
    c3 = c3.replace("find((d: any) => d.MaTaiXe === r.MaTaiXe)", "find((d: { MaTaiXe?: number; HoTen?: string }) => d.MaTaiXe === r.MaTaiXe)");
    c3 = c3.replace("pendingTickets.slice(0, 5).map((t: any) => ({", "pendingTickets.slice(0, 5).map((t: { TenKhachHang?: string, KhachHang?: { TenKhachHang?: string, DiaChiDon?: string, DiaChiTra?: string }, DiaChiDon?: string, DiaChiTra?: string, SoLuongGhe?: number }) => ({");
    fs.writeFileSync(f3, c3);
}

console.log('Fixed remaining files!');
