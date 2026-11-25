export function isRustPath(pathname: string, baseUrl = '/'): boolean {
  const base = `/${baseUrl.replace(/^\/+|\/+$/g, '')}`;
  const prefix = base === '/' ? '/' : `${base}/`;
  if (!pathname.startsWith(prefix)) return false;
  const route = pathname.slice(prefix.length);
  return route === 'rust' || route.startsWith('rust/');
}
