import { readFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
const connection = await db.getConnection();
try {
  for (const statement of schema.split(';').map(x => x.trim()).filter(Boolean)) await connection.query(statement);
  await connection.beginTransaction();
  await connection.query('DELETE FROM audit_events');
  await connection.query('DELETE FROM results');
  await connection.query('DELETE FROM samples');
  await connection.query('DELETE FROM users');
  const staffHash = await bcrypt.hash('StaffDemo123!', 12);
  const reviewerHash = await bcrypt.hash('ReviewerDemo123!', 12);
  const [staff] = await connection.execute('INSERT INTO users (email,password_hash,role) VALUES (?,?,?)', ['staff@example.test',staffHash,'staff']);
  const [reviewer] = await connection.execute('INSERT INTO users (email,password_hash,role) VALUES (?,?,?)', ['reviewer@example.test',reviewerHash,'reviewer']);
  const examples = [
    ['SYN-1001','Complete Blood Count','Whole blood','registered'],
    ['SYN-1002','Lipid Panel','Serum','in_progress'],
    ['SYN-1003','Glucose','Plasma','result_entered'],
    ['SYN-1004','Hemoglobin','Whole blood','approved']
  ];
  for (const [code,test,specimen,status] of examples) {
    const [sample] = await connection.execute('INSERT INTO samples (code,test_name,specimen_type,status,registered_by) VALUES (?,?,?,?,?)',[code,test,specimen,status,staff.insertId]);
    if (status === 'result_entered' || status === 'approved') {
      await connection.execute('INSERT INTO results (sample_id,value_text,unit,entered_by,reviewed_by,reviewed_at) VALUES (?,?,?,?,?,?)',
        [sample.insertId,status === 'approved' ? '13.8' : '92',status === 'approved' ? 'g/dL' : 'mg/dL',staff.insertId,status === 'approved' ? reviewer.insertId : null,status === 'approved' ? new Date() : null]);
    }
  }
  await connection.commit();
  console.log('Synthetic demo data ready');
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  await db.end();
}
