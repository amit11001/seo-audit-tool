'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { runAudit, groupByCategory, priorityFixes } = require('../lib/audit-engine');
const { FetchError } = require('../lib/fetcher');
const store = require('../lib/store');

const router = express.Router();

/** Auditing makes an outbound request, so it gets its own tighter limit. */
const auditLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Too many audits from this address. Try again in a few minutes.'
});

// ------------------------------------------------------------------- pages
router.get('/', async (req, res, next) => {
  try {
    const recent = await store.recentAudits(8);
    res.render('home', {
      title: 'Free SEO audit tool — check any page in seconds',
      description:
        'Run a technical and on-page SEO audit on any URL. 27 weighted checks covering metadata, content depth, Core Web Vitals signals, structured data and internal linking.',
      canonicalPath: '/',
      recent,
      error: null,
      submitted: ''
    });
  } catch (err) { next(err); }
});

router.post('/audit', auditLimiter, async (req, res, next) => {
  const submitted = (req.body.url || '').trim();
  try {
    const audit = await runAudit(submitted);
    const { auditId } = await store.saveAudit(audit);
    res.redirect(303, `/audit/${auditId}`);
  } catch (err) {
    if (err instanceof FetchError) {
      const recent = await store.recentAudits(8).catch(() => []);
      return res.status(400).render('home', {
        title: 'Free SEO audit tool — check any page in seconds',
        description: 'Run a technical and on-page SEO audit on any URL.',
        canonicalPath: '/',
        recent,
        error: err.message,
        submitted
      });
    }
    return next(err);
  }
});

router.get('/audit/:id(\\d+)', async (req, res, next) => {
  try {
    const audit = await store.getAudit(req.params.id);
    if (!audit) return next();

    const results = audit.checks.map((c) => ({
      checkId: c.check_id,
      category: c.category,
      label: c.label,
      status: c.status,
      weight: c.weight,
      message: c.message,
      detail: c.detail,
      fix: c.fix
    }));

    res.render('report', {
      title: `SEO audit for ${audit.domain} — score ${audit.score}/100`,
      description: `Full SEO report for ${audit.domain}: ${audit.failed} failures and ${audit.warned} warnings across metadata, content, technical health, structured data and links.`,
      canonicalPath: `/audit/${audit.id}`,
      audit,
      groups: groupByCategory(results),
      priorities: priorityFixes(results),
      history: await store.auditHistoryFor(audit.site_id, 10)
    });
  } catch (err) { next(err); }
});

router.get('/history', async (req, res, next) => {
  try {
    res.render('history', {
      title: 'Audit history',
      description: 'Every site audited with this tool, with score trends over time.',
      canonicalPath: '/history',
      sites: await store.listSites(),
      recent: await store.recentAudits(40)
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- keywords
router.get('/sites/:id(\\d+)/keywords', async (req, res, next) => {
  try {
    const site = await store.getSite(req.params.id);
    if (!site) return next();
    const keywords = await store.keywordsFor(site.id);
    res.render('keywords', {
      title: `Keyword map for ${site.domain}`,
      description: `Keywords found on ${site.domain}, grouped by search intent, with the ones missing from the title tag flagged as opportunities.`,
      canonicalPath: `/sites/${site.id}/keywords`,
      site,
      keywords,
      gaps: keywords.filter((k) => !k.in_title && ['transactional', 'commercial'].includes(k.intent))
    });
  } catch (err) { next(err); }
});

router.post('/sites/:id(\\d+)/keywords', async (req, res, next) => {
  try {
    const site = await store.getSite(req.params.id);
    if (!site) return next();
    const phrase = (req.body.phrase || '').trim();
    const intent = ['transactional', 'commercial', 'informational', 'navigational'].includes(req.body.intent)
      ? req.body.intent
      : 'informational';
    if (phrase) await store.addKeyword(site.id, phrase, intent, req.body.notes);
    res.redirect(303, `/sites/${site.id}/keywords`);
  } catch (err) { next(err); }
});

router.post('/sites/:id(\\d+)/keywords/:kid(\\d+)/delete', async (req, res, next) => {
  try {
    await store.deleteKeyword(req.params.id, req.params.kid);
    res.redirect(303, `/sites/${req.params.id}/keywords`);
  } catch (err) { next(err); }
});

// ------------------------------------------------------------------ static
router.get('/guide', (req, res) => {
  // Generated from the same registry the engine runs, so the docs cannot drift
  // out of sync with the checks.
  const { checks } = require('../lib/checks');
  const byCategory = new Map();
  for (const c of checks) {
    if (!byCategory.has(c.category)) byCategory.set(c.category, []);
    byCategory.get(c.category).push(c);
  }
  res.render('guide', {
    title: `What each of the ${checks.length} SEO checks means`,
    description: `Plain-English explanation of all ${checks.length} checks this tool runs, why each one affects ranking, and how much each is worth in the score.`,
    canonicalPath: '/guide',
    groups: [...byCategory.entries()].map(([name, items]) => ({ name, items })),
    total: checks.length,
    maxWeight: checks.reduce((n, c) => n + c.weight, 0)
  });
});

// JSON API — useful for CI pipelines and for proving the engine is separable from the UI.
router.get('/api/audits/:id(\\d+)', async (req, res, next) => {
  try {
    const audit = await store.getAudit(req.params.id);
    if (!audit) return res.status(404).json({ error: 'Audit not found' });
    res.json(audit);
  } catch (err) { next(err); }
});

module.exports = router;
