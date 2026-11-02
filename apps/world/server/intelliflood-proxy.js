/**
 * Relais vers l'API IntelliFlood : le navigateur appelle `/intelliflood-api/...` (même origine, donc compatible
 * avec la politique CSP de l'application) et le serveur transmet à INTELLIFLOOD_API (défaut http://127.0.0.1:8000).
 */
export function intelliFloodProxyPlugin() {
  const maxRequestBytes = 6_000_000;
  const handler = async (req, res, next) => {
    const prefix = '/intelliflood-api/';
    if (!req.url?.startsWith(prefix)) return next();
    const target = (process.env.INTELLIFLOOD_API || 'http://127.0.0.1:8000').replace(/\/$/, '');
    try {
      const chunks = [];
      if (!['GET', 'HEAD'].includes(req.method)) {
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > maxRequestBytes) {
            res.statusCode = 413;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: { code: 'REQUEST_TOO_LARGE', message: 'Requête trop volumineuse.' } }));
            return;
          }
          chunks.push(chunk);
        }
      }
      const headers = {};
      for (const h of ['authorization', 'content-type', 'x-api-key']) if (req.headers[h]) headers[h] = req.headers[h];
      const r = await fetch(target + '/' + req.url.slice(prefix.length), {
        method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined, signal: AbortSignal.timeout(60_000),
      });
      res.statusCode = r.status;
      res.setHeader('content-type', r.headers.get('content-type') || 'application/json');
      res.setHeader('cache-control', 'no-store');
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (error) {
      res.statusCode = 502;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: { code: 'INTELLIFLOOD_API_UNREACHABLE', message: String(error?.message || error) } }));
    }
  };
  return {
    name: 'intelliflood-proxy',
    configureServer(server) { server.middlewares.use(handler); },  // ne rien retourner : Vite traiterait la valeur comme un hook
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}
