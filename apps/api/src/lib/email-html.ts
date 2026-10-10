import { hasMessage, t, type MessageKey } from '@nothingleft/i18n';

type Params = Record<string, string | number>;

export interface HtmlLine {
  key: MessageKey;
  params?: Params;
}

export interface HtmlEmail {
  to: string;
  subject: MessageKey;
  body: MessageKey | readonly HtmlLine[];
  params?: Params;
  assetBaseUrl: string;
}

const LIGHT = {
  app: '#f3f3f5',
  card: '#ffffff',
  border: '#e0e1e3',
  sub: '#eaebed',
  inset: '#eff0f1',
  text: '#151618',
  secondary: '#585b5f',
  muted: '#696c71',
  accent: '#f3b621',
  link: '#584109',
  ink: '#151618',
  inkText: '#ffffff',
  buttonEdge: '#7d8087',
};

const DARK = {
  app: '#121417',
  card: '#1a1c1f',
  border: '#2e3034',
  sub: '#26282b',
  inset: '#26282b',
  text: '#e6e8ea',
  secondary: '#a5a8ad',
  muted: '#8f9298',
  accent: '#f9bc2c',
  link: '#f7c662',
  ink: '#e9ebee',
  inkText: '#151618',
  buttonEdge: '#7d8087',
};

const SANS = ['Inter', '-apple-system', "'Segoe UI'", 'Roboto', 'Helvetica', 'Arial', 'sans-serif'].join(',');
const MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

const darkRules = `
  .bg-app{background-color:${DARK.app}!important}
  .bg-card{background-color:${DARK.card}!important}
  .bd{border-color:${DARK.border}!important}
  .bd-sub{border-color:${DARK.sub}!important}
  .meter{background-color:${DARK.inset}!important}
  .tx{color:${DARK.text}!important}
  .tx2{color:${DARK.secondary}!important}
  .txm{color:${DARK.muted}!important}
  .lnk{color:${DARK.link}!important}
  .ac{color:${DARK.accent}!important}
  .btn{background-color:${DARK.ink}!important;color:${DARK.inkText}!important;border-color:${DARK.buttonEdge}!important}
  .logo-uni{display:none!important}
  .logo-dark{display:block!important}`;

const styleBlock = `<style>
  body{margin:0;padding:0}
  a{text-decoration:underline}
  .logo-light,.logo-dark{display:none}
  @media (prefers-color-scheme:light){.logo-uni{display:none!important}.logo-light{display:block!important}}
  @media (max-width:520px){.pad{padding:24px 20px!important}.outer{padding:16px 8px!important}}
  @media (prefers-color-scheme:dark){${darkRules}
  }
</style>`;

const escape = (text: string) => text.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);

const URL_PATTERN = /https?:\/\/[^\s<]+/g;

const link = (url: string, label: string, extraStyle = '') =>
  `<a class="lnk" href="${escape(url)}" style="color:${LIGHT.link};text-decoration:underline;${extraStyle}">${escape(label)}</a>`;

function inline(text: string): string {
  let html = '';
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    html += escape(text.slice(last, match.index)) + link(match[0], match[0]);
    last = match.index + match[0].length;
  }
  return (html + escape(text.slice(last))).replace(/\n/g, '<br>');
}

const paragraph = (html: string) =>
  `<p class="tx" style="margin:0 0 14px;font:14px/22px ${SANS};color:${LIGHT.text}">${html}</p>`;

const note = (html: string) =>
  `<p class="txm" style="margin:0 0 10px;font:13px/18px ${SANS};color:${LIGHT.muted}">${html}</p>`;

function heading(text: string): string {
  return `<h1 class="tx" style="margin:0 0 14px;font:600 22px/28px ${SANS};letter-spacing:-0.01em;color:${LIGHT.text}">${escape(text)}<span class="ac" style="color:${LIGHT.accent}">.</span></h1>`;
}

function button(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px"><tr><td class="btn" style="background-color:${LIGHT.ink};border:1px solid ${LIGHT.buttonEdge};border-radius:4px"><a class="btn" href="${escape(url)}" style="display:inline-block;padding:9px 18px;font:500 14px/20px ${SANS};color:${LIGHT.inkText};background-color:${LIGHT.ink};border-radius:4px;text-decoration:none">${escape(label)}</a></td></tr></table>`;
}

function row(inner: string, first: boolean): string {
  const border = first ? '' : `border-top:1px solid ${LIGHT.sub};`;
  return `<tr><td class="tx bd-sub" style="${border}padding:9px 0;font:14px/20px ${SANS};color:${LIGHT.text}">${inner}</td></tr>`;
}

const rows = (items: string[]) =>
  items.length === 0
    ? ''
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 6px">${items.map((html, i) => row(html, i === 0)).join('')}</table>`;

const ISSUE_SUBJECT = /^([A-Z][A-Z0-9]*-\d+)\s+(.+)$/;

function subjectBlock(subject: string): string {
  const match = ISSUE_SUBJECT.exec(subject);
  const title = match ? match[2]! : subject;
  const key = match
    ? `<span class="txm" style="font:13px/22px ${MONO};color:${LIGHT.muted}">${escape(match[1]!)}</span><br>`
    : '';
  return `<p class="tx" style="margin:18px 0 8px;font:600 16px/22px ${SANS};color:${LIGHT.text}">${key}${escape(title)}</p>`;
}

const timeline = (items: string[]) =>
  items.length === 0
    ? ''
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px">${items
        .map(
          html =>
            `<tr><td class="bd tx" style="padding:5px 0 5px 14px;border-left:2px solid ${LIGHT.border};font:15px/22px ${SANS};color:${LIGHT.text}">${html}</td></tr>`,
        )
        .join('')}</table>`;

function storageFigure(params: Params): string {
  const percent = Math.min(100, Math.max(0, Number(params.percent ?? 100)));
  return `<p class="tx" style="margin:6px 0 2px;font:600 30px/36px ${SANS};letter-spacing:-0.01em;color:${LIGHT.text}">${escape(String(params.used))} <span class="tx2" style="font-size:14px;font-weight:400;letter-spacing:0;color:${LIGHT.secondary}">/ ${escape(String(params.limit))}</span></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px"><tr><td class="meter" style="height:6px;border-radius:3px;background-color:${LIGHT.inset};font-size:0;line-height:0"><table role="presentation" width="${percent}%" cellpadding="0" cellspacing="0"><tr><td style="height:6px;border-radius:3px;background-color:#c38401;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr></table>`;
}

const subjectHeading = (subject: string) => subject.replace(/\s·\s[^·]+$/, '');

function transactionalContent(email: HtmlEmail, key: MessageKey): string {
  const params = email.params ?? {};
  const actionKey = key.replace(/\.body$/, '.action');
  const label = hasMessage(actionKey) ? t(actionKey as MessageKey, params) : null;
  const url = typeof params.url === 'string' ? params.url : null;

  const parts = [heading(subjectHeading(t(email.subject, params)))];
  let afterButton = false;
  let figure = 'used' in params && 'limit' in params;
  t(key, params)
    .split(/\n{2,}/)
    .forEach((block, index) => {
      if (url !== null && label !== null && block === url) {
        parts.push(button(url, label));
        parts.push(
          note(
            `${escape(t('email.action.fallback'))}<br>${link(url, url, `word-break:break-all;font-family:${MONO};font-size:12px`)}`,
          ),
        );
        afterButton = true;
        return;
      }
      parts.push(afterButton ? note(inline(block)) : paragraph(inline(block)));
      if (figure && index > 0) {
        parts.push(storageFigure(params));
        figure = false;
      }
    });
  return parts.join('\n');
}

function footerHtml(text: string): string {
  return text
    .split('\n')
    .filter(line => line.trim() !== '' && line.trim() !== '-')
    .map(line => {
      const match = /^(.*?):\s*(https?:\/\/\S+)$/.exec(line);
      if (!match) return escape(line);
      const sentences = match[1]!.split(/(?<=\.)\s+/);
      const label = sentences.pop()!;
      return `${sentences.length > 0 ? `${escape(sentences.join(' '))} ` : ''}${link(match[2]!, label)}`;
    })
    .join('<br>');
}

function activityContent(email: HtmlEmail, lines: readonly HtmlLine[]): { content: string; footer: string } {
  const render = (line: HtmlLine) => t(line.key, line.params);
  const digest = lines[0]?.key.startsWith('email.digest.') ?? false;
  const summaries = lines.filter(l => l.key === 'email.notification.line');
  const single = !digest && summaries.length === 1;

  const parts: string[] = [];
  if (digest || !single) parts.push(heading(subjectHeading(t(email.subject, email.params))));
  let footer = '';
  let pending: string[] = [];

  const flushRows = () => {
    parts.push(rows(pending));
    pending = [];
  };

  for (const line of lines) {
    const params = line.params ?? {};
    switch (line.key) {
      case 'email.notification.greeting':
        parts.push(paragraph(escape(render(line).trim())));
        break;
      case 'email.notification.line':
        if (single) {
          parts.push(
            `<p class="tx" style="margin:0 0 4px;font:600 15px/22px ${SANS};color:${LIGHT.text}">${escape(render(line).trim())}</p>`,
          );
        } else pending.push(escape(render(line).trim()));
        break;
      case 'email.notification.open': {
        const subject = String(params.subject);
        if (single) {
          parts.push(
            `<p class="tx2" style="margin:0 0 8px;font:13px/18px ${SANS};color:${LIGHT.secondary}">${escape(subject)}</p>`,
          );
        } else {
          parts.push(subjectBlock(subject));
          parts.push(timeline(pending));
          pending = [];
        }
        parts.push(button(String(params.url), t('email.notification.action')));
        break;
      }
      case 'email.digest.project':
        flushRows();
        parts.push(
          `<p class="tx" style="margin:20px 0 2px;font:600 14px/20px ${SANS};color:${LIGHT.text}">${escape(render(line).trim())}</p>`,
        );
        break;
      case 'email.digest.kind':
        flushRows();
        parts.push(
          `<p class="tx2" style="margin:10px 0 0;font:13px/18px ${SANS};color:${LIGHT.secondary}">${escape(String(params.label))} · ${escape(String(params.count))}</p>`,
        );
        break;
      case 'email.digest.issue':
        pending.push(
          `${params.key ? `<span class="txm" style="font:13px/20px ${MONO};color:${LIGHT.muted}">${escape(String(params.key))}</span>&nbsp; ` : ''}${escape(String(params.title))}`,
        );
        break;
      case 'email.digest.more':
      case 'email.digest.count':
      case 'email.digest.watched':
        flushRows();
        parts.push(
          `<p style="margin:8px 0 0;font:13px/18px ${SANS}">${link(String(params.url), render(line).split('→')[0]!.trim())}</p>`,
        );
        break;
      case 'email.notification.footer':
      case 'email.digest.footer.daily':
      case 'email.digest.footer.weekly':
        flushRows();
        footer = footerHtml(render(line));
        break;
      default:
        break;
    }
  }
  flushRows();
  return { content: parts.join('\n'), footer };
}

function layout(content: string, footer: string, title: string, assetBaseUrl: string): string {
  const logo = (cls: string, file: string, extra: string) =>
    `<img class="${cls}" src="${escape(assetBaseUrl.replace(/\/$/, ''))}/email/${file}.png" alt="Nothing Left" width="130" height="22" style="display:block;border:0;${extra}">`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escape(title)}</title>
${styleBlock}
</head>
<body class="bg-app" style="margin:0;padding:0;background-color:${LIGHT.app}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg-app" style="background-color:${LIGHT.app}"><tr><td class="outer" align="center" style="padding:24px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
<tr><td style="padding:0 4px 14px">${logo('logo-uni', 'logo', '')}${logo('logo-light', 'logo-light', 'display:none;')}${logo('logo-dark', 'logo-dark', 'display:none;')}</td></tr>
<tr><td class="bg-card bd" style="background-color:${LIGHT.card};border:1px solid ${LIGHT.border};border-radius:6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="pad" style="padding:28px 32px;font-family:${SANS}">
${content}
</td></tr></table></td></tr>
<tr><td class="txm" style="padding:16px 4px 0;font:12px/18px ${SANS};color:${LIGHT.muted}">${footer}</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

export function renderHtml(email: HtmlEmail): string {
  const title = subjectHeading(t(email.subject, email.params));
  if (typeof email.body === 'string') {
    return layout(
      transactionalContent(email, email.body),
      escape(t('email.footer.transactional', { to: email.to })),
      title,
      email.assetBaseUrl,
    );
  }
  const { content, footer } = activityContent(email, email.body);
  return layout(content, footer, title, email.assetBaseUrl);
}
