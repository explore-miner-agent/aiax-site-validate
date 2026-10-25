import { readFileSync } from 'node:fs';
import { check } from './schema.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../schemas/${f}`, import.meta.url), 'utf8'));
export const manifestSchema = load('manifest.schema.json');
export const sectionSchema = load('section.schema.json');
export const MANIFEST_PATHS = ['/.well-known/aiax.json', '/aiax/manifest.json'];
export const ERROR_COST = 20;
export const WARNING_COST = 2;
export { check };

export function score(errors, warnings) {
  return Math.max(0, Math.min(100, 100 - ERROR_COST * errors - WARNING_COST * warnings));
}

const estimateTokens = (text) => Math.ceil(text.length / 4);

async function getJson(fetchFn, url) {
  let res;
  try { res = await fetchFn(url, { headers: { accept: 'application/json' } }); }
  catch (e) { return { problem: `could not be fetched (${e && e.message ? e.message : 'network error'})` }; }
  if (!res.ok) return { problem: `could not be fetched, the server answered HTTP ${res.status}` };
  const text = await res.text();
  try { return { json: JSON.parse(text), text }; }
  catch { return { problem: 'is not valid JSON', text }; }
}

/**
 * Fetch a site's AIAX manifest and every section it points to, validate them against the
 * AIAX 0.1 schemas and return a scored report. Never throws on site problems.
 */
export async function validateSite(url, opts = {}) {
  const fetchFn = opts.fetch || globalThis.fetch;
  let base;
  try { base = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`); }
  catch { throw new TypeError(`not a valid site URL: ${url}`); }
  const errors = [], warnings = [], sections = [];
  const report = { url: base.href, manifest_url: null, ok: false, score: 0, errors, warnings, sections };

  let manifest = null, tried = [];
  for (const p of MANIFEST_PATHS) {
    const mu = new URL(p, base).href;
    const r = await getJson(fetchFn, mu);
    if (r.json !== undefined) { manifest = r.json; report.manifest_url = mu; break; }
    tried.push({ url: mu, problem: r.problem });
    if (r.problem === 'is not valid JSON') { report.manifest_url = mu; errors.push({ url: mu, path: '', message: `the manifest at ${mu} is not valid JSON` }); break; }
  }
  if (manifest === null) {
    if (!errors.length) errors.push({ url: tried[0].url, path: '', message: `no AIAX manifest found: ${tried.map((t) => `${t.url} ${t.problem}`).join('; ')}` });
    report.score = score(errors.length, warnings.length);
    return report;
  }
  const mu = report.manifest_url;
  if (mu !== new URL(MANIFEST_PATHS[0], base).href) warnings.push({ url: mu, path: '', message: `the manifest was found only at ${MANIFEST_PATHS[1]}; ${MANIFEST_PATHS[0]} is the preferred location` });
  for (const e of check(manifestSchema, manifest)) errors.push({ url: mu, ...e });

  const eps = manifest && Array.isArray(manifest.entry_points) ? manifest.entry_points : [];
  const seen = new Set();
  for (let i = 0; i < eps.length; i++) {
    const ep = eps[i];
    if (!ep || typeof ep !== 'object' || typeof ep.url !== 'string') continue;
    const id = typeof ep.id === 'string' ? ep.id : null;
    if (id && seen.has(id)) errors.push({ url: mu, path: `/entry_points/${i}/id`, message: `entry_points.${i}.id ${JSON.stringify(id)} is used by more than one entry point` });
    if (id) seen.add(id);
    let su;
    try { su = new URL(ep.url, mu).href; } catch { continue; }
    const sec = { id, url: su, ok: false, errors: [] };
    sections.push(sec);
    const r = await getJson(fetchFn, su);
    if (r.json === undefined) {
      sec.errors.push({ url: su, path: '', message: `section ${JSON.stringify(id)} at ${su} ${r.problem}` });
    } else {
      for (const e of check(sectionSchema, r.json)) sec.errors.push({ url: su, ...e });
      const sid = r.json && typeof r.json === 'object' ? r.json.section_id : undefined;
      if (id && typeof sid === 'string' && sid !== id) sec.errors.push({ url: su, path: '/section_id', message: `section_id ${JSON.stringify(sid)} differs from its entry point id ${JSON.stringify(id)}` });
      if (Number.isInteger(ep.est_tokens)) {
        const est = estimateTokens(r.text), ratio = est / ep.est_tokens;
        if (ratio > 2 || ratio < 0.5) warnings.push({ url: mu, path: `/entry_points/${i}/est_tokens`, message: `entry_points.${i}.est_tokens is ${ep.est_tokens} but the section is about ${est} tokens` });
      }
    }
    sec.ok = sec.errors.length === 0;
    errors.push(...sec.errors);
  }
  report.ok = errors.length === 0;
  report.score = score(errors.length, warnings.length);
  return report;
}

export function formatReport(r) {
  const lines = r.errors.map((e) => `error ${e.url}${e.path ? '#' + e.path : ''}: ${e.message}`);
  for (const w of r.warnings) lines.push(`warning ${w.url}${w.path ? '#' + w.path : ''}: ${w.message}`);
  lines.push(`${r.ok ? 'valid' : 'invalid'} ${r.url} score ${r.score} (${r.errors.length} errors, ${r.warnings.length} warnings, ${r.sections.length} sections)`);
  return lines.join('\n');
}
