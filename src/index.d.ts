export interface Problem { url: string; path: string; message: string }
export interface SectionReport { id: string | null; url: string; ok: boolean; errors: Problem[] }
export interface Report { url: string; manifest_url: string | null; ok: boolean; score: number; errors: Problem[]; warnings: Problem[]; sections: SectionReport[] }
export function validateSite(url: string, opts?: { fetch?: typeof fetch }): Promise<Report>;
export function formatReport(r: Report): string;
export function score(errors: number, warnings: number): number;
export function check(schema: object, value: unknown, path?: (string | number)[]): { path: string; message: string }[];
export const MANIFEST_PATHS: string[];
