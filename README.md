# SEO Audit Tool

A web application that fetches any public URL, runs 27 weighted on-page and technical SEO checks against it, scores the page out of 100, and returns an ordered list of what to fix first. It also extracts the page's own keyword vocabulary and classifies it by search intent, flagging commercially valuable phrases that never made it into the title tag.

Built with Node.js, Express, MySQL and server-rendered EJS.

---

## Why server-rendered and not a React SPA

The brief asks for an application that is itself highly SEO optimised. A client-rendered single-page app is the wrong architecture for that requirement: crawlers get an empty `<div id="root">` on first fetch and have to wait for a render pass that not every crawler performs. Server-rendered HTML ships the full document on the first byte.

The same reasoning drives the rest of the stack:

| Decision | Reason |
|---|---|
| Server-side rendering (EJS) | Complete HTML in the first response; no hydration cost |
| No web fonts | Zero blocking font requests. The tool penalises other sites for slow first paint, so it should not be slow itself |
| ~1 KB of JavaScript, all optional | Every page works with JS disabled, which is close to how a crawler sees it |
| Node's built-in `fetch` | No HTTP client dependency; the whole app has 8 direct dependencies |
| Single Express process | One service to deploy, one free tier to fit inside |

The app serves its own `robots.txt` and generates `sitemap.xml` from real routes and stored audits. Every page has a unique title, meta description, canonical URL, full Open Graph set and JSON-LD structured data.

---

## Setup

Requires Node.js 18.17 or newer and a MySQL 8 database.

```bash
git clone <your-repo-url>
cd seo-audit-tool
npm install

cp .env.example .env
# edit .env with your database credentials
```

Create the database, then apply the schema:

```sql
CREATE DATABASE seo_audit CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
npm run db:init
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Listen port |
| `BASE_URL` | derived from request | Public origin, used for canonical tags and sitemap |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | — | MySQL connection |
| `DB_SSL` | `false` | Set `true` for managed MySQL (Aiven, PlanetScale, Railway) |
| `FETCH_TIMEOUT_MS` | `15000` | Abort a target page fetch after this long |
| `FETCH_MAX_BYTES` | `5242880` | Stop reading a response past this size |

---

## Project layout

```
config/db.js          MySQL connection pool and transaction helper
lib/fetcher.js        URL validation, SSRF guard, capped fetch with timing
lib/checks.js         The 27 checks — each a weighted, self-contained rule
lib/audit-engine.js   Orchestrates fetch, parse, run, score
lib/keywords.js       Keyword extraction and intent classification
lib/store.js          All SQL; routes never write queries
routes/index.js       Pages and the JSON API
routes/seo.js         robots.txt and sitemap.xml for this app
views/                EJS templates
public/               CSS, one small script, icons
db/schema.sql         Schema
scripts/init-db.js    Applies the schema
```

## Routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Audit form and recent runs |
| `POST` | `/audit` | Run an audit, redirect to its report |
| `GET` | `/audit/:id` | Full report |
| `GET` | `/history` | All domains and runs |
| `GET` | `/sites/:id/keywords` | Keyword map with title-tag gaps |
| `POST` | `/sites/:id/keywords` | Add a tracked keyword |
| `GET` | `/guide` | Generated reference for all checks |
| `GET` | `/api/audits/:id` | Report as JSON |
| `GET` | `/healthz` | Liveness and database check |
| `GET` | `/robots.txt`, `/sitemap.xml` | Generated |

---

## Deployment

The app is a single Node process plus a MySQL database, so it fits on a free tier.

**Render (or Railway):**

1. Push to GitHub, create a new Web Service pointing at the repo.
2. Build command `npm install`, start command `npm start`.
3. Add the environment variables from the table above. Set `BASE_URL` to the assigned URL and `NODE_ENV=production`.
4. Provision MySQL (Aiven and Railway both have free tiers), set `DB_SSL=true`, and run `npm run db:init` once from the shell.

`app.set('trust proxy', 1)` is already set, which these platforms require for correct protocol detection and rate limiting.

---

## Security

- **SSRF protection.** The app accepts a user-supplied URL and fetches it server-side, which is an SSRF hole unless the resolved address is checked. `lib/fetcher.js` resolves the hostname and rejects loopback, link-local (including `169.254.169.254`, the cloud metadata endpoint), private, CGNAT and multicast ranges.
- **Response size cap.** The body is read through a stream and cut off at `FETCH_MAX_BYTES`, so one large target page cannot exhaust memory.
- **Rate limiting.** Auditing is capped at 20 requests per 10 minutes per IP, because each one makes outbound requests.
- **SQL injection.** Every query is parameterised through `mysql2` prepared statements. The two places a value is interpolated (`LIMIT`) are integer-coerced and clamped first.
- **XSS.** EJS `<%= %>` escapes by default; no user-supplied value is rendered with `<%- %>`.
- **Headers.** Helmet sets a strict Content Security Policy with no inline scripts or styles.

---

## Known limits

- Does not execute JavaScript, so a client-rendered target page will look emptier here than in a browser. That is a real limitation, and also a real diagnostic.
- No search volume or keyword difficulty data. Those require a paid API. Intent classification is rule-based and readable in `lib/keywords.js`.
- Audits one URL at a time. Whole-site crawling is the obvious next feature.
- No authentication. Stored audits are public to anyone with the URL.

## Possible next steps

- Crawl a whole site from the sitemap and roll results into a site-level score.
- Scheduled re-audits with score trend charts.
- PageSpeed Insights API integration for field Core Web Vitals.
- Export a report as PDF for client delivery.
