import { BetaAnalyticsDataClient } from '@google-analytics/data';

const METRICS = ['activeUsers', 'screenPageViews'];

export async function fetchPeriod(client, propertyId, startDate, endDate) {
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    metrics: METRICS.map((name) => ({ name })),
  });

  const values = response.rows?.[0]?.metricValues ?? [];
  return Object.fromEntries(METRICS.map((name, index) => [name, Number(values[index]?.value ?? 0)]));
}

export async function fetchComparison({ propertyId, googleCredentials, reportTimezone }) {
  const client = new BetaAnalyticsDataClient(
    googleCredentials ? { credentials: googleCredentials } : undefined,
  );
  try {
    const [current, previous] = await Promise.all([
      fetchPeriod(client, propertyId, '7daysAgo', 'yesterday'),
      fetchPeriod(client, propertyId, '14daysAgo', '8daysAgo'),
    ]);
    return { current, previous };
  } finally {
    await client.close();
  }
}
