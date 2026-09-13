import 'dotenv/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import pg from 'pg';
import { loadConfig } from './config.js';
import { ensureSchema, getLatestSnapshot } from './snapshot.js';

const { Pool } = pg;

export function credentialsMatch(username, password, expectedUsername, expectedPassword) {
  const digest = (value) => createHash('sha256').update(String(value)).digest();
  return timingSafeEqual(digest(username), digest(expectedUsername))
    && timingSafeEqual(digest(password), digest(expectedPassword));
}

function basicCredentials(request) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

function securityHeaders() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}

export function renderDashboard(rows) {
  if (!rows.length) {
    return page('GA4 dashboard', '<main><h1>GA4 monitoring dashboard</h1><section class="empty"><h2>No snapshot yet</h2><p>The dashboard will show data after the first complete monitoring run succeeds.</p></section></main>');
  }

  const snapshotAt = new Date(rows[0].snapshotAt).toISOString();
  const cards = rows.map((row) => {
    const metric = (label, previous, current, change) => {
      const difference = current - previous;
      const direction = difference > 0 ? 'increase' : difference < 0 ? 'decrease' : 'no-change';
      const percentage = Number.isFinite(change) ? `${change.toFixed(2)}%` : 'New activity from zero';
      return `<div class="metric"><h3>${escapeHtml(label)}</h3><div class="values"><span>${formatNumber(previous)}</span><span aria-hidden="true">→</span><span>${formatNumber(current)}</span></div><p class="${direction}">${formatSigned(difference)} (${escapeHtml(percentage)}) — ${direction.replace('-', ' ')}</p></div>`;
    };
    return `<article class="site"><h2>${escapeHtml(row.name)}</h2><p class="domain">${escapeHtml(row.domain)}</p><p class="range">Previous: ${escapeHtml(row.previousStartDate)} – ${escapeHtml(row.previousEndDate)}<br>Latest: ${escapeHtml(row.currentStartDate)} – ${escapeHtml(row.currentEndDate)}</p><div class="metrics">${metric('Active users', row.previousActiveUsers, row.currentActiveUsers, row.activeUsersChange)}${metric('Page views', row.previousScreenPageViews, row.currentScreenPageViews, row.screenPageViewsChange)}</div></article>`;
  }).join('');

  return page('GA4 monitoring dashboard', `<main><h1>GA4 monitoring dashboard</h1><p class="updated">Stored snapshot updated: <time datetime="${escapeHtml(snapshotAt)}">${escapeHtml(snapshotAt)}</time></p><section class="sites">${cards}</section></main>`);
}

function page(title, content) {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${styles}</style></head><body>${content}</body></html>`;
}

const formatNumber = (value) => Number(value).toLocaleString('en-GB');
const formatSigned = (value) => value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

const styles = `:root{color-scheme:light;font-family:system-ui,sans-serif;color:#17202a;background:#f5f7fa}body{margin:0}main{max-width:1100px;margin:auto;padding:clamp(1rem,4vw,3rem)}h1{margin-top:0}.updated,.domain,.range{color:#52606d}.sites{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem}.site,.empty{background:white;border:1px solid #d9e2ec;border-radius:10px;padding:1.25rem;box-shadow:0 2px 8px #102a430d}.site h2{margin:.1rem 0;font-size:1.25rem}.domain{margin:.25rem 0 1rem}.range{font-size:.9rem;line-height:1.6}.metrics{display:grid;gap:1rem;margin-top:1.25rem}.metric{border-top:1px solid #e4e7eb;padding-top:.8rem}.metric h3{font-size:1rem;margin:0 0 .45rem}.values{display:flex;justify-content:space-between;gap:.5rem;font-size:1.25rem;font-weight:700}.values span:nth-child(2){color:#9fb3c8}.metric p{margin:.45rem 0 0;font-size:.9rem}.increase{color:#18794e}.decrease{color:#c0392b}.no-change{color:#52606d}.empty{text-align:center;padding:3rem 1rem}`;

export function createDashboardHandler({ config, pool, getSnapshot = getLatestSnapshot, logger = console } = {}) {
  return async (request, response) => {
    const headers = securityHeaders();
    if (request.url === '/health') {
      response.writeHead(200, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('ok');
      return;
    }
    if (request.url !== '/' || request.method !== 'GET') {
      response.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    const credentials = basicCredentials(request);
    if (!credentials || !credentialsMatch(credentials.username, credentials.password, config.dashboardUsername, config.dashboardPassword)) {
      response.writeHead(401, { ...headers, 'WWW-Authenticate': 'Basic realm="GA4 dashboard"' });
      response.end('Authentication required');
      return;
    }

    try {
      const rows = await getSnapshot(pool);
      response.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
      response.end(renderDashboard(rows));
    } catch {
      logger.error('GA4 dashboard request failed.');
      response.writeHead(500, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Dashboard unavailable');
    }
  };
}

export function createDashboardServer(options = {}) {
  return createServer(createDashboardHandler(options));
}

export async function startDashboard({ env = process.env, pool, logger = console } = {}) {
  const config = loadConfig(env, { requireAgentMail: false, requireDashboardAuth: true });
  const dashboardPool = pool ?? new Pool({ connectionString: config.databaseUrl });
  await ensureSchema(dashboardPool);
  const server = createDashboardServer({ config, pool: dashboardPool, logger });
  const port = Number(env.PORT || 3000);
  await new Promise((resolve) => server.listen(port, '0.0.0.0', resolve));
  return { server, pool: dashboardPool };
}

if (process.argv[1]?.endsWith('/dashboard.js')) {
  startDashboard().catch(() => {
    console.error('GA4 dashboard failed to start.');
    process.exitCode = 1;
  });
}
