export function loadConfig(env = process.env) {
  const propertyId = env.GA4_PROPERTY_ID?.trim();
  if (!propertyId) throw new Error('Missing required environment variable: GA4_PROPERTY_ID');

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
    propertyId: propertyId.replace(/^properties\//, ''),
    thresholdPercent: threshold,
    resendApiKey: requiredFrom(env, 'RESEND_API_KEY'),
    emailFrom: requiredFrom(env, 'EMAIL_FROM'),
    emailTo: requiredFrom(env, 'EMAIL_TO'),
    googleCredentials: clientEmail ? { client_email: clientEmail, private_key: privateKey } : undefined,
  };
}

function requiredFrom(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
