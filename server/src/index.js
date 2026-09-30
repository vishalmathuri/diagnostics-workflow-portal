import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z, ZodError } from 'zod';
import { db } from './db.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('Set JWT_SECRET to at least 32 characters');
const app = express();
const proxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 10) throw new Error('Invalid TRUST_PROXY_HOPS');
if (proxyHops) app.set('trust proxy', proxyHops);
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '16kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const bad = (res,message,code=400) => res.status(code).json({ error: message });
const idOf = req => z.coerce.number().int().positive().parse(req.params.id);
const text = (max=120) => z.string().trim().min(1).max(max);

app.get('/health',asyncRoute(async(req,res) => {
  try {
    await db.query({sql:'SELECT 1',timeout:5000});
    res.json({status:'ok'});
  } catch {
    res.status(503).json({status:'unavailable'});
  }
}));

function authenticate(req,res,next) {
  try {
    const token = /^Bearer (.+)$/.exec(req.get('authorization') || '')?.[1];
    if (!token) return bad(res,'Authentication required',401);
    const payload = jwt.verify(token,process.env.JWT_SECRET,{ algorithms:['HS256'] });
    if (!['staff','reviewer'].includes(payload.role)) return bad(res,'Invalid role',401);
    req.user = { id: Number(payload.sub), role: payload.role };
    next();
  } catch { return bad(res,'Invalid or expired token',401); }
}
const role = allowed => (req,res,next) => allowed.includes(req.user.role) ? next() : bad(res,'Forbidden',403);

app.post('/api/auth/login',rateLimit({ windowMs:15*60_000,limit:10,standardHeaders:'draft-7',legacyHeaders:false }),asyncRoute(async(req,res) => {
  const { email,password } = z.object({email:z.string().email().max(255),password:z.string().min(1)}).parse(req.body);
  const [rows] = await db.execute('SELECT id,email,role,password_hash FROM users WHERE email=?',[email.toLowerCase()]);
  if (!rows.length || !(await bcrypt.compare(password,rows[0].password_hash))) return bad(res,'Invalid credentials',401);
  const user = rows[0];
  res.json({ token:jwt.sign({role:user.role},process.env.JWT_SECRET,{subject:String(user.id),expiresIn:'8h',algorithm:'HS256'}), user:{id:user.id,email:user.email,role:user.role} });
}));

app.use('/api',authenticate);
app.get('/api/samples/:id/audit',role(['staff','reviewer']),asyncRoute(async(req,res) => {
  const id = idOf(req);
  const [samples] = await db.execute('SELECT id,code,test_name,specimen_type,status FROM samples WHERE id=?',[id]);
  if (!samples.length) return bad(res,'Sample not found',404);
  const [events] = await db.execute(`SELECT a.id,a.action,a.detail,a.created_at,
    u.email AS actor_email,u.role AS actor_role
    FROM audit_events a JOIN users u ON u.id=a.actor_id
    WHERE a.sample_id=? ORDER BY a.created_at ASC,a.id ASC`,[id]);
  res.json({sample:samples[0],events});
}));
app.get('/api/samples',asyncRoute(async(req,res) => {
  const {q,status} = z.object({q:z.string().max(100).default(''),status:z.enum(['registered','in_progress','result_entered','approved','rejected']).optional()}).parse(req.query);
  const like = `%${q.replace(/[\\%_]/g,'\\$&')}%`;
  const [rows] = await db.execute(`SELECT s.id,s.code,s.test_name,s.specimen_type,s.status,s.created_at,s.updated_at,
    r.value_text,r.unit,r.review_note FROM samples s LEFT JOIN results r ON r.sample_id=s.id
    WHERE (s.code LIKE ? OR s.test_name LIKE ?) AND (? IS NULL OR s.status=?) ORDER BY s.created_at DESC,s.id DESC LIMIT 100`,[like,like,status||null,status||null]);
  res.json(rows);
}));

app.post('/api/samples',role(['staff']),asyncRoute(async(req,res) => {
  const input = z.object({code:z.string().trim().regex(/^SYN-[A-Z0-9-]{3,24}$/i),test_name:text(),specimen_type:text(80)}).parse(req.body);
  const id = await transaction(async conn => {
    const [result] = await conn.execute('INSERT INTO samples (code,test_name,specimen_type,registered_by) VALUES (?,?,?,?)',
      [input.code.toUpperCase(),input.test_name,input.specimen_type,req.user.id]);
    await conn.execute('INSERT INTO audit_events (sample_id,actor_id,action) VALUES (?,?,?)',[result.insertId,req.user.id,'registered']);
    return result.insertId;
  });
  res.status(201).json({id});
}));

async function transaction(fn) {
  const conn = await db.getConnection();
  try { await conn.beginTransaction(); const value = await fn(conn); await conn.commit(); return value; }
  catch(error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}
async function lockedSample(conn,id) {
  const [rows] = await conn.execute('SELECT id,status FROM samples WHERE id=? FOR UPDATE',[id]);
  if (!rows.length) { const error = new Error('Sample not found'); error.status=404; throw error; }
  return rows[0];
}
function requireStatus(actual,allowed) {
  if (!allowed.includes(actual)) { const error = new Error(`Action unavailable while status is ${actual}`); error.status=409; throw error; }
}
app.patch('/api/samples/:id/status',role(['staff']),asyncRoute(async(req,res) => {
  const id=idOf(req);
  z.object({status:z.literal('in_progress')}).parse(req.body);
  await transaction(async conn => {
    const sample=await lockedSample(conn,id);
    requireStatus(sample.status,['registered']);
    await conn.execute('UPDATE samples SET status=? WHERE id=?',['in_progress',id]);
    await conn.execute('INSERT INTO audit_events (sample_id,actor_id,action) VALUES (?,?,?)',[id,req.user.id,'processing_started']);
  });
  res.json({status:'in_progress'});
}));

app.post('/api/samples/:id/result',role(['staff']),asyncRoute(async(req,res) => {
  const id=idOf(req);
  const {value_text,unit}=z.object({value_text:text(500),unit:z.string().trim().max(40).default('')}).parse(req.body);
  await transaction(async conn => {
    const sample=await lockedSample(conn,id);
    requireStatus(sample.status,['in_progress','rejected']);
    await conn.execute(`INSERT INTO results (sample_id,value_text,unit,entered_by) VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE value_text=VALUES(value_text),unit=VALUES(unit),entered_by=VALUES(entered_by),reviewed_by=NULL,review_note=NULL,reviewed_at=NULL`,
      [id,value_text,unit,req.user.id]);
    await conn.execute('UPDATE samples SET status=? WHERE id=?',['result_entered',id]);
    await conn.execute('INSERT INTO audit_events (sample_id,actor_id,action) VALUES (?,?,?)',[id,req.user.id,sample.status==='rejected'?'result_corrected':'result_entered']);
  });
  res.json({status:'result_entered'});
}));

app.post('/api/samples/:id/review',role(['reviewer']),asyncRoute(async(req,res) => {
  const id=idOf(req);
  const {decision,note}=z.object({decision:z.enum(['approved','rejected']),note:z.string().trim().max(500).default('')}).parse(req.body);
  if (decision==='rejected' && !note) return bad(res,'A rejection note is required');
  await transaction(async conn => {
    const sample=await lockedSample(conn,id);
    requireStatus(sample.status,['result_entered']);
    await conn.execute('UPDATE results SET reviewed_by=?,review_note=?,reviewed_at=NOW() WHERE sample_id=?',[req.user.id,note||null,id]);
    await conn.execute('UPDATE samples SET status=? WHERE id=?',[decision,id]);
    await conn.execute('INSERT INTO audit_events (sample_id,actor_id,action,detail) VALUES (?,?,?,?)',[id,req.user.id,decision,note]);
  });
  res.json({status:decision});
}));

app.get('/api/results',asyncRoute(async(req,res) => {
  const {q}=z.object({q:z.string().max(100).default('')}).parse(req.query);
  const like=`%${q.replace(/[\\%_]/g,'\\$&')}%`;
  const [rows]=await db.execute(`SELECT s.id,s.code,s.test_name,s.specimen_type,r.value_text,r.unit,r.reviewed_at
    FROM samples s JOIN results r ON r.sample_id=s.id WHERE s.status='approved' AND (s.code LIKE ? OR s.test_name LIKE ?)
    ORDER BY r.reviewed_at DESC LIMIT 100`,[like,like]);
  res.json(rows);
}));
app.use('/api',(req,res) => bad(res,'API endpoint not found',404));
if (process.env.NODE_ENV === 'production') {
  const clientDist = fileURLToPath(new URL('../../client/dist/',import.meta.url));
  if (!existsSync(`${clientDist}index.html`)) throw new Error('Build the React client before starting production');
  app.use(express.static(clientDist));
  app.get('*',(req,res) => res.sendFile(`${clientDist}index.html`));
}
app.use((error,req,res,next) => {
  if (error instanceof ZodError) return bad(res,error.issues.map(x=>`${x.path.join('.')}: ${x.message}`).join('; '));
  if (error.code==='ER_DUP_ENTRY') return bad(res,'Sample code already exists',409);
  if (error.status) return bad(res,error.message,error.status);
  console.error(error);
  return bad(res,'Internal server error',500);
});
app.listen(Number(process.env.PORT||4000),'0.0.0.0',()=>console.log(`API ready on port ${process.env.PORT||4000}`));
