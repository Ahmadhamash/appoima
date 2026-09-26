import fs from 'node:fs';
import pg from 'pg';
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
try {
  await client.connect();await client.query('BEGIN');
  await client.query(fs.readFileSync(new URL('../sql/inventory-guards.sql',import.meta.url),'utf8'));
  await client.query('COMMIT');console.log('Inventory immutability, context, balance and complete-line guards installed.');
}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{await client.end();}
