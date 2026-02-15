const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

function copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();

    if (isDirectory) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest);
        }
        fs.readdirSync(src).forEach((childItemName) => {
            copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

async function build() {
    try {
        console.log('Building project...');

        // 1. Clean dist directory
        if (fs.existsSync(distDir)) {
            fs.rmSync(distDir, { recursive: true, force: true });
        }
        fs.mkdirSync(distDir);
        console.log('Cleaned dist directory.');

        // 2. Copy public directory
        // Use cpSync (Node 16.7+) for simplicity if available, else fallback
        if (fs.cpSync) {
            fs.cpSync(path.join(projectRoot, 'public'), path.join(distDir, 'public'), { recursive: true });
        } else {
            // Fallback for older nodes (unlikely given v24 but safe)
            copyRecursiveSync(path.join(projectRoot, 'public'), path.join(distDir, 'public'));
        }
        console.log('Copied public directory.');

        // 3. Copy server.js
        fs.copyFileSync(path.join(projectRoot, 'server.js'), path.join(distDir, 'server.js'));
        console.log('Copied server.js.');

        // 4. Copy package files
        fs.copyFileSync(path.join(projectRoot, 'package.json'), path.join(distDir, 'package.json'));
        if (fs.existsSync(path.join(projectRoot, 'package-lock.json'))) {
            fs.copyFileSync(path.join(projectRoot, 'package-lock.json'), path.join(distDir, 'package-lock.json'));
        }
        console.log('Copied package files.');

        console.log('Build complete! The "dist" folder is ready for deployment.');
        console.log('To run in production: cd dist && npm install --production && npm start');
    } catch (err) {
        console.error('Build failed:', err);
        process.exit(1);
    }
}

build();
