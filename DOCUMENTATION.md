# Assignment documentation

**Submitted by:** Amit Kumar Choudhary
**Role:** Full Stack Development internship, Syscom
**Deliverable:** SEO audit and keyword intelligence web application
**Live URL:** _(fill in after deployment)_
**Repository:** _(fill in)_

---

## 1. How I read the brief

The assignment asked for a web app to improve brand value and SEO ranking for syscom.co.in, with a focus on off-page SEO, organic traffic, high-intent keywords and long-term growth, and it required the app itself to be highly SEO optimised.

I interpreted that as two separate deliverables, because they are two different kinds of work:

1. **A tool** that measures and diagnoses SEO health, which is the engineering task and is what the code does.
2. **A strategy** for off-page SEO and keyword targeting, which is an analysis task and is section 6 of this document.

I built the tool and wrote the strategy rather than executing the off-page campaign directly. That choice is deliberate and I would defend it in either direction:

- Backlink building, directory submission and social profile creation are marketing operations, not application features. They cannot be demonstrated inside a codebase.
- Low-quality link building carries real downside. Google's link spam policies treat manufactured links as manipulative, and a penalty is far more expensive than the traffic those links would bring. I was not willing to create that exposure on a live commercial domain from outside the company.
- What a company actually needs from a developer here is the instrumentation: something that tells them what is broken, what it costs, and what to fix first, repeatedly and for free.

---

## 2. What the application does

A user enters any public URL. The application:

1. Validates and normalises the URL, then resolves the hostname and rejects private addresses.
2. Fetches the page once, recording time to first byte, total time, status, headers and payload size.
3. Parses the HTML and fetches `robots.txt` and `sitemap.xml` from the same origin.
4. Runs 27 independent checks across five categories.
5. Computes a weighted score out of 100 and a letter grade.
6. Extracts 1–3 word keyword phrases from the body copy, classifies each by search intent, and flags the commercially valuable ones that are missing from the title tag.
7. Stores everything in MySQL so scores can be compared over time.

The output is a report with a prioritised "fix these first" list, ordered by failure severity and then by how much each check weighs.

### The checks

| Category | Checks | Weight |
|---|---|---|
| Metadata | title, meta description, canonical, viewport, lang, charset, indexability | 45 |
| Content | H1, heading hierarchy, image alt coverage, content depth, title/H1 agreement | 27 |
| Technical | HTTPS, status and redirects, TTFB, payload size, compression, mixed content, robots.txt, sitemap, favicon | 45 |
| Structured data | JSON-LD validity, Open Graph, Twitter card | 14 |
| Links | internal linking, anchor text quality, outbound rel attributes | 10 |

**Total available weight: 141 points across 27 checks.**

Weights are not uniform because search engines do not treat these signals uniformly. A missing title tag (weight 10) is a different order of problem from a missing favicon (weight 1). A pass earns full weight, a warning earns half, a failure earns nothing. Checks that cannot apply to a page — image alt text on a page with no images — are reported as informational and excluded from the denominator, so the score reflects what was actually assessable.

---

## 3. Architecture

```
Browser
  │  POST /audit  { url }
  ▼
Express (server.js)
  │  helmet → compression → rate limit → route
  ▼
audit-engine.js
  ├── fetcher.js ──────► target page  (SSRF guard, 15s timeout, 5 MB cap)
  │                 └──► robots.txt, sitemap.xml
  ├── cheerio.load(html)
  ├── checks.js   ─────► 27 weighted rules → pass | warn | fail | info
  └── keywords.js ─────► n-gram extraction → intent classification
  ▼
store.js  ──────► MySQL  (one transaction: audit + checks + keywords)
  ▼
EJS  ───────────► server-rendered HTML report
```

The layers are deliberately separable. `checks.js` has no knowledge of HTTP, the database or rendering — each check is a pure function of the parse context, which is why the `/guide` page can be generated from the same registry the engine runs, and why adding a 28th check means appending one object to an array.

### Database schema

Four tables. `sites` is the domain, unique on hostname. `audits` is one run, with the summary metrics denormalised onto the row so the history list needs no joins or aggregates. `audit_checks` is one row per check per run, which preserves the full report rather than just the score. `keywords` is unique on `(site_id, phrase)` and upserts on re-audit, so a phrase accumulates history rather than duplicating.

Every child table cascades on delete, so removing a site removes its data cleanly.

---

## 4. Making the application itself SEO optimised

This was a stated requirement, so it drove architectural decisions rather than being added at the end.

| Requirement | Implementation |
|---|---|
| Crawlable content | Server-side rendering. The full document arrives in the first response; no JavaScript is needed to read any page |
| Unique metadata per page | Every route passes its own title, description and canonical path; report pages generate theirs from the audited domain and result counts |
| Structured data | JSON-LD `@graph` with `WebApplication` and per-page `WebPage` nodes |
| Social previews | Complete Open Graph set plus Twitter card, with an SVG preview card |
| Crawl directives | `robots.txt` served from a route; `sitemap.xml` generated from real routes and stored audits with accurate `lastmod` |
| Speed | No web fonts, ~1 KB of JavaScript, gzip via `compression`, static assets cached 30 days in production |
| Mobile | Responsive viewport, fluid type via `clamp()`, layout collapses at 34rem |
| Accessibility | Skip link, semantic landmarks, visible focus rings, table captions, `aria-current` on the active nav item, `prefers-reduced-motion` respected |
| Content depth | `/guide` is a substantive reference page generated from the check registry, which gives the site genuine indexable content rather than a thin brochure |

Reference: Google's [SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) and Search Essentials.

---

## 5. Audit of syscom.co.in

> **Fill this in before submitting.** Deploy the app, run it against `https://www.syscom.co.in`, and record the real output below. Do not estimate — the whole point of the tool is that the numbers are measured.

**Score:** \_\_\_ / 100 (grade \_\_)
**Failures:** \_\_\_ **Warnings:** \_\_\_ **Passes:** \_\_\_
**TTFB:** \_\_\_ ms **HTML size:** \_\_\_ KB **Word count:** \_\_\_

### Highest-priority findings

| # | Check | Status | What it means | Fix |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |

### Keyword gaps found

Phrases the site uses repeatedly in body copy with commercial or transactional intent, which are absent from the title tag:

| Phrase | Intent | Uses | In H1 | Recommendation |
|---|---|---|---|---|
| | | | | |

### Estimated effort to fix

| Finding | Effort | Expected effect |
|---|---|---|
| | | |

---

## 6. Off-page SEO and growth strategy

The brief asked for off-page SEO, free organic traffic, high-intent keywords and long-term growth. This section is the recommendation; it is analysis rather than execution, for the reasons in section 1.

### 6.1 Sequence matters

Off-page work amplifies a page's existing authority. Sending links to a page with no title tag, no structured data and thin content wastes them. The order should be:

1. Fix the on-page failures the tool reports. Cheapest, fastest, fully within the company's control.
2. Build content worth linking to. Links follow usefulness; there is no durable shortcut.
3. Earn citations and links against that content.
4. Measure, and repeat.

### 6.2 High-intent keyword strategy

Search intent determines commercial value far more than volume does. The tool sorts extracted phrases into four buckets:

| Intent | What the searcher wants | Commercial value | Page type that should target it |
|---|---|---|---|
| Transactional | To buy or enquire now | Highest | Service and contact pages |
| Commercial | To compare before buying | High | Comparison pages, case studies |
| Navigational | A specific known brand | Medium | Homepage, about |
| Informational | To learn | Low per visit, high in aggregate | Guides, blog posts |

The practical rule: a phrase with buying intent that the site uses repeatedly in its body copy but never places in a title tag is free ranking headroom. Nothing has to be created — the relevance already exists; it just is not declared where it counts. The keyword map page surfaces exactly this set.

For a B2B engineering supplier, long-tail transactional queries that combine service, industry and location ("control panel manufacturer in Pune", for example) convert far better than broad head terms, and are realistic to rank for without a large link budget.

### 6.3 Legitimate off-page tactics, in order of return

**Business listings and structured citations.** Google Business Profile, Bing Places, Justdial, IndiaMART, TradeIndia, and the relevant industry association directories. Name, address and phone must be byte-identical everywhere — inconsistent citations dilute the signal. This is the highest-certainty, lowest-risk work available and it is free.

**Digital PR and industry publication.** Trade publications, engineering association newsletters and supplier directories in the same vertical. One link from a relevant industry body is worth more than a hundred from general-purpose directories.

**Client case studies.** Published case studies naming real projects earn links from the clients themselves and rank for "how did X solve Y" queries at the same time. This is the single best content investment for a B2B supplier.

**Technical content that answers real questions.** Specification explainers, comparison guides, troubleshooting posts. These rank for informational queries, build topical authority, and give other sites something worth citing.

**Social signals.** LinkedIn is the relevant platform for B2B in this sector. It is not a direct ranking factor, but it drives discovery and referral traffic, and it compounds.

### 6.4 What to avoid, and why

| Tactic | Risk |
|---|---|
| Paid link networks / PBNs | Direct violation of Google's link spam policies. Manual actions are severe and slow to reverse |
| Bulk directory submission | Low-quality links at scale look manufactured and can trigger devaluation |
| Comment and forum link dropping | Almost universally `nofollow`; reads as spam; damages brand |
| Exact-match anchor text at scale | The clearest footprint of manipulation there is |
| Buying followers or engagement | No ranking effect, and reputational risk if discovered |

The asymmetry is the point: these tactics have capped upside and uncapped downside. Recovery from a manual action takes months. That is not a trade worth making for a business that depends on its domain.

### 6.5 Measuring it

| Metric | Where | Why |
|---|---|---|
| Impressions and average position by query | Google Search Console | Movement shows here before traffic does |
| Click-through rate by page | Search Console | A high-impression, low-CTR page has a title and description problem, not a ranking problem |
| Referring domains | Search Console links report | Count of unique domains matters more than count of links |
| Index coverage | Search Console | Pages that are not indexed cannot rank, and this is where you find out |
| Audit score over time | This tool | On-page health, tracked per run |

Realistic timeline: on-page fixes show in Search Console within two to four weeks. Off-page authority moves over three to six months. Anyone promising faster is either buying links or guessing.

---

## 7. Testing

`lib/keywords.js` and `lib/fetcher.js` are dependency-free and were verified against a fixture covering intent classification, n-gram extraction, stopword filtering, title/H1 presence flags, URL normalisation and rejection of invalid, non-HTTP and hostless inputs.

Manual verification path:

1. Audit a well-optimised site and confirm a high score with few failures.
2. Audit a deliberately broken local page (no title, no H1, images without alt) and confirm those specific checks fail.
3. Confirm `http://127.0.0.1:3000` is rejected by the SSRF guard.
4. Confirm a PDF or image URL is rejected with a clear message rather than a stack trace.
5. Re-audit the same domain and confirm keyword rows update rather than duplicate.
6. Disable JavaScript and confirm every page still works.
7. Run Lighthouse against the deployed app's own pages.

---

## 8. Honest limitations

- The fetcher does not execute JavaScript, so client-rendered target pages appear emptier than they do in a browser.
- No search volume or difficulty data; that requires a paid API.
- Single-URL audits only. Site-wide crawling is the obvious next feature.
- No authentication. Stored audits are readable by anyone with the URL.
- Intent classification is rule-based pattern matching. It is transparent and editable, but it is not a language model and it will misclassify ambiguous phrases.
