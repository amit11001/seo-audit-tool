# Assignment documentation

**Submitted by:** Amit Kumar Choudhary
**Role:** Full Stack Development internship, Syscom
**Deliverable:** SEO audit and keyword intelligence web application
**Live URL:** https://seo-audit-tool-sb6k.onrender.com
**Repository:** https://github.com/amit11001/seo-audit-tool
**Date:** 30 September 2026

---

## 0. Requirements mapping

Each line of the assignment brief, and where it is addressed.

| Brief requirement | Where | Status |
|---|---|---|
| Web app to boost brand value and SEO ranking for syscom.co.in | Whole application; strategy in §6 | Delivered |
| Off-page SEO (backlinks, social signals, directories) | §6.3 tactics in priority order, §6.4 what to avoid | Delivered as strategy, not executed — reasoning in §1 |
| Free / organic traffic | §6.1 sequencing, §6.2 intent targeting | Delivered |
| High-intent keywords | Keyword engine (`lib/keywords.js`), keyword map page, §6.2 | Delivered as a working feature |
| Long-term growth | §6.5 measurement plan and realistic timelines | Delivered |
| Tech: HTML5, CSS3, PHP, MySQL, Python, NodeJS etc. | Node.js, Express, MySQL, server-rendered HTML5/CSS3 | Delivered |
| Must be highly SEO optimised (per Google's SEO starter guide) | §4, point by point | Delivered |
| Submit source code | GitHub repository, link above | Delivered |
| Submit brief documentation | This document | Delivered |
| Upload to test environment | Deployed on Render | Delivered |
| Make it live on www for functionality check and SEO audit | Live URL above, publicly reachable | Delivered |
| Share live URL | Live URL above | Delivered |

A note on stack choice: the brief listed PHP, Python and NodeJS as alternatives. I chose Node.js with server-side rendering because the same brief required the application itself to be highly SEO optimised, and server-rendered HTML is the architecture that satisfies that requirement. §4 sets out the reasoning.

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

Audited 30 September 2026. syscom.co.in is a domain registration and web hosting provider operating a reseller storefront, with supporting content on several subdomains.

### 5.1 Method, and why it was not a single automated run

The first automated audit did not reach the site. The origin returned `403 Forbidden` with a bot-challenge interstitial: title `Just a moment...`, 5 KB of HTML, zero words of body text, and `meta robots: noindex,nofollow` on the challenge page itself.

Reporting that run's score as the site's score would have been wrong. The `noindex` in particular belongs to the interstitial, not to syscom.co.in, and presenting it as a site-level finding would have been a serious error.

Further testing showed the block is **user-agent dependent**: the same URL fetched successfully under a conventional browser user agent, and returned the full storefront HTML. So the findings below come from the delivered document, cross-checked against what Google has actually indexed.

**Indexing status:** Google has the homepage, `/web-hosting/index.php`, `/website-design/index.php`, `/support/contact-us.php` and pages on three subdomains indexed. Googlebot therefore passes the bot check. **The crawler block is a monitoring inconvenience, not a ranking problem** — it does not affect Google, but it does mean third-party SEO tools (and the company's own future monitoring) silently see nothing. Worth allowlisting known-good crawlers.

### 5.2 On-page findings

| # | Finding | Severity | Evidence | Fix | Effort |
|---|---|---|---|---|---|
| 1 | **Malformed viewport** | High | `<meta name="viewport" content="user-scalable = yes">` — no `width=device-width`, and spaces around `=` | Replace with `width=device-width, initial-scale=1` | 5 min |
| 2 | **Unrendered template directives in the HTML** | High | `<#if_show:codeguard#>`, `<#/if_show:sitelock#>` appear as literal text in the delivered document | Template conditionals are not being processed; fix the template engine configuration | 1–2 h |
| 3 | **Multiple H1 headings** | Medium | Six H1-level headings: "Start Building your web presence…", "Get a Domain Name", "What's New", "Customize your website.", "Get your business online today", plus one containing only `/index.php` | One H1 stating the page's purpose; demote the rest to H2 | 30 min |
| 4 | **Logo link has no accessible name** | Medium | An H1 renders as the raw path `/index.php`, meaning the logo anchor has no alt text or aria-label and the browser falls back to the href | Add `alt="SYS Com India"` to the logo image | 5 min |
| 5 | **Meta keywords stuffing** | Medium | Roughly fifty comma-separated keywords, including near-duplicates and question-form phrases ("is there free cpanel hosting?") | Delete the tag. Google has ignored it since 2009; at this volume it signals low-quality optimisation to anyone auditing the site | 2 min |
| 6 | **Currency inconsistency between title and page** | Medium | Title promises "Plans from ₹99/mo"; the page body shows `$2.65/mo`, `$1.93/mo`, `$12.10/yr` | Serve INR by default for Indian visitors so the price a searcher clicked matches the price they see | 1–2 h |
| 7 | **Inconsistent uptime claim** | Low | A heading says "99% uptime"; the bullets beneath say "99.9% Uptime Guarantee" | Pick one figure | 2 min |
| 8 | **Google is not using the supplied meta description** | Low | The HTML supplies a description about cPanel, Plesk and ₹99/mo, but search results display different text about "web design and website builder tools cheap" | Usually means Google judged the description a poor match for the query, or a stale variant persists. Verify in Search Console | 30 min |

**What is already correct:** HTTPS with no mixed content, a title in range at 43 characters, a well-written meta description at roughly 150 characters, `lang` declared, UTF-8 declared, and a genuinely deep internal link structure across the storefront.

### 5.3 Site architecture findings

The domain is spread across four properties, which matters more than any single on-page defect:

| Property | Purpose | Observation |
|---|---|---|
| `www.syscom.co.in` | Main storefront | Active, indexed |
| `customer.syscom.co.in/kb` | Knowledge base | Active, indexed |
| `blog.syscom.co.in` | Developer blog | Hosted on Blogger; posts on PocketBase, Supabase, NVIDIA GPUs for AI |
| `web.syscom.co.in` | Legacy knowledge base | **Served over plain HTTP.** Content dated February 2021, referencing WebsitePanel and a third-party control panel host |

Two real problems here.

**`web.syscom.co.in` is served over HTTP and is stale.** A five-year-old, insecure subdomain still in Google's index is a liability: it competes with the current knowledge base for the same queries, and any visitor who lands there gets a browser security warning followed by obsolete instructions. Either redirect it to the current KB with 301s or remove it and serve 410s.

**The blog is on a subdomain rather than a subdirectory.** Google treats subdomains as substantially separate properties, so authority earned by blog content consolidates weakly, if at all, into the storefront that actually sells. The blog content itself is the right idea — technical posts aimed at developers, who are exactly the audience for hosting — but at `blog.syscom.co.in` it is building authority for the wrong address. Moving it to `syscom.co.in/blog/` is the single highest-leverage structural change available, and it is a reverse-proxy configuration rather than a rewrite.

### 5.4 The structural problem

The storefront is a white-label reseller platform. The product descriptions, FAQ answers and feature bullets are supplied by the platform vendor and are shared, close to verbatim, with every other reseller running the same software — hundreds of Indian hosting companies.

This is the core SEO constraint, and no amount of link building fixes it. Google will not rank one copy of a page it already has hundreds of copies of, and it chooses the copy with the strongest domain. Against GoDaddy, Hostinger and BigRock, syscom.co.in will not be that copy.

Everything in section 6 follows from this: the only durable path is content that exists nowhere else.

### 5.5 Priority order

1. Move the blog from `blog.syscom.co.in` to `syscom.co.in/blog/` — highest structural leverage
2. Resolve `web.syscom.co.in` — HTTP and five years stale
3. Fix the viewport tag — five minutes, affects mobile-first indexing sitewide
4. Fix the unrendered template directives — visible defect in the delivered HTML
5. Rewrite the shared platform copy on the three or four pages that matter most

The first two are configuration changes. Items three and four are quick. Item five is the ongoing work.

> **Verify before submitting to a client.** These findings were gathered on 30 September 2026 from the delivered HTML, Google's index and the live site. Re-check each against Search Console, which has data no external tool can see.

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

For a hosting reseller, the head terms — "web hosting india", "cheap web hosting" — are contested by companies with eight-figure marketing budgets and are not winnable. The realistic targets are long-tail queries where intent is specific enough that the giants' generic pages answer them poorly:

- **Platform-specific:** "node.js hosting with cpanel india", "plesk hosting for asp.net"
- **Audience-specific:** "web hosting for students india", "free staging environment cpanel"
- **Migration intent:** "transfer domain from godaddy to indian registrar", "move wordpress site to indian host"
- **Support and compliance:** "indian web host with gst invoice", "hosting with phone support in india"

The site's own meta keywords already list many of these, which means someone has identified the right targets. The gap is that no page exists that genuinely answers any of them — the keywords sit in a meta tag Google ignores rather than in page content Google reads. Turning that list into actual pages is the work.

### 6.3 Legitimate off-page tactics, in order of return

**Hosting review and comparison platforms.** HostAdvice, WebHostingTalk, Trustpilot, WHTop and the India-focused comparison sites. This industry has a mature review ecosystem that general businesses lack, and a verified profile with real customer reviews earns both a link and the referral traffic that comes with being listed alongside competitors. Highest-certainty work available, and free.

**Google Business Profile and Indian business directories.** Justdial, IndiaMART, Sulekha. Name, address and phone byte-identical everywhere — inconsistent citations dilute the signal.

**Original technical content, on the main domain.** The blog already produces the right kind of material. Published on `syscom.co.in/blog/` rather than a subdomain, posts like "Deploy Node.js on cPanel shared hosting" or "Plesk vs cPanel for ASP.NET" earn links from developers, rank for queries the white-label pages cannot touch, and build topical authority for the domain that sells. This is the only tactic here that also solves the duplicate-content problem in section 5.4.

**Developer community presence.** Stack Overflow, r/webhosting, WebHostingTalk, Indian developer communities. Answering hosting configuration questions genuinely — not dropping links — builds the kind of reputation that produces unprompted recommendations. Slow, and the only thing that compounds.

**Customer case studies.** An Indian SaaS or agency that runs on their infrastructure, written up properly, earns a link from that customer and ranks for "hosting for X" queries simultaneously.

### 6.4 What to avoid, and why

| Tactic | Risk |
|---|---|
| Paid link networks / PBNs | Direct violation of Google's link spam policies. Manual actions are severe and slow to reverse |
| Bulk directory submission | Low-quality links at scale look manufactured and can trigger devaluation |
| Comment and forum link dropping | Almost universally `nofollow`; reads as spam; damages brand |
| Exact-match anchor text at scale | The clearest footprint of manipulation there is |
| Buying followers or engagement | No ranking effect, and reputational risk if discovered |
| Fake or incentivised reviews on hosting comparison sites | Platform bans are permanent and public, and this industry's review sites actively police them. The downside is brand damage, not just a lost link |

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

## 8. Measured performance of this application

Measured 30 September 2026 against the deployed application at `/audit/2`.

| Metric | Result |
|---|---|
| This tool's score against its own 27 checks | **95 / 100 — grade A** |
| Lighthouse Performance | **100** |
| Lighthouse SEO | **100** |
| Lighthouse Accessibility | **96** |
| Lighthouse Best Practices | **92** |

A perfect Lighthouse SEO score and 95 against the tool's own stricter checks is the evidence for the requirement that the application itself be highly SEO optimised. The two differ because they measure different things: Lighthouse checks that the fundamentals are present, while this tool also grades whether they are well-formed — title length in range, description length in range, structured data valid, internal link count sufficient.

Performance of 100 reflects the architectural choices in section 4: no web fonts, roughly 1 KB of JavaScript, gzip compression, and a complete document in the first response. It is measured on a warm container. Render's free tier spins an idle service down, and the first request after that pays a cold start of 30–60 seconds; warm requests are unaffected.

Accessibility at 96 and Best Practices at 92 leave room. Both are worth closing rather than explaining away, and they are the first things I would fix given another day.

---

## 9. Honest limitations

- The fetcher does not execute JavaScript, so client-rendered target pages appear emptier than they do in a browser.
- The tool cannot pass bot-protection challenges. As section 5 documents, a protected origin returns an interstitial and the audit scores that page instead of the site. A production version would detect this — a 403 combined with zero body words and a known challenge title is a reliable signature — and report "origin unreachable" rather than a misleading score. That detection is the first change I would make.
- No search volume or difficulty data; that requires a paid API.
- Single-URL audits only. Site-wide crawling is the obvious next feature.
- No authentication. Stored audits are readable by anyone with the URL.
- Intent classification is rule-based pattern matching. It is transparent and editable, but it is not a language model and it will misclassify ambiguous phrases.
- **The n-gram extractor does not respect sentence boundaries.** Auditing example.com produced the phrase "service avoid relying", which spans the end of one sentence and the start of the next and means nothing. The same run classified "documentation examples without" as navigational because a substring matched the domain token. Both are visible in the keyword map for that audit. The fix is to split text on sentence terminators before building n-grams, and to match brand tokens on whole words rather than substrings. I found this by reading my own output rather than by testing for it, which is itself the lesson: on a content-rich page the noise is diluted, but on a thin page it dominates.