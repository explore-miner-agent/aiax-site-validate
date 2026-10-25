import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateSite } from '../src/index.js';
import { fixtureFetch } from '../src/fixtures.js';

const fx = (site) => fileURLToPath(new URL(`../fixtures/${site}`, import.meta.url));
const bin = fileURLToPath(new URL('../bin/aiax-validate.js', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
const site = (name) => validateSite(`https://${name}`, { fetch: fixtureFetch(fx(name)) });
const has = (r, path, re) => r.errors.some((e) => e.path === path && re.test(e.message));

test('A1 lax.kognai.ai and www.kognai.ai (snapshots of 2026-10-25) are valid with a score of 90 or more', async () => {
  for (const s of ['lax.kognai.ai', 'www.kognai.ai']) {
    const r = await site(s);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.ok(r.score >= 90);
    assert.equal(r.manifest_url, `https://${s}/.well-known/aiax.json`);
    assert.ok(r.sections.length >= 5 && r.sections.every((x) => x.ok));
    assert.equal(run(`https://${s}`, '--fixtures', fx(s)).status, 0);
  }
});

test('A1 a site with no problem scores 100; the fallback manifest path is used with a warning', async () => {
  const g = await site('good.example');
  assert.deepEqual([g.ok, g.score, g.errors.length, g.warnings.length], [true, 100, 0, 0]);
  const f = await site('fallback.example');
  assert.equal(f.manifest_url, 'https://fallback.example/aiax/manifest.json');
  assert.equal(f.ok, true);
  assert.equal(f.warnings.length, 1);
  assert.ok(f.score >= 90 && f.score < 100);
});

test('A2 a broken manifest gives one clear message per problem, naming its field', async () => {
  const r = await site('broken-manifest.example');
  assert.equal(r.ok, false);
  assert.ok(has(r, '/updated_at', /updated_at is required but missing/));
  assert.ok(has(r, '/mcp_endpoint', /mcp_endpoint must be a string or null, got an integer/));
  assert.ok(has(r, '/colour', /colour is not an allowed field/));
  assert.ok(has(r, '/entry_points/0/id', /entry_points\.0\.id "Bad Id!" does not match/));
  const manifestErrors = r.errors.filter((e) => e.url === r.manifest_url);
  assert.equal(manifestErrors.length, 4);
  assert.ok(r.score < 100);
});

test('A2 a missing or unparsable manifest is an error', async () => {
  const e = await site('empty.example');
  assert.equal(e.ok, false);
  assert.match(e.errors[0].message, /no AIAX manifest found/);
  const b = await site('badjson.example');
  assert.match(b.errors[0].message, /not valid JSON/);
});

test('A2 the fetch passed in is used, and a network failure is reported, not thrown', async () => {
  const seen = [];
  const r = await validateSite('https://down.example', { fetch: async (u) => { seen.push(u); throw new Error('connection refused'); } });
  assert.deepEqual(seen, ['https://down.example/.well-known/aiax.json', 'https://down.example/aiax/manifest.json']);
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /connection refused/);
});

test('A3 broken sections fail with clear messages', async () => {
  const r = await site('broken-section.example');
  assert.equal(r.ok, false);
  const by = Object.fromEntries(r.sections.map((s) => [s.id, s]));
  assert.ok(by.nofield.errors.some((e) => e.path === '/examples' && /examples is required/.test(e.message)));
  const bp = by.badprice.errors.map((e) => e.path);
  assert.ok(bp.includes('/pricing/rail') && bp.includes('/pricing/model') && bp.includes('/pricing/amount'));
  assert.ok(by.mismatch.errors.some((e) => /section_id "something_else" differs from its entry point id "mismatch"/.test(e.message)));
  assert.match(by.missing.errors[0].message, /HTTP 404/);
  assert.match(by.notjson.errors[0].message, /not valid JSON/);
  assert.ok(r.sections.every((s) => s.ok === false));
  assert.equal(r.errors.length, r.sections.reduce((n, s) => n + s.errors.length, 0));
});

test('A3 entry point urls are resolved against the manifest URL', async () => {
  const r = await site('lax.kognai.ai');
  assert.ok(r.sections.every((s) => s.url.startsWith('https://lax.kognai.ai/aiax/sections/')));
});

test('A4 --json prints the report; exit codes are 0 valid, 1 invalid, 2 usage', () => {
  const ok = run('https://good.example', '--json', '--fixtures', fx('good.example'));
  assert.equal(ok.status, 0);
  const rep = JSON.parse(ok.stdout);
  for (const k of ['url', 'manifest_url', 'ok', 'score', 'errors', 'warnings', 'sections']) assert.ok(k in rep, k);
  const bad = run('https://broken-section.example', '--fixtures', fx('broken-section.example'));
  assert.equal(bad.status, 1);
  assert.ok(bad.stdout.trim().split('\n').filter((l) => l.startsWith('error ')).length === 7);
  assert.equal(run().status, 2);
  assert.equal(run('https://a.example', '--bogus').status, 2);
  assert.equal(run('https://a.example', '--fixtures').status, 2);
});

test('A5 the broken fixtures are in the repository', () => {
  for (const s of ['broken-manifest.example', 'broken-section.example', 'empty.example', 'badjson.example']) {
    assert.ok(run(`https://${s}`, '--fixtures', fx(s)).status === 1, s);
  }
});

test.todo('A5 published to npm as aiax-site-validate with the aiax-validate bin (M2)');
