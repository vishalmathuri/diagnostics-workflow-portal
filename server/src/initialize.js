import { readFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

// Safe to run at every deployment: create missing objects, preserve existing data.
const schema = await readFile(new URL('./schema.sql',import.meta.url),'utf8');
const connection = await db.getConnection();
try {
  for (const statement of schema.split(';').map(x=>x.trim()).filter(Boolean)) await connection.query(statement);
  await connection.beginTransaction();
  for (const [email,password,role] of [
    ['staff@example.test','StaffDemo123!','staff'],
    ['reviewer@example.test','ReviewerDemo123!','reviewer']
  ]) {
    const [existing] = await connection.execute('SELECT id FROM users WHERE email=?',[email]);
    if (!existing.length) {
      await connection.execute('INSERT INTO users (email,password_hash,role) VALUES (?,?,?)',[email,await bcrypt.hash(password,12),role]);
    }
  }
  const [staff] = await connection.execute('SELECT id FROM users WHERE email=?',['staff@example.test']);
  const [existingDemo] = await connection.execute('SELECT id FROM samples WHERE code=?',['SYN-DEMO-1001']);
  if (!existingDemo.length) {
    const [sample] = await connection.execute('INSERT INTO samples (code,test_name,specimen_type,registered_by) VALUES (?,?,?,?)',
      ['SYN-DEMO-1001','Synthetic Glucose','Plasma',staff[0].id]);
    await connection.execute('INSERT INTO audit_events (sample_id,actor_id,action,detail) VALUES (?,?,?,?)',
      [sample.insertId,staff[0].id,'registered','Synthetic demo sample created during initialization']);
  }
  await connection.commit();
  console.log('Demo initialized; existing records preserved');
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  await db.end();
}
