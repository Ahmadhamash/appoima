/** One-time, explicit adoption of an existing Phase 1 push-managed development database. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
if(process.env.CONFIRM_PHASE1_BASELINE!=='1')throw new Error('Back up the database, then set CONFIRM_PHASE1_BASELINE=1 to register the existing Phase 1 baseline.');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=fs.readFileSync(path.join(root,'migrations/0000_phase1_baseline.sql'),'utf8');
const journal=JSON.parse(fs.readFileSync(path.join(root,'migrations/meta/_journal.json'),'utf8'));
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try {
 await client.query('BEGIN');
 await client.query('SELECT pg_advisory_xact_lock(7140003)');
 const expected={
  clinics:['id','name','name_lang','status','created_at'],
  branches:['id','clinic_id','name','name_lang','time_zone','opening_hours','created_at'],
  users:['id','clinic_id','branch_id','email','password_hash','name','phone','job_title','role','permissions','must_change_password','is_active','created_at'],
  audit_events:['id','clinic_id','actor_user_id','action','entity_type','entity_id','details','created_at'],
  session:['sid','sess','expire'],
 };
 const tables=await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])",[['services','rooms','customers','service_employees','room_services']]);
 if(tables.rows.length)throw new Error('Phase 2 tables already exist. Do not adopt automatically; reconcile the migration history first.');
 for(const [table,columns] of Object.entries(expected)) {
  const result=await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",[table]);
  const names=result.rows.map((r)=>r.column_name).sort();
  if(JSON.stringify(names)!==JSON.stringify([...columns].sort()))throw new Error(`Table ${table} does not match the expected Phase 1 column set.`);
 }
 const enums=await client.query("SELECT t.typname, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname = ANY($1::text[]) GROUP BY t.typname",[['language','clinic_status','user_role']]);
 const required={language:['en','ar'],clinic_status:['active','inactive'],user_role:['platform_owner','manager','secretary','doctor','service_provider','other_staff']};
 for(const [name,labels] of Object.entries(required)){const found=enums.rows.find((r)=>r.typname===name);if(!found||JSON.stringify(found.labels)!==JSON.stringify(labels))throw new Error(`Enum ${name} differs from Phase 1.`);}
 // Fail rather than silently repairing cross-clinic branch references.
 const invalid=await client.query('SELECT u.id FROM users u JOIN branches b ON b.id=u.branch_id WHERE u.clinic_id IS DISTINCT FROM b.clinic_id LIMIT 1');
 if(invalid.rowCount)throw new Error('An existing user has a cross-clinic branch reference. Correct it before migration.');
 await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
 await client.query('CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)');
 const history=await client.query('SELECT id FROM drizzle.__drizzle_migrations LIMIT 1');
 if(history.rows.length)throw new Error('A migration journal already exists. Automatic baseline adoption refused.');
 await client.query('INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)',[crypto.createHash('sha256').update(sql).digest('hex'),journal.entries[0].when]);
 await client.query('COMMIT');
 console.log('Phase 1 baseline registered. No application records changed. Run pnpm --filter @workspace/db run migrate next.');
}catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
