import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { fetchComparison } from './ga4.js';
import { percentageChange, shouldAlert } from './metrics.js';
import { sendAlert } from './email.js';

const format = (value) => Number.isFinite(value) ? value.toFixed(2) : 'new activity from zero';
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

export async function main() {
  const config = loadConfig();
  const { current, previous } = await fetchComparison(config);
  const changes = Object.fromEntries(['activeUsers', 'screenPageViews'].map((metric) => [metric, {
    current: current[metric], previous: previous[metric],
    percentage: percentageChange(current[metric], previous[metric]),
  }]));

  if (!shouldAlert(changes, config.thresholdPercent)) {
    console.log('No GA4 change exceeded the configured threshold.');
    return;
  }

  const lines = Object.entries(changes).map(([metric, change]) =>
    `${metric}: ${change.current} vs ${change.previous} (${format(change.percentage)}%)`);
  const text = [`GA4 change alert for property ${config.propertyId}`, '', ...lines,
    '', `Alert threshold: ${config.thresholdPercent}%`].join('\n');
  const html = `<h1>GA4 change alert</h1><p>Property: ${escapeHtml(config.propertyId)}</p><ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul><p>Alert threshold: ${config.thresholdPercent}%</p>`;
  await sendAlert({
    apiKey: config.agentMailApiKey,
    inboxId: config.agentMailInboxId,
    to: config.emailTo,
    subject: `GA4 change alert: ${config.propertyId}`,
    text,
    html,
  });
  console.log('GA4 change alert sent.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`GA4 monitoring failed: ${error.message}`);
    process.exitCode = 1;
  });
}
