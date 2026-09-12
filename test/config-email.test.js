import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { sendAlert } from '../src/email.js';

const baseEnv = {
  GA4_PROPERTY_ID: 'properties/123',
  AGENTMAIL_API_KEY: 'am_test',
  AGENTMAIL_INBOX_ID: 'alerts@example.com',
  EMAIL_TO: 'one@example.com, two@example.com ',
};

test('loads AgentMail settings without legacy email settings', () => {
  assert.deepEqual(loadConfig(baseEnv), {
    propertyId: '123',
    thresholdPercent: 10,
    agentMailApiKey: 'am_test',
    agentMailInboxId: 'alerts@example.com',
    emailTo: 'one@example.com, two@example.com',
    googleCredentials: undefined,
  });
});

test('requires the AgentMail API key and inbox', () => {
  assert.throws(() => loadConfig({ ...baseEnv, AGENTMAIL_API_KEY: '' }), /AGENTMAIL_API_KEY/);
  assert.throws(() => loadConfig({ ...baseEnv, AGENTMAIL_INBOX_ID: '' }), /AGENTMAIL_INBOX_ID/);
});

test('sends through the AgentMail inbox messages API', async () => {
  const calls = [];
  const client = {
    inboxes: {
      messages: {
        send: async (...args) => {
          calls.push(args);
          return { messageId: 'message-1' };
        },
      },
    },
  };

  const result = await sendAlert({
    apiKey: 'am_test',
    inboxId: 'alerts@example.com',
    to: 'one@example.com, two@example.com',
    subject: 'Subject',
    text: 'Text',
    html: '<p>HTML</p>',
    client,
  });

  assert.deepEqual(result, { messageId: 'message-1' });
  assert.deepEqual(calls, [[
    'alerts@example.com',
    { to: ['one@example.com', 'two@example.com'], subject: 'Subject', text: 'Text', html: '<p>HTML</p>' },
  ]]);
});

test('propagates AgentMail failures', async () => {
  const failure = new Error('delivery rejected');
  const client = { inboxes: { messages: { send: async () => { throw failure; } } } };
  await assert.rejects(
    sendAlert({ apiKey: 'am_test', inboxId: 'alerts@example.com', to: 'one@example.com', subject: 'Subject', text: 'Text', html: '', client }),
    failure,
  );
});
