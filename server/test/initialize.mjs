import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { db } from '../src/db.js';

const run = promisify(execFile);
const tables = ['users','samples','results','audit_events'];
async function snapshot() {
  const rows = {};
  for (const table of tables) {
    // Table names are fixed above, never supplied by a request.
    const [records] = await db.query(`SELECT * FROM ${table} ORDER BY id`);
    rows[table] = records;
  }
  return rows;
}
try {
  const before = await snapshot();
  await run(process.execPath,['src/initialize.js']);
  const first = await snapshot();
  for (const table of tables) {
    for (const record of before[table]) {
      assert.deepEqual(first[table].find(x=>x.id===record.id),record,`Initialization changed an existing ${table} record`);
    }
  }
  await run(process.execPath,['src/initialize.js']);
  assert.deepEqual(await snapshot(),first,'Repeated initialization changed data');
  console.log('PASS: initialization preserves existing records and is safe to repeat');
} finally {
  await db.end();
}
