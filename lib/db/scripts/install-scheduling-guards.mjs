import fs from 'node:fs';
import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const client = new pg.Client({connectionString: process.env.DATABASE_URL});
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query(fs.readFileSync(new URL('../sql/scheduling-guards.sql', import.meta.url), 'utf8'));
  await client.query('COMMIT');
  console.log('Scheduling exclusion constraints installed. Existing conflicts would cause this step to fail.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {}); throw error;
} finally { await client.end(); }
