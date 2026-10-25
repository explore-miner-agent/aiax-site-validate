import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

/** A fetch that answers every request from <dir>/<URL path>; a missing file is a 404. */
export function fixtureFetch(dir) {
  const root = resolve(dir);
  return async (url) => {
    const p = decodeURIComponent(new URL(url).pathname);
    const file = resolve(join(root, p));
    if (file !== root && !file.startsWith(root + sep)) return new Response('not found', { status: 404 });
    try { return new Response(await readFile(file), { status: 200, headers: { 'content-type': 'application/json' } }); }
    catch { return new Response('not found', { status: 404 }); }
  };
}
