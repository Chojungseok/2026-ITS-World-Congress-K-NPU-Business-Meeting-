import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
const url = 'http://127.0.0.1:' + port;
const projectId = createHash('sha256').update(root).digest('hex').slice(0, 16);
const shouldOpen = process.argv.includes('--open');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function openBrowser() {
  const [command, args] = process.platform === 'win32'
    ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const browser = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  browser.on('error', () => console.log('브라우저에서 직접 열어 주세요: ' + url));
  browser.unref();
}
const server = http.createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    const pathname = decodeURIComponent(new URL(req.url, url).pathname);
    if (!(pathname === '/' || pathname === '/index.html' || pathname.startsWith('/assets/'))) { res.writeHead(404); return res.end('Not found'); }
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!(file === resolve(root, 'index.html') || file.startsWith(resolve(root, 'assets') + sep)) || !(await stat(file)).isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'X-KNPU-Preview': projectId
    });
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.on('error', async error => {
  if (error.code === 'EADDRINUSE') {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (response.headers.get('X-KNPU-Preview') === projectId) {
        console.log('이미 실행 중인 로컬 화면을 사용합니다: ' + url);
        if (shouldOpen) openBrowser();
        return;
      }
    } catch {}
    console.error('포트 ' + port + '을 다른 프로그램이 사용 중입니다. 기존 서버를 종료하거나 PORT 환경변수를 변경해 주세요.');
  } else console.error('서버를 시작하지 못했습니다: ' + error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log('K-NPU Connect: ' + url);
  console.log('이 창을 열어 두세요. 종료: Ctrl+C');
  if (shouldOpen) openBrowser();
});
