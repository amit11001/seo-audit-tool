'use strict';

const express = require('express');
const store = require('../lib/store');

const router = express.Router();

const baseUrl = (req) =>
  (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

/**
 * The tool has to practise what it preaches, so it serves its own robots.txt
 * and a sitemap generated from real routes and stored audits.
 */
router.get('/robots.txt', (req, res) => {
  const base = baseUrl(req);
  res.type('text/plain').send(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      '',
      `Sitemap: ${base}/sitemap.xml`,
      ''
    ].join('\n')
  );
});

router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const base = baseUrl(req);
    const staticPages = [
      { loc: '/', priority: '1.0', changefreq: 'weekly' },
      { loc: '/guide', priority: '0.8', changefreq: 'monthly' },
      { loc: '/history', priority: '0.5', changefreq: 'daily' }
    ];
    const audits = await store.recentAudits(100).catch(() => []);

    const urls = [
      ...staticPages.map((p) => ({ ...p, lastmod: new Date().toISOString() })),
      ...audits.map((a) => ({
        loc: `/audit/${a.id}`,
        priority: '0.4',
        changefreq: 'monthly',
        lastmod: new Date(a.created_at).toISOString()
      }))
    ];

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls
        .map(
          (u) =>
            `  <url><loc>${base}${u.loc}</loc><lastmod>${u.lastmod}</lastmod>` +
            `<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
        )
        .join('\n') +
      '\n</urlset>\n';

    res.type('application/xml').send(xml);
  } catch (err) { next(err); }
});

module.exports = router;
