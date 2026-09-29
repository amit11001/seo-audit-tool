'use strict';

/**
 * The check registry.
 *
 * Every check is a plain object with a `run(ctx)` that returns
 * { status, message, detail?, fix? }. Status is one of pass | warn | fail | info.
 * `info` checks are reported but excluded from the score.
 *
 * Weights reflect how much Google's own Search Essentials and the SEO starter
 * guide lean on each signal — title and description outrank, say, a favicon.
 */

const CATEGORY = {
  META: 'Metadata',
  CONTENT: 'Content',
  TECH: 'Technical',
  STRUCT: 'Structured data',
  LINKS: 'Links'
};

const truncate = (s, n = 300) => (s && s.length > n ? `${s.slice(0, n)}…` : s || '');

const GENERIC_ANCHORS = new Set([
  'click here', 'here', 'read more', 'more', 'link', 'this', 'learn more',
  'see more', 'details', 'go', 'continue', 'download'
]);

const checks = [
  // ---------------------------------------------------------------- Metadata
  {
    id: 'title',
    category: CATEGORY.META,
    label: 'Title tag',
    weight: 10,
    run: ({ $ }) => {
      const nodes = $('head title');
      const title = nodes.first().text().trim();
      if (!title) {
        return {
          status: 'fail',
          message: 'No title tag. This is the single most important on-page tag.',
          fix: 'Add a unique <title> of 50–60 characters describing the page and its primary keyword.'
        };
      }
      if (nodes.length > 1) {
        return {
          status: 'warn',
          message: `${nodes.length} title tags found. Search engines will pick one and ignore the rest.`,
          detail: title,
          fix: 'Keep exactly one <title> in <head>.'
        };
      }
      const len = title.length;
      if (len < 30) {
        return {
          status: 'warn',
          message: `Title is ${len} characters — short enough that you are leaving room unused.`,
          detail: title,
          fix: 'Expand to 50–60 characters and include the page keyword plus the brand.'
        };
      }
      if (len > 60) {
        return {
          status: 'warn',
          message: `Title is ${len} characters and will be truncated in results.`,
          detail: title,
          fix: 'Trim to 60 characters, keyword first.'
        };
      }
      return { status: 'pass', message: `Title is ${len} characters — in range.`, detail: title };
    }
  },
  {
    id: 'meta-description',
    category: CATEGORY.META,
    label: 'Meta description',
    weight: 8,
    run: ({ $ }) => {
      const desc = ($('meta[name="description"]').attr('content') || '').trim();
      if (!desc) {
        return {
          status: 'fail',
          message: 'No meta description, so Google will invent a snippet from page text.',
          fix: 'Add a 140–160 character description that reads like ad copy and contains the keyword.'
        };
      }
      const len = desc.length;
      if (len < 70) {
        return { status: 'warn', message: `Description is only ${len} characters.`, detail: desc, fix: 'Expand to 140–160 characters.' };
      }
      if (len > 160) {
        return { status: 'warn', message: `Description is ${len} characters and will be cut off.`, detail: truncate(desc), fix: 'Trim to 160 characters.' };
      }
      return { status: 'pass', message: `Description is ${len} characters — in range.`, detail: desc };
    }
  },
  {
    id: 'canonical',
    category: CATEGORY.META,
    label: 'Canonical URL',
    weight: 6,
    run: ({ $, finalUrl }) => {
      const nodes = $('link[rel="canonical"]');
      const href = (nodes.first().attr('href') || '').trim();
      if (!href) {
        return {
          status: 'warn',
          message: 'No canonical tag. Duplicate URLs (query strings, trailing slashes) will split ranking signals.',
          fix: 'Add <link rel="canonical" href="..."> pointing at the preferred absolute URL.'
        };
      }
      if (nodes.length > 1) {
        return { status: 'fail', message: `${nodes.length} canonical tags found. Google ignores conflicting canonicals.`, fix: 'Keep exactly one.' };
      }
      let resolved;
      try {
        resolved = new URL(href, finalUrl).href;
      } catch {
        return { status: 'fail', message: 'Canonical href is not a valid URL.', detail: href };
      }
      const same = resolved.replace(/\/$/, '') === finalUrl.replace(/\/$/, '');
      return {
        status: same ? 'pass' : 'warn',
        message: same ? 'Canonical points at this URL.' : 'Canonical points at a different URL.',
        detail: resolved
      };
    }
  },
  {
    id: 'viewport',
    category: CATEGORY.META,
    label: 'Mobile viewport',
    weight: 7,
    run: ({ $ }) => {
      const vp = ($('meta[name="viewport"]').attr('content') || '').trim();
      if (!vp) {
        return {
          status: 'fail',
          message: 'No viewport meta tag. Google indexes mobile-first, so this affects every page.',
          fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.'
        };
      }
      if (!/width\s*=\s*device-width/i.test(vp)) {
        return { status: 'warn', message: 'Viewport does not set width=device-width.', detail: vp };
      }
      if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i.test(vp)) {
        return { status: 'warn', message: 'Viewport blocks zooming, which is an accessibility failure.', detail: vp, fix: 'Remove user-scalable=no and maximum-scale.' };
      }
      return { status: 'pass', message: 'Responsive viewport is declared.', detail: vp };
    }
  },
  {
    id: 'lang',
    category: CATEGORY.META,
    label: 'Language attribute',
    weight: 3,
    run: ({ $ }) => {
      const lang = ($('html').attr('lang') || '').trim();
      if (!lang) {
        return { status: 'warn', message: 'No lang attribute on <html>.', fix: 'Add lang="en" (or the correct locale) so Google serves the page to the right audience.' };
      }
      return { status: 'pass', message: `Page language declared as "${lang}".` };
    }
  },
  {
    id: 'charset',
    category: CATEGORY.META,
    label: 'Character encoding',
    weight: 2,
    run: ({ $ }) => {
      const meta = $('meta[charset]').attr('charset') || '';
      const http = $('meta[http-equiv="Content-Type"]').attr('content') || '';
      if (!meta && !http) {
        return { status: 'warn', message: 'No charset declared. Non-ASCII characters may render as mojibake.', fix: 'Add <meta charset="utf-8"> as the first tag in <head>.' };
      }
      return { status: 'pass', message: `Encoding declared (${meta || http}).` };
    }
  },
  {
    id: 'robots-meta',
    category: CATEGORY.META,
    label: 'Indexability',
    weight: 9,
    run: ({ $, headers }) => {
      const meta = ($('meta[name="robots"]').attr('content') || '').toLowerCase();
      const header = (headers['x-robots-tag'] || '').toLowerCase();
      const combined = `${meta} ${header}`;
      if (combined.includes('noindex')) {
        return {
          status: 'fail',
          message: 'Page is set to noindex, so it cannot rank at all.',
          detail: `meta robots: ${meta || '—'} | X-Robots-Tag: ${header || '—'}`,
          fix: 'Remove noindex if this page is meant to be found.'
        };
      }
      if (combined.includes('nofollow')) {
        return { status: 'warn', message: 'Page-level nofollow stops link equity flowing to internal pages.', detail: meta || header };
      }
      return { status: 'pass', message: 'Page is indexable.' };
    }
  },

  // ----------------------------------------------------------------- Content
  {
    id: 'h1',
    category: CATEGORY.CONTENT,
    label: 'H1 heading',
    weight: 8,
    run: ({ $ }) => {
      const h1s = $('h1').map((_, el) => $(el).text().trim()).get().filter(Boolean);
      if (h1s.length === 0) {
        return { status: 'fail', message: 'No H1. Nothing states the page topic in the markup.', fix: 'Add exactly one H1 that matches the page intent.' };
      }
      if (h1s.length > 1) {
        return { status: 'warn', message: `${h1s.length} H1 tags dilute the topic signal.`, detail: h1s.join(' | '), fix: 'Keep one H1; demote the rest to H2.' };
      }
      return { status: 'pass', message: 'Exactly one H1.', detail: h1s[0] };
    }
  },
  {
    id: 'heading-order',
    category: CATEGORY.CONTENT,
    label: 'Heading hierarchy',
    weight: 4,
    run: ({ $ }) => {
      const levels = $('h1,h2,h3,h4,h5,h6')
        .map((_, el) => Number(el.tagName.slice(1)))
        .get();
      if (levels.length < 2) {
        return { status: 'warn', message: 'Fewer than two headings — the page has almost no structure.', fix: 'Break content into H2 sections.' };
      }
      const skips = [];
      for (let i = 1; i < levels.length; i += 1) {
        if (levels[i] - levels[i - 1] > 1) skips.push(`H${levels[i - 1]} → H${levels[i]}`);
      }
      if (skips.length) {
        return { status: 'warn', message: `${skips.length} skipped heading level(s).`, detail: skips.join(', '), fix: 'Do not jump levels; go H1 → H2 → H3 in order.' };
      }
      return { status: 'pass', message: `${levels.length} headings in a clean order.` };
    }
  },
  {
    id: 'image-alt',
    category: CATEGORY.CONTENT,
    label: 'Image alt text',
    weight: 6,
    run: ({ $ }) => {
      const imgs = $('img').get();
      if (!imgs.length) return { status: 'info', message: 'No images on the page.' };
      const missing = imgs.filter((el) => {
        const alt = $(el).attr('alt');
        const decorative = $(el).attr('role') === 'presentation' || alt === '';
        return alt === undefined && !decorative;
      });
      const pct = Math.round(((imgs.length - missing.length) / imgs.length) * 100);
      if (!missing.length) return { status: 'pass', message: `All ${imgs.length} images have alt text.` };
      const samples = missing.slice(0, 5).map((el) => $(el).attr('src') || '(inline)').join(', ');
      return {
        status: missing.length / imgs.length > 0.3 ? 'fail' : 'warn',
        message: `${missing.length} of ${imgs.length} images have no alt attribute (${pct}% covered).`,
        detail: truncate(samples),
        fix: 'Describe what the image shows. Use alt="" only for purely decorative images.'
      };
    }
  },
  {
    id: 'content-depth',
    category: CATEGORY.CONTENT,
    label: 'Content depth',
    weight: 6,
    run: ({ wordCount }) => {
      if (wordCount < 150) {
        return { status: 'fail', message: `Only ${wordCount} words of body text. Google treats this as thin content.`, fix: 'Aim for 600+ words of genuinely useful copy on commercial landing pages.' };
      }
      if (wordCount < 400) {
        return { status: 'warn', message: `${wordCount} words. Competitive queries usually need more depth.`, fix: 'Expand with specifics: process, use cases, FAQs.' };
      }
      return { status: 'pass', message: `${wordCount} words of body content.` };
    }
  },
  {
    id: 'title-h1-alignment',
    category: CATEGORY.CONTENT,
    label: 'Title and H1 agreement',
    weight: 3,
    run: ({ $ }) => {
      const tokens = (s) =>
        new Set(
          String(s || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 3)
        );
      const t = tokens($('head title').first().text());
      const h = tokens($('h1').first().text());
      if (!t.size || !h.size) return { status: 'info', message: 'Not enough text to compare title and H1.' };
      const shared = [...t].filter((w) => h.has(w));
      const overlap = shared.length / Math.min(t.size, h.size);
      if (overlap < 0.25) {
        return { status: 'warn', message: 'Title and H1 share almost no vocabulary, so the page topic reads as inconsistent.', fix: 'Make both target the same primary keyword.' };
      }
      return { status: 'pass', message: `Title and H1 share ${shared.length} keyword(s).`, detail: shared.join(', ') };
    }
  },

  // --------------------------------------------------------------- Technical
  {
    id: 'https',
    category: CATEGORY.TECH,
    label: 'HTTPS',
    weight: 8,
    run: ({ finalUrl }) => {
      const secure = finalUrl.startsWith('https://');
      return secure
        ? { status: 'pass', message: 'Served over HTTPS.' }
        : { status: 'fail', message: 'Served over plain HTTP. HTTPS is a confirmed ranking signal and browsers flag the page as insecure.', fix: 'Install a TLS certificate and 301-redirect all HTTP traffic.' };
    }
  },
  {
    id: 'status-code',
    category: CATEGORY.TECH,
    label: 'HTTP status',
    weight: 7,
    run: ({ statusCode, requestedUrl, finalUrl }) => {
      if (statusCode >= 400) {
        return { status: 'fail', message: `Server returned ${statusCode}.`, fix: 'Fix the error before worrying about anything else on this list.' };
      }
      const redirected = requestedUrl.replace(/\/$/, '') !== finalUrl.replace(/\/$/, '');
      if (redirected) {
        return { status: 'warn', message: `Request was redirected to ${finalUrl}. Each hop costs crawl budget and a little link equity.`, fix: 'Link to the final URL directly.' };
      }
      return { status: 'pass', message: `Responded ${statusCode} with no redirect.` };
    }
  },
  {
    id: 'ttfb',
    category: CATEGORY.TECH,
    label: 'Server response time',
    weight: 6,
    run: ({ ttfbMs }) => {
      if (ttfbMs > 1500) return { status: 'fail', message: `First byte took ${ttfbMs}ms. Anything over 1.5s hurts both crawling and Core Web Vitals.`, fix: 'Add caching, a CDN, or fix slow database queries.' };
      if (ttfbMs > 800) return { status: 'warn', message: `First byte took ${ttfbMs}ms. Google's guidance is under 800ms.` };
      return { status: 'pass', message: `First byte in ${ttfbMs}ms.` };
    }
  },
  {
    id: 'page-weight',
    category: CATEGORY.TECH,
    label: 'HTML payload',
    weight: 4,
    run: ({ pageBytes }) => {
      const kb = Math.round(pageBytes / 1024);
      if (kb > 500) return { status: 'fail', message: `${kb} KB of raw HTML. Oversized documents delay render and parsing.`, fix: 'Move inline styles and data blobs into cached external files.' };
      if (kb > 150) return { status: 'warn', message: `${kb} KB of raw HTML is heavier than typical.` };
      return { status: 'pass', message: `${kb} KB of HTML.` };
    }
  },
  {
    id: 'compression',
    category: CATEGORY.TECH,
    label: 'Response compression',
    weight: 4,
    run: ({ headers }) => {
      const enc = (headers['content-encoding'] || '').toLowerCase();
      if (!enc) return { status: 'warn', message: 'Response is not compressed.', fix: 'Enable gzip or Brotli. It typically cuts HTML transfer by 70%.' };
      return { status: 'pass', message: `Compressed with ${enc}.` };
    }
  },
  {
    id: 'mixed-content',
    category: CATEGORY.TECH,
    label: 'Mixed content',
    weight: 5,
    run: ({ $, finalUrl }) => {
      if (!finalUrl.startsWith('https://')) return { status: 'info', message: 'Page is not HTTPS, so mixed content does not apply yet.' };
      const insecure = $('img[src^="http://"], script[src^="http://"], link[href^="http://"], iframe[src^="http://"], source[src^="http://"]').get();
      if (!insecure.length) return { status: 'pass', message: 'All subresources load over HTTPS.' };
      return {
        status: 'fail',
        message: `${insecure.length} subresource(s) load over plain HTTP and will be blocked by the browser.`,
        fix: 'Change those URLs to https:// or use protocol-relative paths.'
      };
    }
  },
  {
    id: 'robots-txt',
    category: CATEGORY.TECH,
    label: 'robots.txt',
    weight: 5,
    run: ({ robots }) => {
      if (!robots.ok) return { status: 'warn', message: 'No robots.txt found.', fix: 'Add one at the domain root, even if it only points to your sitemap.' };
      const blocksAll = /^\s*disallow:\s*\/\s*$/im.test(robots.text) && /user-agent:\s*\*/i.test(robots.text);
      if (blocksAll) {
        return { status: 'fail', message: 'robots.txt disallows the whole site for all crawlers.', detail: truncate(robots.text, 200), fix: 'Remove "Disallow: /" from the User-agent: * block.' };
      }
      const hasSitemap = /sitemap:/i.test(robots.text);
      return {
        status: hasSitemap ? 'pass' : 'warn',
        message: hasSitemap ? 'robots.txt present and references a sitemap.' : 'robots.txt present but does not reference a sitemap.',
        fix: hasSitemap ? undefined : 'Add a "Sitemap: https://example.com/sitemap.xml" line.'
      };
    }
  },
  {
    id: 'sitemap',
    category: CATEGORY.TECH,
    label: 'XML sitemap',
    weight: 5,
    run: ({ sitemap }) => {
      if (!sitemap.ok) return { status: 'warn', message: 'No sitemap.xml at the domain root.', fix: 'Generate one and submit it in Google Search Console.' };
      const urls = (sitemap.text.match(/<loc>/gi) || []).length;
      return { status: 'pass', message: `sitemap.xml found with ${urls} URL entries.` };
    }
  },
  {
    id: 'favicon',
    category: CATEGORY.TECH,
    label: 'Favicon',
    weight: 1,
    run: ({ $ }) => {
      const icon = $('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').first().attr('href');
      return icon
        ? { status: 'pass', message: 'Favicon declared.', detail: icon }
        : { status: 'warn', message: 'No favicon link. Google shows one beside mobile results.', fix: 'Add <link rel="icon" href="/favicon.ico">.' };
    }
  },

  // -------------------------------------------------------- Structured data
  {
    id: 'json-ld',
    category: CATEGORY.STRUCT,
    label: 'Schema.org structured data',
    weight: 7,
    run: ({ $ }) => {
      const blocks = $('script[type="application/ld+json"]').get();
      if (!blocks.length) {
        return {
          status: 'fail',
          message: 'No JSON-LD structured data, so the page cannot earn rich results.',
          fix: 'Add Organization and LocalBusiness schema at minimum; add Product, FAQ or Breadcrumb where they apply.'
        };
      }
      const types = [];
      let broken = 0;
      for (const el of blocks) {
        try {
          const parsed = JSON.parse($(el).text());
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          for (const node of arr) {
            const t = node['@type'];
            if (t) types.push(Array.isArray(t) ? t.join('/') : t);
          }
        } catch {
          broken += 1;
        }
      }
      if (broken) {
        return { status: 'fail', message: `${broken} JSON-LD block(s) contain invalid JSON and are ignored by Google.`, fix: 'Validate at search.google.com/test/rich-results.' };
      }
      return { status: 'pass', message: `Structured data present: ${types.join(', ') || 'untyped'}.` };
    }
  },
  {
    id: 'open-graph',
    category: CATEGORY.STRUCT,
    label: 'Open Graph tags',
    weight: 5,
    run: ({ $ }) => {
      const required = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'];
      const missing = required.filter((p) => !$(`meta[property="${p}"]`).attr('content'));
      if (missing.length === required.length) {
        return { status: 'fail', message: 'No Open Graph tags, so shared links render as bare URLs on social platforms.', fix: 'Add og:title, og:description, og:image, og:url and og:type.' };
      }
      if (missing.length) {
        return { status: 'warn', message: `Missing ${missing.join(', ')}.`, fix: 'Complete the set so link previews render properly.' };
      }
      return { status: 'pass', message: 'Full Open Graph set present.' };
    }
  },
  {
    id: 'twitter-card',
    category: CATEGORY.STRUCT,
    label: 'Twitter card',
    weight: 2,
    run: ({ $ }) => {
      const card = $('meta[name="twitter:card"]').attr('content');
      return card
        ? { status: 'pass', message: `Twitter card type "${card}".` }
        : { status: 'warn', message: 'No twitter:card tag.', fix: 'Add <meta name="twitter:card" content="summary_large_image">.' };
    }
  },

  // ------------------------------------------------------------------- Links
  {
    id: 'internal-links',
    category: CATEGORY.LINKS,
    label: 'Internal linking',
    weight: 5,
    run: ({ $, finalUrl }) => {
      const origin = new URL(finalUrl).origin;
      let internal = 0;
      let external = 0;
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
        try {
          const abs = new URL(href, finalUrl);
          if (abs.origin === origin) internal += 1;
          else external += 1;
        } catch { /* ignore unparseable hrefs */ }
      });
      if (internal === 0) {
        return { status: 'fail', message: 'No internal links. Crawlers cannot discover the rest of the site from here.', fix: 'Link to related pages with descriptive anchor text.' };
      }
      if (internal < 5) {
        return { status: 'warn', message: `Only ${internal} internal links (${external} external).`, fix: 'Aim for 10+ contextual internal links on a content page.' };
      }
      return { status: 'pass', message: `${internal} internal and ${external} external links.` };
    }
  },
  {
    id: 'anchor-text',
    category: CATEGORY.LINKS,
    label: 'Anchor text quality',
    weight: 3,
    run: ({ $ }) => {
      const anchors = $('a[href]').get();
      if (!anchors.length) return { status: 'info', message: 'No links to evaluate.' };
      const generic = [];
      let empty = 0;
      for (const el of anchors) {
        const text = $(el).text().replace(/\s+/g, ' ').trim().toLowerCase();
        if (!text) {
          if (!$(el).find('img[alt]').attr('alt') && !$(el).attr('aria-label')) empty += 1;
          continue;
        }
        if (GENERIC_ANCHORS.has(text)) generic.push(text);
      }
      if (empty || generic.length > 3) {
        return {
          status: 'warn',
          message: `${generic.length} generic anchor(s) and ${empty} link(s) with no accessible text.`,
          detail: truncate([...new Set(generic)].join(', ')),
          fix: 'Replace "click here" with the destination topic; give icon links an aria-label.'
        };
      }
      return { status: 'pass', message: 'Anchor text is descriptive.' };
    }
  },
  {
    id: 'outbound-rel',
    category: CATEGORY.LINKS,
    label: 'Outbound link attributes',
    weight: 2,
    run: ({ $, finalUrl }) => {
      const origin = new URL(finalUrl).origin;
      let external = 0;
      let unsafe = 0;
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        let abs;
        try { abs = new URL(href, finalUrl); } catch { return; }
        if (abs.origin === origin) return;
        external += 1;
        const rel = ($(el).attr('rel') || '').toLowerCase();
        if ($(el).attr('target') === '_blank' && !rel.includes('noopener')) unsafe += 1;
      });
      if (!external) return { status: 'info', message: 'No outbound links.' };
      if (unsafe) {
        return { status: 'warn', message: `${unsafe} outbound link(s) open in a new tab without rel="noopener".`, fix: 'Add rel="noopener noreferrer" to every target="_blank" link.' };
      }
      return { status: 'pass', message: `${external} outbound links, all with safe rel attributes.` };
    }
  }
];

module.exports = { checks, CATEGORY };
