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

/** Browser-only optional telemetry: never trust an absent or downgraded Origin.
 * Product clients run same-origin fetch. Do not accept arbitrary host-matched
 * http:// origins on an HTTPS deployment. */
export function analyticsTrustedOrigin(originHeader:string|null,requestUrl:string):boolean {
 if(!originHeader)return false;
 try {
  const origin=new URL(originHeader),request=new URL(requestUrl);
  if(originHeader!==origin.origin || origin.origin!==request.origin)return false;
  return origin.protocol==='https:' ||
   (origin.protocol==='http:' && ['localhost','127.0.0.1'].includes(origin.hostname));
 }catch{return false;}
}
