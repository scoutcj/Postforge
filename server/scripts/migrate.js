import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import dotenv from 'dotenv';
import { Client } from 'pg';

const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env')
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not set. Aborting migration.');
  process.exit(1);
}

const migrationsDir = path.resolve(process.cwd(), 'db', 'migrations');

async function run() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  await client.connect();

  try {
    await client.query(`
      create table if not exists schema_migrations (
        id serial primary key,
        filename text unique not null,
        executed_at timestamptz not null default now()
      );
    `);

    const executed = await client.query('select filename from schema_migrations');
    const executedFiles = new Set(executed.rows.map((row) => row.filename));

    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      if (executedFiles.has(file)) {
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`Running migration ${file}...`);
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations(filename) values ($1)', [file]);
        await client.query('commit');
        console.log(`Migration ${file} completed.`);
      } catch (error) {
        await client.query('rollback');
        console.error(`Migration ${file} failed:`, error);
        process.exit(1);
      }
    }

    console.log('All migrations executed.');
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('Migration runner failed:', error);
  process.exit(1);
});
