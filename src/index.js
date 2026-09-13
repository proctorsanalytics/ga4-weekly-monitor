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

export async function main({
  env = process.env,
  fetchComparisonFn = fetchComparison,
  sendAlertFn = sendAlert,
  logger = console,
} = {}) {
  const config = loadConfig(env);
  const failures = [];

  for (const property of config.properties) {
    try {
      const { current, previous } = await fetchComparisonFn({
        propertyId: property.propertyId,
        googleCredentials: config.googleCredentials,
      });
      const changes = Object.fromEntries(['activeUsers', 'screenPageViews'].map((metric) => [metric, {
        current: current[metric], previous: previous[metric],
        percentage: percentageChange(current[metric], previous[metric]),
      }]));

      if (!shouldAlert(changes, config.thresholdPercent)) {
        logger.log(`No alert required for: ${property.name}`);
        continue;
      }

      const lines = Object.entries(changes).map(([metric, change]) =>
        `${metric}: ${change.current} vs ${change.previous} (${format(change.percentage)}%)`);
      const text = [`GA4 change alert for: ${property.name} (${property.domain})`, `Property ID: ${property.propertyId}`, '', ...lines,
        '', `Alert threshold: ${config.thresholdPercent}%`].join('\n');
      const html = `<h1>GA4 change alert</h1><p>Website: ${escapeHtml(property.name)}</p><p>Domain: ${escapeHtml(property.domain)}</p><p>Property: ${escapeHtml(property.propertyId)}</p><ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul><p>Alert threshold: ${config.thresholdPercent}%</p>`;
      await sendAlertFn({
        apiKey: config.agentMailApiKey,
        inboxId: config.agentMailInboxId,
        to: config.emailTo,
        subject: `GA4 change alert: ${property.name} (${property.domain})`,
        text,
        html,
      });
      logger.log(`GA4 change alert sent for: ${property.name}`);
    } catch {
      failures.push(property.name);
      logger.error(`GA4 monitoring failed for: ${property.name}`);
    }
  }

  if (failures.length > 0) {
    throw new Error('One or more GA4 properties failed');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('GA4 monitoring failed.');
    process.exitCode = 1;
  });
}
