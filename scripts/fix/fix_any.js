const fs = require('fs');
const path = require('path');
const { join } = path;

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            if (file.endsWith('.ts') || file.endsWith('.tsx')) {
                results.push(file);
            }
        }
    });
    return results;
}

const frontendSrcDir = path.resolve(__dirname, '..', '..', 'frontend', 'src');
const files = walk(frontendSrcDir);

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // Fix catch (err: any) -> catch (error: unknown) { const err = ... }
    content = content.replace(/catch\s*\(\s*([a-zA-Z0-9_]+)\s*:\s*any\s*\)\s*\{/g, 'catch (error: unknown) { const $1 = error as { response?: { data?: { message?: string } }, message?: string };');

    // Fix PlanRoutePage useState<any[]>
    if (file.includes('PlanRoutePage.tsx') || file.includes('DispatcherDriversPage.tsx') || file.includes('OverviewPage.tsx') || file.includes('VehiclesPage.tsx') || file.includes('TrackStatusPage.tsx') || file.includes('CustomersPage.tsx') || file.includes('AdjustRoutePage.tsx')) {
        // we will fix useState and explicit types manually for these since they vary
    }
    
    // ResetPasswordPage location.state as any
    content = content.replace(/\(location\.state\s+as\s+any\)\?/g, '(location.state as { phoneNumber?: string, expiresInSeconds?: number })?');
    
    // CustomersPage api.get<any[]>
    content = content.replace(/api\.get<any\[\]>\('\/tickets'\)/g, "api.get<Record<string, unknown>[]>('/tickets')");

    if (content !== original) {
        fs.writeFileSync(file, content);
        console.log('Fixed ', file);
    }
});
