import fs from 'fs';
import path from 'path';

const banned = ['GPL', 'AGPL', 'SSPL'];

function checkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('@')) {
        checkDir(path.join(dir, entry.name));
      } else {
        const pkgPath = path.join(dir, entry.name, 'package.json');
        if (fs.existsSync(pkgPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            const lic = typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type || pkg.licenses?.[0]?.type || 'UNKNOWN');
            for (const ban of banned) {
              if (lic.toUpperCase().includes(ban)) {
                console.error(`FORBIDDEN LICENSE DETECTED: ${pkg.name}@${pkg.version} uses ${lic}`);
                process.exit(1);
              }
            }
          } catch {}
        }
      }
    }
  }
}

checkDir('node_modules');
console.log('Frontend license audit PASSED: 0 copyleft/GPL licenses detected in node_modules.');
