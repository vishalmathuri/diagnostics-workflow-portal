import assert from 'node:assert/strict';

const base = process.env.API_URL || 'http://localhost:4000';
async function call(path, { token, method='GET', body, expected=200 }={}) {
  const response=await fetch(`${base}/api${path}`,{
    method,
    headers:{...(body?{'content-type':'application/json'}:{}),...(token?{authorization:`Bearer ${token}`}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  const data=await response.json();
  assert.equal(response.status,expected,`${method} ${path}: expected ${expected}, got ${response.status}: ${JSON.stringify(data)}`);
  return data;
}
const staff=(await call('/auth/login',{method:'POST',body:{email:'staff@example.test',password:'StaffDemo123!'}})).token;
const reviewer=(await call('/auth/login',{method:'POST',body:{email:'reviewer@example.test',password:'ReviewerDemo123!'}})).token;
const code=`SYN-E2E-${Date.now().toString(36).toUpperCase()}`;
const created=await call('/samples',{token:staff,method:'POST',body:{code,test_name:'Synthetic Glucose',specimen_type:'Plasma'},expected:201});
const path=`/samples/${created.id}`;
await call(`${path}/audit`,{expected:401});
await call('/samples/invalid/audit',{token:staff,expected:400});
await call('/samples/9007199254740991/audit',{token:staff,expected:404});
await call(`${path}/status`,{token:reviewer,method:'PATCH',body:{status:'in_progress'},expected:403});
await call(`${path}/status`,{token:staff,method:'PATCH',body:{status:'in_progress'}});
await call(`${path}/result`,{token:staff,method:'POST',body:{value_text:'92',unit:'mg/dL'}});
await call(`${path}/review`,{token:staff,method:'POST',body:{decision:'approved'},expected:403});
assert.equal((await call(`/results?q=${code}`,{token:staff})).length,0,'Unreviewed result appeared in history');
await call(`${path}/review`,{token:reviewer,method:'POST',body:{decision:'rejected',note:'Please verify transcription'}});
assert.equal((await call(`/results?q=${code}`,{token:reviewer})).length,0,'Rejected result appeared in history');
await call(`${path}/result`,{token:staff,method:'POST',body:{value_text:'94',unit:'mg/dL'}});
await call(`${path}/review`,{token:reviewer,method:'POST',body:{decision:'approved',note:'Verified'}});
const history=await call(`/results?q=${code}`,{token:staff});
assert.equal(history.length,1);
assert.equal(history[0].value_text,'94');
await call(`${path}/review`,{token:reviewer,method:'POST',body:{decision:'approved'},expected:409});
const staffAudit=await call(`${path}/audit`,{token:staff});
const reviewerAudit=await call(`${path}/audit`,{token:reviewer});
assert.equal(staffAudit.sample.code,code);
assert.deepEqual(staffAudit,reviewerAudit,'Both roles should see the same audit timeline');
assert.deepEqual(staffAudit.events.map(event=>event.action),[
  'registered','processing_started','result_entered','rejected','result_corrected','approved'
],'Audit should record successful actions only, in order');
assert.deepEqual(staffAudit.events.map(event=>event.actor_role),['staff','staff','staff','reviewer','staff','reviewer']);
assert.equal(staffAudit.events[3].detail,'Please verify transcription');
assert.equal(staffAudit.events[5].detail,'Verified');
for (const event of staffAudit.events) {
  assert.equal(event.actor_email,`${event.actor_role}@example.test`);
  assert.ok(Number.isFinite(Date.parse(event.created_at)),'Audit timestamp should be valid');
}
console.log(`PASS: workflow, roles, approved-only history and ordered audit timeline (${code})`);
