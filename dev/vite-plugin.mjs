import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createMockMiddleware } from './mock-server.mjs';

const shell = fileURLToPath(new URL('../app/index.html', import.meta.url));

export function mockAppPlugin() {
  return {
    name: 'volkino-local-mocks',
    apply: 'serve',
    transformIndexHtml() {
      return [{ tag: 'script', attrs: { type: 'module', src: '/dev/browser.ts' }, injectTo: 'head' }];
    },
    configureServer(server) {
      server.middlewares.use(createMockMiddleware());
      server.middlewares.use(async (req, res, next) => {
        const path = new URL(req.url, 'http://localhost').pathname;
        if (path === '/icon.png' || path === '/wolf.png') { req.url = '/app' + req.url; return next(); }
        if (path !== '/' && path !== '/index.html') return next();
        try {
          const source = (await readFile(shell, 'utf8'))
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
            .replace(/<link\b[^>]*href="\/catalog\.css[^>]*>/g, '')
            .replace('<title>VolKino</title>', '<title>VolKino · локальные моки</title>');
          const html = await server.transformIndexHtml(req.url, source);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(html);
        } catch (error) { next(error); }
      });
      server.config.logger.info('Локальные моки включены. Сценарии: ?mock=empty, ?mock=error, ?mock=slow');
    },
  };
}
