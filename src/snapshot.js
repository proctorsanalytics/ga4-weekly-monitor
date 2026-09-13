const SNAPSHOT_TABLE = 'ga4_dashboard_snapshot';

export const PERIODS = {
  previous: { startDate: '14daysAgo', endDate: '8daysAgo' },
  current: { startDate: '7daysAgo', endDate: 'yesterday' },
};

export function buildSnapshotRows(properties, results, thresholdPercent, snapshotAt = new Date()) {
  return properties.map((property) => {
    const result = results.find(({ propertyId }) => propertyId === property.propertyId);
    return {
      ...property,
      previousStartDate: PERIODS.previous.startDate,
      previousEndDate: PERIODS.previous.endDate,
      previousActiveUsers: result.previous.activeUsers,
      previousScreenPageViews: result.previous.screenPageViews,
      currentStartDate: PERIODS.current.startDate,
      currentEndDate: PERIODS.current.endDate,
      currentActiveUsers: result.current.activeUsers,
      currentScreenPageViews: result.current.screenPageViews,
      activeUsersChange: result.changes.activeUsers.percentage,
      screenPageViewsChange: result.changes.screenPageViews.percentage,
      thresholdExceeded: result.shouldAlert,
      snapshotAt,
    };
  });
}

export async function ensureSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SNAPSHOT_TABLE} (
      snapshot_id TEXT NOT NULL,
      snapshot_at TIMESTAMPTZ NOT NULL,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      property_id TEXT NOT NULL,
      previous_start_date TEXT NOT NULL,
      previous_end_date TEXT NOT NULL,
      previous_active_users DOUBLE PRECISION NOT NULL,
      previous_screen_page_views DOUBLE PRECISION NOT NULL,
      current_start_date TEXT NOT NULL,
      current_end_date TEXT NOT NULL,
      current_active_users DOUBLE PRECISION NOT NULL,
      current_screen_page_views DOUBLE PRECISION NOT NULL,
      active_users_change DOUBLE PRECISION NOT NULL,
      screen_page_views_change DOUBLE PRECISION NOT NULL,
      threshold_exceeded BOOLEAN NOT NULL
    )
  `);
}

export async function saveSnapshot(pool, rows) {
  const client = await pool.connect();
  const snapshotId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    await client.query('BEGIN');
    await ensureSchema(client);
    await client.query(`DELETE FROM ${SNAPSHOT_TABLE}`);
    for (const row of rows) {
      await client.query(`
        INSERT INTO ${SNAPSHOT_TABLE} (
          snapshot_id, snapshot_at, name, domain, property_id,
          previous_start_date, previous_end_date, previous_active_users, previous_screen_page_views,
          current_start_date, current_end_date, current_active_users, current_screen_page_views,
          active_users_change, screen_page_views_change, threshold_exceeded
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `, [snapshotId, row.snapshotAt, row.name, row.domain, row.propertyId,
        row.previousStartDate, row.previousEndDate, row.previousActiveUsers, row.previousScreenPageViews,
        row.currentStartDate, row.currentEndDate, row.currentActiveUsers, row.currentScreenPageViews,
        row.activeUsersChange, row.screenPageViewsChange, row.thresholdExceeded]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getLatestSnapshot(pool) {
  await ensureSchema(pool);
  const { rows } = await pool.query(`
    SELECT snapshot_at AS "snapshotAt", name, domain, property_id AS "propertyId",
      previous_start_date AS "previousStartDate", previous_end_date AS "previousEndDate",
      previous_active_users AS "previousActiveUsers", previous_screen_page_views AS "previousScreenPageViews",
      current_start_date AS "currentStartDate", current_end_date AS "currentEndDate",
      current_active_users AS "currentActiveUsers", current_screen_page_views AS "currentScreenPageViews",
      active_users_change AS "activeUsersChange", screen_page_views_change AS "screenPageViewsChange",
      threshold_exceeded AS "thresholdExceeded"
    FROM ${SNAPSHOT_TABLE}
    ORDER BY snapshot_at DESC
  `);
  return rows;
}
