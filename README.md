# GA4 Change Monitor

A Node.js 20+ ES-module job that compares GA4 `activeUsers` and `screenPageViews` for the last seven completed days (`7daysAgo`–`yesterday`) with the preceding seven days (`14daysAgo`–`8daysAgo`). It sends an AgentMail email when either metric changes by more than the configured percentage threshold.

## Setup

1. Create a Google service account (or configure Google Application Default Credentials), enable the Google Analytics Data API, and add the service account as a Viewer to the GA4 property.
2. Create an AgentMail API key and inbox.
3. Copy `.env.example` to `.env` and set the values.
4. Run `npm ci` and then `npm start` for the one-shot cron service.

`GA4_PROPERTIES_JSON`, `AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX_ID`, `EMAIL_TO`, and `DATABASE_URL` are required. `GA4_PROPERTIES_JSON` must be a non-empty JSON array; each object must contain `name`, `domain`, and `propertyId`. Property IDs may be supplied as either `123456789` or `properties/123456789` and are normalized to numeric IDs. Duplicate property IDs are rejected. `CHANGE_THRESHOLD_PERCENT` defaults to `10`; the comparison is strictly greater than the threshold. `EMAIL_TO` accepts comma-separated recipients. GA4 relative dates use each property’s configured reporting timezone.

The job checks every configured website and sends a separate AgentMail alert for each website whose `activeUsers` or `screenPageViews` change exceeds the threshold. If one website fails, the remaining websites are still checked and the job exits non-zero after all attempts. A complete successful run replaces the PostgreSQL dashboard snapshot atomically; failed runs leave the previous snapshot intact.

## Dashboard service

Run `npm run start:dashboard` as a separate always-on Railway service. It uses `DATABASE_URL`, listens on Railway’s `PORT` (or port `3000` locally), and requires `DASHBOARD_USERNAME` and `DASHBOARD_PASSWORD`. The unauthenticated `/health` endpoint returns only `ok`; the dashboard at `/` uses HTTP Basic Authentication.

For service-account authentication, set both `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY`. Otherwise, the Google client uses Application Default Credentials. Keep credentials out of source control.

`npm start` remains a one-shot job intended for cron, a scheduler, or a container job. It exits non-zero if configuration, GA4 retrieval, snapshot storage, or AgentMail delivery fails.

## Tests

```sh
npm test
```
