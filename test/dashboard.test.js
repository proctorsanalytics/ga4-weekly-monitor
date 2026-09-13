import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { buildSnapshotRows, saveSnapshot } from '../src/snapshot.js';
import { createDashboardHandler, credentialsMatch, renderDashboard } from '../src/dashboard.js';

const property = { name: 'Test site', domain: 'test.example', propertyId: '123' };
const result = {
  propertyId: '123',
  previous: { activeUsers: 100, screenPageViews: 200 },
  current: { activeUsers: 120, screenPageViews: 180 },
  changes: { activeUsers: { percentage: 20 }, screenPageViews: { percentage: -10 } },
  shouldAlert: true,
};

test('requires dashboard credentials when dashboard configuration is loaded', () => {
  const env = { GA4_PROPERTIES_JSON: JSON.stringify([property]), DATABASE_URL: 'postgres://localhost/ga4' };
  assert.throws(() => loadConfig(env, { requireAgentMail: false, requireDashboardAuth: true }), /DASHBOARD_USERNAME/);
  assert.throws(() => loadConfig({ ...env, DASHBOARD_USERNAME: 'user' }, { requireAgentMail: false, requireDashboardAuth: true }), /DASHBOARD_PASSWORD/);
});

test('replaces snapshots transactionally and rolls back failed replacements', async () => {
  const calls = [];
  const client = {
    query: async (sql) => {
      calls.push(sql.trim().split(/\s+/).slice(0, 2).join(' '));
      if (sql.includes('INSERT')) throw new Error('insert failed');
    },
    release: () => calls.push('RELEASE'),
  };
  const pool = { connect: async () => client };
  const rows = buildSnapshotRows([property], [result], 10, new Date('2026-09-13T10:00:00Z'));
  await assert.rejects(saveSnapshot(pool, rows), /insert failed/);
  assert.deepEqual(calls, ['BEGIN', 'CREATE TABLE', 'DELETE FROM', 'INSERT INTO', 'ROLLBACK', 'RELEASE']);
});

test('commits a complete snapshot replacement only after all rows are inserted', async () => {
  const calls = [];
  const client = {
    query: async (sql) => calls.push(sql.trim().split(/\s+/).slice(0, 2).join(' ')),
    release: () => calls.push('RELEASE'),
  };
  await saveSnapshot({ connect: async () => client }, buildSnapshotRows([property], [result], 10));
  assert.deepEqual(calls, ['BEGIN', 'CREATE TABLE', 'DELETE FROM', 'INSERT INTO', 'COMMIT', 'RELEASE']);
});

test('renders an empty dashboard state and a complete escaped dashboard', () => {
  assert.match(renderDashboard([]), /No snapshot yet/);
  const html = renderDashboard([{
    ...buildSnapshotRows([property], [result], 10, new Date('2026-09-13T10:00:00Z'))[0],
    name: '<Test site>',
    domain: 'test.example?a=1&b=2',
  }]);
  assert.match(html, /Active users/);
  assert.match(html, /Page views/);
  assert.match(html, /\+20/);
  assert.match(html, /-20/);
  assert.match(html, /&lt;Test site&gt;/);
  assert.match(html, /test\.example\?a=1&amp;b=2/);
  assert.doesNotMatch(html, /<Test site>/);
});

test('uses timing-safe authentication and protects the dashboard but not health', async () => {
  assert.equal(credentialsMatch('user', 'pass', 'user', 'pass'), true);
  assert.equal(credentialsMatch('user', 'wrong', 'user', 'pass'), false);

  const handler = createDashboardHandler({
    config: { dashboardUsername: 'user', dashboardPassword: 'pass' },
    pool: {},
    getSnapshot: async () => [],
  });
  const requestFor = (path, auth) => ({ url: path, method: 'GET', headers: auth ? { authorization: `Basic ${Buffer.from(auth).toString('base64')}` } : {} });
  const responseFor = () => ({ statusCode: null, headers: null, body: '', writeHead(statusCode, headers) { this.statusCode = statusCode; this.headers = headers; }, end(body = '') { this.body = body; } });

  const healthResponse = responseFor();
  await handler(requestFor('/health'), healthResponse);
  const health = healthResponse;
  assert.equal(health.statusCode, 200);
  assert.equal(health.body, 'ok');
  const unauthorizedResponse = responseFor();
  await handler(requestFor('/'), unauthorizedResponse);
  const unauthorized = unauthorizedResponse;
  assert.equal(unauthorized.statusCode, 401);
  const dashboardResponse = responseFor();
  await handler(requestFor('/', 'user:pass'), dashboardResponse);
  const dashboard = dashboardResponse;
  assert.equal(dashboard.statusCode, 200);
  assert.match(dashboard.body, /No snapshot yet/);
  assert.equal(dashboard.headers['Cache-Control'], 'no-store, no-cache, must-revalidate');
});
