'use strict';

const { query, transaction } = require('../config/db');

/**
 * Note on `AS new ... ON DUPLICATE KEY UPDATE col = new.col`:
 * the older `VALUES(col)` form was deprecated in MySQL 8.0.20 and is slated for
 * removal. The row-alias form works on 8.0.19 and every later release, so it is
 * safe on both a current local server and older managed hosts.
 */
async function upsertSite(conn, finalUrl) {
  const { hostname, origin } = new URL(finalUrl);
  await conn.execute(
    'INSERT INTO sites (domain, url) VALUES (?, ?) AS new ON DUPLICATE KEY UPDATE url = new.url',
    [hostname, origin]
  );
  const [rows] = await conn.execute('SELECT id FROM sites WHERE domain = ? LIMIT 1', [hostname]);
  return rows[0].id;
}

/** Writes an audit, its checks and its extracted keywords in one transaction. */
async function saveAudit(audit) {
  return transaction(async (conn) => {
    const siteId = await upsertSite(conn, audit.finalUrl);

    const [res] = await conn.execute(
      `INSERT INTO audits
        (site_id, requested_url, final_url, status_code, score, grade,
         ttfb_ms, total_ms, page_bytes, word_count, passed, warned, failed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        siteId, audit.requestedUrl.slice(0, 2048), audit.finalUrl.slice(0, 2048),
        audit.statusCode, audit.score, audit.grade, audit.ttfbMs, audit.totalMs,
        audit.pageBytes, audit.wordCount, audit.counts.pass, audit.counts.warn, audit.counts.fail
      ]
    );
    const auditId = res.insertId;

    if (audit.results.length) {
      const values = audit.results.map((r) => [
        auditId, r.checkId, r.category, r.label, r.status, r.weight,
        r.message.slice(0, 500), r.detail, r.fix ? r.fix.slice(0, 500) : null
      ]);
      await conn.query(
        `INSERT INTO audit_checks
          (audit_id, check_id, category, label, status, weight, message, detail, fix)
         VALUES ?`,
        [values]
      );
    }

    if (audit.keywords.length) {
      const kw = audit.keywords.map((k) => [
        siteId, k.phrase.slice(0, 191), k.intent, k.occurrences,
        k.inTitle ? 1 : 0, k.inH1 ? 1 : 0, k.inMeta ? 1 : 0, 'extracted'
      ]);
      await conn.query(
        `INSERT INTO keywords
          (site_id, phrase, intent, occurrences, in_title, in_h1, in_meta, source)
         VALUES ? AS new
         ON DUPLICATE KEY UPDATE
           occurrences = new.occurrences,
           intent      = new.intent,
           in_title    = new.in_title,
           in_h1       = new.in_h1,
           in_meta     = new.in_meta`,
        [kw]
      );
    }

    return { auditId, siteId };
  });
}

async function getAudit(id) {
  const rows = await query(
    `SELECT a.*, s.domain
       FROM audits a
       JOIN sites s ON s.id = a.site_id
      WHERE a.id = ?`,
    [id]
  );
  if (!rows.length) return null;
  const audit = rows[0];
  audit.checks = await query(
    'SELECT * FROM audit_checks WHERE audit_id = ? ORDER BY id',
    [id]
  );
  return audit;
}

async function recentAudits(limit = 20) {
  // LIMIT cannot be a placeholder in a prepared statement, so it is coerced to an int.
  const n = Math.max(1, Math.min(100, Number(limit) || 20));
  return query(
    `SELECT a.id, a.final_url, a.score, a.grade, a.created_at, a.failed, a.warned, s.domain
       FROM audits a
       JOIN sites s ON s.id = a.site_id
      ORDER BY a.created_at DESC
      LIMIT ${n}`
  );
}

async function auditHistoryFor(siteId, limit = 30) {
  const n = Math.max(1, Math.min(100, Number(limit) || 30));
  return query(
    `SELECT id, score, grade, created_at FROM audits
      WHERE site_id = ? ORDER BY created_at DESC LIMIT ${n}`,
    [siteId]
  );
}

async function listSites() {
  return query(
    `SELECT s.id, s.domain, COUNT(a.id) AS audit_count, MAX(a.created_at) AS last_audit
       FROM sites s LEFT JOIN audits a ON a.site_id = s.id
      GROUP BY s.id, s.domain
      ORDER BY last_audit DESC`
  );
}

async function getSite(id) {
  const rows = await query('SELECT * FROM sites WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function keywordsFor(siteId) {
  return query(
    `SELECT * FROM keywords WHERE site_id = ?
      ORDER BY FIELD(intent,'transactional','commercial','navigational','informational'),
               occurrences DESC`,
    [siteId]
  );
}

async function addKeyword(siteId, phrase, intent, notes) {
  await query(
    `INSERT INTO keywords (site_id, phrase, intent, source, notes)
     VALUES (?, ?, ?, 'manual', ?) AS new
     ON DUPLICATE KEY UPDATE intent = new.intent, notes = new.notes`,
    [siteId, phrase.slice(0, 191), intent, notes ? notes.slice(0, 500) : null]
  );
}

async function deleteKeyword(siteId, keywordId) {
  await query('DELETE FROM keywords WHERE id = ? AND site_id = ?', [keywordId, siteId]);
}

module.exports = {
  saveAudit, getAudit, recentAudits, auditHistoryFor,
  listSites, getSite, keywordsFor, addKeyword, deleteKeyword
};
