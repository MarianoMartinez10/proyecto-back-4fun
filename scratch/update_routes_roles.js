const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '../routes');

fs.readdirSync(routesDir).forEach(file => {
    if (file.endsWith('.js')) {
        const filePath = path.join(routesDir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        
        let modified = false;
        if (content.includes("authorize('admin')")) {
            content = content.replace(/authorize\('admin'\)/g, "authorize('ADMIN')");
            modified = true;
        }
        if (content.includes("authorize('seller')")) {
            content = content.replace(/authorize\('seller'\)/g, "authorize('SELLER')");
            modified = true;
        }
        if (content.includes("authorize('admin', 'seller')")) {
            content = content.replace(/authorize\('admin', 'seller'\)/g, "authorize('ADMIN', 'SELLER')");
            modified = true;
        }
        if (content.includes("authorize('seller', 'admin')")) {
            content = content.replace(/authorize\('seller', 'admin'\)/g, "authorize('SELLER', 'ADMIN')");
            modified = true;
        }
        
        if (modified) {
            fs.writeFileSync(filePath, content);
            console.log(`Updated ${file}`);
        }
    }
});
console.log('Routes update complete.');
