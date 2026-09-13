export function loadConfig(env = process.env, options = {}) {
  const { requireAgentMail = true, requireDatabase = true, requireDashboardAuth = false } = options;
  const properties = parseProperties(env.GA4_PROPERTIES_JSON);

  const threshold = Number(env.CHANGE_THRESHOLD_PERCENT ?? 10);
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new Error('CHANGE_THRESHOLD_PERCENT must be a non-negative number');
  }

  const clientEmail = env.GOOGLE_CLIENT_EMAIL?.trim();
  const privateKey = env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if ((clientEmail && !privateKey) || (!clientEmail && privateKey)) {
    throw new Error('GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY must be provided together');
  }

  return {
    properties,
    thresholdPercent: threshold,
    agentMailApiKey: requireAgentMail ? requiredFrom(env, 'AGENTMAIL_API_KEY') : env.AGENTMAIL_API_KEY?.trim(),
    agentMailInboxId: requireAgentMail ? requiredFrom(env, 'AGENTMAIL_INBOX_ID') : env.AGENTMAIL_INBOX_ID?.trim(),
    emailTo: requireAgentMail ? requiredFrom(env, 'EMAIL_TO') : env.EMAIL_TO?.trim(),
    databaseUrl: requireDatabase ? requiredFrom(env, 'DATABASE_URL') : env.DATABASE_URL?.trim(),
    dashboardUsername: requireDashboardAuth ? requiredFrom(env, 'DASHBOARD_USERNAME') : env.DASHBOARD_USERNAME?.trim(),
    dashboardPassword: requireDashboardAuth ? requiredFrom(env, 'DASHBOARD_PASSWORD') : env.DASHBOARD_PASSWORD,
    googleCredentials: clientEmail ? { client_email: clientEmail, private_key: privateKey } : undefined,
  };
}

function parseProperties(value) {
  if (!value?.trim()) throw new Error('Missing required environment variable: GA4_PROPERTIES_JSON');

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('GA4_PROPERTIES_JSON must be valid JSON');
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('GA4_PROPERTIES_JSON must be a non-empty JSON array');
  }

  const properties = parsed.map((property, index) => {
    if (!property || typeof property !== 'object' || Array.isArray(property)) {
      throw new Error(`GA4_PROPERTIES_JSON entry ${index + 1} must include name, domain, and propertyId`);
    }

    const name = typeof property.name === 'string' ? property.name.trim() : '';
    const domain = typeof property.domain === 'string' ? property.domain.trim() : '';
    const rawPropertyId = typeof property.propertyId === 'string'
      ? property.propertyId.trim()
      : String(property.propertyId ?? '').trim();
    const propertyId = rawPropertyId.replace(/^properties\//, '');

    if (!name || !domain || !propertyId) {
      throw new Error(`GA4_PROPERTIES_JSON entry ${index + 1} must include name, domain, and propertyId`);
    }
    if (!/^\d+$/.test(propertyId)) {
      throw new Error(`GA4_PROPERTIES_JSON entry ${index + 1} propertyId must be numeric`);
    }

    return { name, domain, propertyId };
  });

  const ids = new Set(properties.map(({ propertyId }) => propertyId));
  if (ids.size !== properties.length) {
    throw new Error('GA4_PROPERTIES_JSON must not contain duplicate property IDs');
  }

  return properties;
}

function requiredFrom(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
