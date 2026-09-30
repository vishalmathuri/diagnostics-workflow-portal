import 'dotenv/config';
import mysql from 'mysql2/promise';

const sslEnabled = process.env.DB_SSL === 'true';
if (process.env.NODE_ENV === 'production' && !sslEnabled) throw new Error('Set DB_SSL=true for the hosted database');
if (sslEnabled && !process.env.DB_SSL_CA) throw new Error('Set DB_SSL_CA to the database CA certificate');

export const db = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'portal',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'diagnostics_portal',
  ...(sslEnabled ? {ssl:{ca:process.env.DB_SSL_CA.replace(/\\n/g,'\n'),rejectUnauthorized:true}} : {}),
  connectTimeout: 5000,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true
});
