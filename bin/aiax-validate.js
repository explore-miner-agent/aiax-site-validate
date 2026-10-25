#!/usr/bin/env node
import { validateSite, formatReport } from '../src/index.js';
import { fixtureFetch } from '../src/fixtures.js';

const USAGE = 'usage: aiax-validate <url> [--json] [--fixtures <dir>]';
export async function main(argv, out = process.stdout, err = process.stderr) {
  let url = null, json = false, fixtures = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '--fixtures') { fixtures = argv[++i]; if (!fixtures) { err.write(USAGE + '\n'); return 2; } }
    else if (a === '-h' || a === '--help') { out.write(USAGE + '\n'); return 0; }
    else if (a.startsWith('-') || url) { err.write(USAGE + '\n'); return 2; }
    else url = a;
  }
  if (!url) { err.write(USAGE + '\n'); return 2; }
  let report;
  try { report = await validateSite(url, fixtures ? { fetch: fixtureFetch(fixtures) } : {}); }
  catch (e) { err.write(`${e.message}\n${USAGE}\n`); return 2; }
  out.write((json ? JSON.stringify(report, null, 2) : formatReport(report)) + '\n');
  return report.ok ? 0 : 1;
}
main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
