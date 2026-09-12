import { AgentMailClient } from 'agentmail';

export async function sendAlert({ apiKey, inboxId, to, subject, html, text, client }) {
  const agentMail = client ?? new AgentMailClient({ apiKey });
  return agentMail.inboxes.messages.send(inboxId, {
    to: to.split(',').map((address) => address.trim()),
    subject,
    html,
    text,
  });
}
