import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist-web');
const port = Number(process.argv[3] ?? 8082);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
};

function previewIndex() {
  const expected = join(root, 'index.html');
  if (existsSync(expected)) return expected;
  // iCloud can preserve a conflicting export as "index 2.html" or
  // "index 3.html". Use the newest complete HTML export instead of returning
  // a blank 500 preview.
  const candidates = readdirSync(root)
    .filter((name) => /^index(?: \d+)?\.html$/.test(name))
    .map((name) => join(root, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  return candidates[0] ?? expected;
}

createServer((request, response) => {
  const requestPath = decodeURIComponent((request.url ?? '/').split('?')[0]);
  const safePath = normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, '');
  let filePath = join(root, safePath);
  if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) filePath = previewIndex();
  response.setHeader('Content-Type', mimeTypes[extname(filePath)] ?? 'application/octet-stream');
  createReadStream(filePath).on('error', () => {
    response.statusCode = 500;
    response.end('Unable to load preview.');
  }).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`GWMB preview running at http://localhost:${port}`);
});
