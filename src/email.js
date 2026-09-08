import { Resend } from 'resend';

export async function sendAlert({ apiKey, from, to, subject, html, text }) {
  const resend = new Resend(apiKey);
  const result = await resend.emails.send({ from, to: to.split(',').map((address) => address.trim()), subject, html, text });
  if (result.error) throw new Error(`Resend email delivery failed: ${result.error.message || result.error.name || 'unknown error'}`);
  return result.data;
}
