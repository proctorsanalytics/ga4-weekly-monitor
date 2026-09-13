import test from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../src/index.js';

const env = {
  GA4_PROPERTIES_JSON: JSON.stringify([
    { name: 'First site', domain: 'first.example', propertyId: 'properties/101' },
    { name: 'Second site', domain: 'second.example', propertyId: '202' },
  ]),
  AGENTMAIL_API_KEY: 'am_test',
  AGENTMAIL_INBOX_ID: 'alerts@example.com',
  EMAIL_TO: 'owner@example.com',
  CHANGE_THRESHOLD_PERCENT: '10',
};

function logger() {
  const messages = [];
  return { messages, log: (message) => messages.push(['log', message]), error: (message) => messages.push(['error', message]) };
}

test('processes more than one property and sends separate website alerts', async () => {
  const calls = [];
  const logs = logger();
  await main({
    env,
    logger: logs,
    fetchComparisonFn: async ({ propertyId }) => ({
      current: { activeUsers: Number(propertyId), screenPageViews: 0 },
      previous: { activeUsers: 1, screenPageViews: 0 },
    }),
    sendAlertFn: async (alert) => calls.push(alert),
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0].subject, /First site \(first\.example\)/);
  assert.match(calls[1].text, /Second site \(second\.example\)/);
  assert.deepEqual(logs.messages, [
    ['log', 'GA4 change alert sent for: First site'],
    ['log', 'GA4 change alert sent for: Second site'],
  ]);
});

test('continues after one property fails and rejects after all attempts', async () => {
  const attempted = [];
  const logs = logger();
  await assert.rejects(main({
    env,
    logger: logs,
    fetchComparisonFn: async ({ propertyId }) => {
      attempted.push(propertyId);
      if (propertyId === '101') throw new Error('private failure details');
      return {
        current: { activeUsers: 1, screenPageViews: 20 },
        previous: { activeUsers: 1, screenPageViews: 10 },
      };
    },
    sendAlertFn: async () => {},
  }), /One or more GA4 properties failed/);

  assert.deepEqual(attempted, ['101', '202']);
  assert.deepEqual(logs.messages, [
    ['error', 'GA4 monitoring failed for: First site'],
    ['log', 'GA4 change alert sent for: Second site'],
  ]);
});

test('logs no alert required for a property below the threshold', async () => {
  const logs = logger();
  await main({
    env: { ...env, GA4_PROPERTIES_JSON: JSON.stringify([{ name: 'Quiet site', domain: 'quiet.example', propertyId: '303' }]) },
    logger: logs,
    fetchComparisonFn: async () => ({
      current: { activeUsers: 110, screenPageViews: 100 },
      previous: { activeUsers: 100, screenPageViews: 100 },
    }),
    sendAlertFn: async () => { throw new Error('should not send'); },
  });

  assert.deepEqual(logs.messages, [['log', 'No alert required for: Quiet site']]);
});
