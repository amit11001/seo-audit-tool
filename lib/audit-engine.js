'use strict';

const cheerio = require('cheerio');
const { fetchPage, fetchText } = require('./fetcher');
const { checks, CATEGORY } = require('./checks');
const { extractKeywords, findOpportunities } = require('./keywords');

const STATUS_VALUE = { pass: 1, warn: 0.5, fail: 0 };

function gradeFor(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 55) return 'D';
  return 'F';
}

/** Body copy with script, style and nav chrome stripped out. */
function visibleText($) {
  const $$ = $.root().clone();
  $$.find('script, style, noscript, template, svg, iframe').remove();
  return $$.find('body').text().replace(/\s+/g, ' ').trim();
}

async function runAudit(inputUrl) {
  const page = await fetchPage(inputUrl);
  const $ = cheerio.load(page.html);

  const origin = new URL(page.finalUrl).origin;
  const [robots, sitemap] = await Promise.all([
    fetchText(`${origin}/robots.txt`),
    fetchText(`${origin}/sitemap.xml`)
  ]);

  const text = visibleText($);
  const wordCount = text ? text.split(/\s+/).length : 0;

  const ctx = { ...page, $, robots, sitemap, text, wordCount };

  const results = [];
  let earned = 0;
  let possible = 0;

  for (const check of checks) {
    let outcome;
    try {
      outcome = check.run(ctx);
    } catch (err) {
      // A single broken check must never take down the whole report.
      outcome = { status: 'info', message: `Check could not run: ${err.message}` };
    }
    if (outcome.status !== 'info') {
      earned += STATUS_VALUE[outcome.status] * check.weight;
      possible += check.weight;
    }
    results.push({
      checkId: check.id,
      category: check.category,
      label: check.label,
      weight: check.weight,
      status: outcome.status,
      message: outcome.message,
      detail: outcome.detail || null,
      fix: outcome.fix || null
    });
  }

  const score = possible ? Math.round((earned / possible) * 100) : 0;

  const keywords = extractKeywords(text, {
    title: $('head title').first().text(),
    h1: $('h1').first().text(),
    metaDescription: $('meta[name="description"]').attr('content') || '',
    domain: new URL(page.finalUrl).hostname
  });

  return {
    ...page,
    score,
    grade: gradeFor(score),
    wordCount,
    results,
    keywords,
    opportunities: findOpportunities(keywords),
    counts: {
      pass: results.filter((r) => r.status === 'pass').length,
      warn: results.filter((r) => r.status === 'warn').length,
      fail: results.filter((r) => r.status === 'fail').length,
      info: results.filter((r) => r.status === 'info').length
    }
  };
}

/** Groups results for rendering, preserving a sensible category order. */
function groupByCategory(results) {
  const order = [CATEGORY.META, CATEGORY.CONTENT, CATEGORY.TECH, CATEGORY.STRUCT, CATEGORY.LINKS];
  return order
    .map((name) => ({ name, items: results.filter((r) => r.category === name) }))
    .filter((g) => g.items.length);
}

/** Highest-weight failures first — this is the "what do I fix on Monday" list. */
function priorityFixes(results, limit = 5) {
  return results
    .filter((r) => r.status === 'fail' || r.status === 'warn')
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'fail' ? -1 : 1;
      return b.weight - a.weight;
    })
    .slice(0, limit);
}

module.exports = { runAudit, groupByCategory, priorityFixes, gradeFor };
