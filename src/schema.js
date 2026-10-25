// A small JSON Schema (2020-12) checker covering exactly the keywords the AIAX 0.1 schemas use:
// type, enum, required, properties, additionalProperties, pattern, maxLength, minimum, maximum,
// minItems, maxItems, items, oneOf and format (uri, uri-reference, date-time).
// Every problem is reported as {path, message}, path being a JSON pointer.

const ptr = (path) => (path.length ? '/' + path.map((p) => String(p).replace(/~/g, '~0').replace(/\//g, '~1')).join('/') : '');
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const fits = (v, t) => t === typeOf(v) || (t === 'number' && typeof v === 'number' && Number.isFinite(v));
const fieldName = (path) => (path.length ? path.join('.') : 'document');
const article = (t) => (t === 'null' ? 'null' : (/^[aeiou]/.test(t) ? 'an ' : 'a ') + t);

function checkFormat(v, format) {
  if (format === 'uri') { try { const u = new URL(v); return /^[a-z][a-z0-9+.-]*:$/i.test(u.protocol); } catch { return false; } }
  if (format === 'uri-reference') { if (/\s/.test(v)) return false; try { new URL(v, 'https://example.invalid/'); return true; } catch { return false; } }
  if (format === 'date-time') return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i.test(v) && !Number.isNaN(Date.parse(v));
  return true;
}
const FORMAT_WORDS = { uri: 'an absolute URL', 'uri-reference': 'a URL or a relative path', 'date-time': 'an ISO 8601 date and time such as 2026-10-15T17:59:58Z' };

export function check(schema, value, path = []) {
  const errs = [];
  const add = (message, p = path) => errs.push({ path: ptr(p), message });
  const name = fieldName(path);
  if (schema.oneOf) {
    const ok = schema.oneOf.filter((s) => check(s, value, path).length === 0);
    if (ok.length !== 1) {
      const kinds = schema.oneOf.map((s) => s.type).filter(Boolean).join(' or ');
      add(`${name} must be ${kinds ? 'one of: ' + kinds : 'exactly one of the allowed shapes'}${kinds && schema.oneOf.some((s) => s.maxLength) ? ' (text at most ' + Math.max(...schema.oneOf.map((s) => s.maxLength || 0)) + ' characters)' : ''}, got ${article(typeOf(value))}`);
    }
    return errs;
  }
  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.some((t) => fits(value, t))) { add(`${name} must be ${types.map(article).join(' or ')}, got ${article(typeOf(value))}`); return errs; }
  }
  if (schema.enum && !schema.enum.some((e) => e === value)) add(`${name} must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}, got ${JSON.stringify(value)}`);
  if (typeof value === 'string') {
    if (schema.maxLength != null && [...value].length > schema.maxLength) add(`${name} is ${[...value].length} characters long, at most ${schema.maxLength} are allowed`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) add(`${name} ${JSON.stringify(value)} does not match the pattern ${schema.pattern}`);
    if (schema.format && !checkFormat(value, schema.format)) add(`${name} must be ${FORMAT_WORDS[schema.format] || schema.format}, got ${JSON.stringify(value)}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) add(`${name} is ${value}, it must be at least ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) add(`${name} is ${value}, it must be at most ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) add(`${name} has ${value.length} items, at least ${schema.minItems} required`);
    if (schema.maxItems != null && value.length > schema.maxItems) add(`${name} has ${value.length} items, at most ${schema.maxItems} allowed`);
    if (schema.items) value.forEach((v, i) => errs.push(...check(schema.items, v, [...path, i])));
  }
  if (typeOf(value) === 'object') {
    for (const r of schema.required || []) if (!(r in value)) add(`${fieldName([...path, r])} is required but missing`, [...path, r]);
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (k in props) errs.push(...check(props[k], v, [...path, k]));
      else if (schema.additionalProperties === false) add(`${fieldName([...path, k])} is not an allowed field here`, [...path, k]);
    }
  }
  return errs;
}
