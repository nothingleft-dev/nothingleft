import nodemailer from 'nodemailer';
import type { Logger } from 'pino';
import { t, type MessageKey } from '@nothingleft/i18n';
import { renderHtml } from '@lib/email-html';
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

interface Mail {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

type Transport = (mail: Mail) => Promise<void>;

const PROVIDER_CODE = /^[A-Za-z0-9_]{1,64}$/;

// Only the provider's error code leaves this file: its message can quote the recipient, and
// the thrown error goes to the error tracker, which never receives an email address.
async function providerErrorCode(response: Response, pick: (body: unknown) => unknown): Promise<string | null> {
  try {
    const code = pick(await response.json());
    return typeof code === 'string' && PROVIDER_CODE.test(code) ? code : null;
  } catch {
    return null;
  }
}

async function rejected(
  provider: string,
  response: Response,
  pick: (body: unknown) => unknown,
  log: Logger,
  subject: string,
) {
  const code = await providerErrorCode(response, pick);
  log.error({ subject, status: response.status, code }, `email rejected by ${provider}`);
  return new Error(code ? `${provider} ${response.status} ${code}` : `${provider} ${response.status}`);
}

const field = (body: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>(
    (value, key) => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined),
    body,
  );

function resendTransport(apiKey: string, log: Logger): Transport {
  return async mail => {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(mail),
      signal: AbortSignal.timeout(EMAIL_SEND_TIMEOUT_MS),
    });
    if (!response.ok) throw await rejected('resend', response, body => field(body, 'name'), log, mail.subject);
  };
}

function parseSender(from: string): { address: string; name?: string } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  const name = match?.[1]?.trim();
  return match ? { address: match[2]!.trim(), ...(name ? { name } : {}) } : { address: from.trim() };
}

const ZOHO_KEY_PREFIX = 'Zoho-enczapikey ';

function zohoTransport(env: Env, apiKey: string, log: Logger): Transport {
  const authorization = apiKey.startsWith(ZOHO_KEY_PREFIX) ? apiKey : `${ZOHO_KEY_PREFIX}${apiKey}`;
  return async mail => {
    const response = await fetch(env.ZOHO_EMAIL_ENDPOINT, {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        from: parseSender(mail.from),
        to: mail.to.map(address => ({ email_address: { address } })),
        subject: mail.subject,
        textbody: mail.text,
        htmlbody: mail.html,
        ...(mail.headers ? { mime_headers: mail.headers } : {}),
      }),
      signal: AbortSignal.timeout(EMAIL_SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw await rejected(
        'zoho',
        response,
        body => field(body, 'data', 'error_code') ?? field(body, 'error', 'code'),
        log,
        mail.subject,
      );
    }
  };
}

function smtpTransport(env: Env, log: Logger): Transport {
  const port = env.SMTP_PORT;
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: env.SMTP_SECURE ?? port === 465,
    ...(env.SMTP_USER !== undefined && env.SMTP_PASSWORD !== undefined
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
      : {}),
    connectionTimeout: EMAIL_SEND_TIMEOUT_MS,
    greetingTimeout: EMAIL_SEND_TIMEOUT_MS,
    socketTimeout: EMAIL_SEND_TIMEOUT_MS,
  });
  return async mail => {
    try {
      await transporter.sendMail(mail);
    } catch (error) {
      const raw =
        (error as { code?: unknown; responseCode?: unknown }).code ??
        (error as { responseCode?: unknown }).responseCode;
      const code = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : null;
      const safe = code !== null && PROVIDER_CODE.test(code) ? code : null;
      log.error({ subject: mail.subject, code: safe }, 'email rejected by smtp');
      // No cause: the SMTP error's message can quote the recipient.
      // eslint-disable-next-line preserve-caught-error
      throw new Error(safe ? `smtp ${safe}` : 'smtp');
    }
  };
}

function transportFor(env: Env, log: Logger): Transport | null {
  switch (env.EMAIL_PROVIDER) {
    case 'resend':
      return env.RESEND_API_KEY ? resendTransport(env.RESEND_API_KEY, log) : null;
    case 'zoho':
      return env.ZOHO_EMAIL_API_KEY ? zohoTransport(env, env.ZOHO_EMAIL_API_KEY, log) : null;
    case 'smtp':
      return env.SMTP_HOST ? smtpTransport(env, log) : null;
  }
}

export function createMailer(env: Env, log: Logger): Mailer {
  const render = (message: Message): Mail => {
    const text =
      typeof message.body === 'string'
        ? t(message.body, message.params)
        : message.body.map(line => t(line.key, line.params)).join('\n');
    return {
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: t(message.subject, message.params),
      text,
      html: renderHtml({
        to: message.to,
        subject: message.subject,
        body: message.body,
        params: message.params ?? {},
        assetBaseUrl: env.ASSET_BASE_URL,
      }),
      ...(message.headers ? { headers: message.headers } : {}),
    };
  };

  const transport = transportFor(env, log);
  if (!transport) {
    // Without credentials mail is logged instead of sent, so nobody silently emails a real address
    // from a laptop. Bodies carry reset and invitation links, so only development logs them.
    return {
      async send(message) {
        if (env.NODE_ENV !== 'development') {
          log.info({ subject: message.subject }, 'email not sent: no provider credentials');
          return;
        }
        const mail = render(message);
        log.info(
          { to: message.to, subject: mail.subject, body: mail.text, headers: mail.headers },
          'email not sent: no provider credentials',
        );
      },
    };
  }

  return {
    async send(message) {
      await transport(render(message));
    },
  };
}
