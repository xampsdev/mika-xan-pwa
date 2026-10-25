/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const NTFY_TOPIC = 'mika-xan-alerts-xampsbeatz-9921';
export const NTFY_WEB_URL = `https://ntfy.sh/${NTFY_TOPIC}`;

/**
 * Sends a background push notification via ntfy.sh.
 * Intentionally avoids custom headers (e.g. no 'Content-Type' or 'Title')
 * so that modern browsers execute a CORS-safe simple POST request,
 * avoiding preflight OPTIONS failure and ASCII header limitations.
 */
export async function sendNtfyAlert(title: string, message: string): Promise<void> {
  try {
    await fetch('https://ntfy.sh', {
      method: 'POST',
      body: JSON.stringify({
        topic: NTFY_TOPIC,
        title: title,
        message: message,
        priority: 4,
        tags: ['dog', 'bell'],
      }),
    });
  } catch (err) {
    console.error('ntfy push error:', err);
  }
}
