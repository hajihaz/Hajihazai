/** Only record coarse non-personal product routes, never resource identifiers. */
export function analyticsProductPath(raw: string): string | null {
 if (typeof raw !== 'string' || !raw.startsWith('/') || raw.includes('?') || raw.includes('#')) return null;
 const path=raw.replace(/\/$/,'')||'/';
 if (['/','/projects','/tools','/knowledge','/privacy','/offline','/projects/:id'].includes(path)) return path;
 if (/^\/projects\/[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(path)) return '/projects/:id';
 return null;
}
export function analyticsProductAction(raw: string): string {
 return ['nav','button','external-link','project-link','tool-link'].includes(raw)?raw:'button';
}
