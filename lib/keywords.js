'use strict';

/**
 * Extracts candidate keywords from page text and classifies search intent.
 *
 * This is deliberately rule-based rather than an API call: it is transparent,
 * costs nothing, and the assignment asks for high-intent keyword work, not for
 * search-volume data we would have to buy.
 */

const STOPWORDS = new Set(`a about above after again against all am an and any are aren't as at be because been
before being below between both but by can cannot could couldn't did didn't do does doesn't doing don't down during
each few for from further had hadn't has hasn't have haven't having he her here hers herself him himself his how i
i'd i'll i'm i've if in into is isn't it its itself let's me more most mustn't my myself no nor not of off on once
only or other ought our ours ourselves out over own same shan't she should shouldn't so some such than that the their
theirs them themselves then there these they this those through to too under until up very was wasn't we were weren't
what when where which while who whom why with won't would wouldn't you your yours yourself yourselves also get got
will just one two new use using make made need want may much many us via per new'`.split(/\s+/));

const INTENT_PATTERNS = [
  { intent: 'transactional', re: /\b(buy|price|pricing|cost|quote|hire|order|book|subscribe|demo|trial|near me|for sale|enquiry|enquire|contact)\b/i },
  { intent: 'commercial', re: /\b(best|top|cheap|affordable|review|reviews|compare|comparison|vs|alternative|alternatives|leading|trusted|company|companies|service|services|provider|solution|solutions|agency|vendor)\b/i },
  { intent: 'informational', re: /\b(how|what|why|when|guide|tutorial|example|examples|tips|checklist|benefits|meaning|definition|difference|steps|learn)\b/i }
];

function classifyIntent(phrase, brandTokens = []) {
  const lower = phrase.toLowerCase();
  if (brandTokens.length && brandTokens.some((b) => lower.includes(b))) return 'navigational';
  for (const { intent, re } of INTENT_PATTERNS) {
    if (re.test(lower)) return intent;
  }
  return 'informational';
}

/** Commercial value ordering — used to sort the keyword table. */
const INTENT_RANK = { transactional: 3, commercial: 2, navigational: 1, informational: 0 };

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function isUseful(token) {
  return token.length > 2 && !STOPWORDS.has(token) && !/^\d+$/.test(token);
}

/**
 * Builds 1–3 word phrases, keeps the ones that occur often enough to look
 * deliberate, and reports whether each already appears in the title, H1 and
 * meta description.
 */
function extractKeywords(text, { title = '', h1 = '', metaDescription = '', domain = '', limit = 30 } = {}) {
  const tokens = tokenize(text);
  const counts = new Map();

  const bump = (phrase, n) => {
    if (!phrase) return;
    counts.set(phrase, (counts.get(phrase) || 0) + n);
  };

  for (let i = 0; i < tokens.length; i += 1) {
    if (isUseful(tokens[i])) bump(tokens[i], 1);

    if (i + 1 < tokens.length) {
      const pair = [tokens[i], tokens[i + 1]];
      if (pair.every(isUseful)) bump(pair.join(' '), 2); // phrases are worth more than single words
    }
    if (i + 2 < tokens.length) {
      const tri = [tokens[i], tokens[i + 1], tokens[i + 2]];
      if (isUseful(tri[0]) && isUseful(tri[2]) && !STOPWORDS.has(tri[1])) bump(tri.join(' '), 3);
    }
  }

  const brandTokens = tokenize(domain.replace(/\.(com|in|co|org|net|io|dev)$/g, '')).filter(isUseful);
  const lowerTitle = title.toLowerCase();
  const lowerH1 = h1.toLowerCase();
  const lowerMeta = metaDescription.toLowerCase();

  return [...counts.entries()]
    .filter(([phrase, score]) => score >= 3 && phrase.length <= 60)
    .map(([phrase, score]) => ({
      phrase,
      occurrences: score,
      intent: classifyIntent(phrase, brandTokens),
      inTitle: lowerTitle.includes(phrase),
      inH1: lowerH1.includes(phrase),
      inMeta: lowerMeta.includes(phrase)
    }))
    .sort((a, b) => {
      const rank = INTENT_RANK[b.intent] - INTENT_RANK[a.intent];
      if (rank !== 0) return rank;
      return b.occurrences - a.occurrences;
    })
    .slice(0, limit);
}

/**
 * The gap that matters commercially: a phrase used repeatedly in the body with
 * transactional or commercial intent that never made it into the title tag.
 */
function findOpportunities(keywords) {
  return keywords.filter(
    (k) => (k.intent === 'transactional' || k.intent === 'commercial') && !k.inTitle && k.occurrences >= 4
  );
}

module.exports = { extractKeywords, classifyIntent, findOpportunities, INTENT_RANK, STOPWORDS };
