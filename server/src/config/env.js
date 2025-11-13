import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const searchPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env')
];

for (const envPath of searchPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}
