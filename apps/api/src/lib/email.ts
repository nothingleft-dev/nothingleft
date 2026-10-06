import type { Logger } from 'pino';
import { t, type MessageKey } from '@nothingleft/i18n';
import type { Env } from '@config/env';
import { EMAIL_SEND_TIMEOUT_MS, RESEND_ENDPOINT } from '@config/constants';

type Params = Record<string, string | number>;

export interface Line {
  key: MessageKey;
  params?: Params;
}

export interface Message {
  to: string;
  subject: MessageKey;
  /** One catalogue message, or several joined line by line (a digest). */
  body: MessageKey | readonly Line[];
  params?: Params;
  headers?: Record<string, string>;
}

export interface Mailer {
  send(message: Message): Promise<void>;
}

/**
 * For mail that follows a change already saved, or that must not reveal whether it was
 * sent: a failed send is reported, never the request's failure.
 */
export function bestEffort(mailer: Mailer, report: (error: unknown) => void): Mailer {
  return {
    async send(message) {
      try {
        await mailer.send(message);
      } catch (error) {
        report(error);
      }
    },
  };
}

// A single pre-wrapped block: the plain-text body is the source and the HTML alternative
// is generated from it, so there is exactly one copy of every sentence, in en.json.
function toHtml(text: string): string {
  const escaped = text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);
  const linked = escaped.replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>');
  return `<div style="font:14px/1.6 -apple-system,Segoe UI,sans-serif;white-space:pre-wrap">${linked}</div>`;
}

// Only the provider's error code leaves this file: its message can quote the recipient, and
// the thrown error goes to the error tracker, which never receives an email address.
async function providerErrorCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { name?: unknown };
    return typeof body.name === 'string' && /^[a-z_]{1,64}$/.test(body.name) ? body.name : null;
  } catch {
    return null;
  }
}

export function createMailer(env: Env, log: Logger): Mailer {
  const render = (message: Message) => {
    const text =
      typeof message.body === 'string'
        ? t(message.body, message.params)
        : message.body.map(line => t(line.key, line.params)).join('\n');
    return {
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: t(message.subject, message.params),
      text,
      html: toHtml(text),
      ...(message.headers ? { headers: message.headers } : {}),
    };
  };

  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    // Without a key mail is logged instead of sent, so nobody silently emails a real address
    // from a laptop. Bodies carry reset and invitation links, so only development logs them.
    return {
      async send(message) {
        if (env.NODE_ENV !== 'development') {
          log.info({ subject: message.subject }, 'email not sent: RESEND_API_KEY unset');
          return;
        }
        const mail = render(message);
        log.info(
          { to: message.to, subject: mail.subject, body: mail.text, headers: mail.headers },
          'email not sent: RESEND_API_KEY unset',
        );
      },
    };
  }

  return {
    async send(message) {
      const response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(render(message)),
        signal: AbortSignal.timeout(EMAIL_SEND_TIMEOUT_MS),
      });
      if (!response.ok) {
        const code = await providerErrorCode(response);
        log.error({ subject: message.subject, status: response.status, code }, 'email rejected by resend');
        throw new Error(code ? `resend ${response.status} ${code}` : `resend ${response.status}`);
      }
    },
  };
}
