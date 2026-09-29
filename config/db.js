'use strict';

const mysql = require('mysql2/promise');
const { sslConfig } = require('./ssl');

/**
 * A single shared connection pool for the whole process.
 * Opening a connection per request is the classic way to exhaust a free-tier
 * MySQL instance, so everything goes through this pool.
 */
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'seo_audit',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 5),
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z',
  // Managed MySQL (Aiven, PlanetScale, Railway) requires TLS. See config/ssl.js.
  ssl: sslConfig()
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** Runs a callback inside a transaction, rolling back on any throw. */
async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function ping() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    return true;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, transaction, ping };
