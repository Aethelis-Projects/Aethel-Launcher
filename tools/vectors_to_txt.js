import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vecPath = path.join(__dirname, '..', 'crates', 'aethel-auth', 'tests', 'vectors.json');

const data = JSON.parse(fs.readFileSync(vecPath, 'utf8'));
for (const entry of data.vectors || []) {
  console.log(`${entry.input} ${entry.uuid}`);
}