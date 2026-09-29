'use strict';

/**
 * Applies db/schema.sql. Safe to run repeatedly — every statement is CREATE
 * TABLE IF NOT EXISTS.
 *
 *   npm run db:init
 */

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'seo_audit',
    multipleStatements: true,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined
  });

  try {
    await conn.query(sql);
    console.log(`Schema applied to "${process.env.DB_NAME || 'seo_audit'}".`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Schema failed to apply:', err.message);
  if (err.code === 'ER_BAD_DB_ERROR') {
    console.error(`Create the database first:  CREATE DATABASE ${process.env.DB_NAME || 'seo_audit'};`);
  }
  process.exit(1);
});
