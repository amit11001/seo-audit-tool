'use strict';

require('dotenv').config();

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');

const routes = require('./routes/index');
const seoRoutes = require('./routes/seo');
const db = require('./config/db');

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Render/Railway/Vercel put us behind a proxy; without this, req.protocol is
// always http and the rate limiter sees one shared IP.
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"]
      }
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  })
);

// Compression is a ranking-adjacent win, and the tool flags sites that skip it.
app.use(compression());

app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '30d' : 0,
    etag: true
  })
);
app.use(express.urlencoded({ extended: false, limit: '32kb' }));

// Values every view needs.
app.use((req, res, next) => {
  res.locals.baseUrl = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  res.locals.path = req.path;
  res.locals.year = new Date().getFullYear();
  next();
});

app.get('/healthz', async (req, res) => {
  try {
    await db.ping();
    res.json({ status: 'ok', db: 'up' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'down', error: err.message });
  }
});

app.use('/', seoRoutes);
app.use('/', routes);

// 404
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page not found',
    description: 'That page does not exist.',
    canonicalPath: req.path,
    heading: 'Page not found',
    body: 'That URL does not match anything here. Start a new audit from the home page.'
  });
});

// 500
app.use((err, req, res, _next) => {
  console.error('[error]', err);
  res.status(500).render('error', {
    title: 'Something went wrong',
    description: 'An unexpected error occurred.',
    canonicalPath: req.path,
    heading: 'Something went wrong',
    body:
      process.env.NODE_ENV === 'production'
        ? 'The audit could not be completed. Try again, and if it keeps happening the target site may be blocking automated requests.'
        : err.message
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`SEO audit tool listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
