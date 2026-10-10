import { describe, expect, test } from 'bun:test';
import { hasMessage, t } from '@nothingleft/i18n';
import { renderHtml } from '@lib/email-html';
import { EMAIL_SAMPLES } from '../scripts/email-samples';

const render = (id: string) => {
  const sample = EMAIL_SAMPLES.find(s => s.id === id)!;
  return renderHtml({ ...sample, assetBaseUrl: 'https://static.example.com/' });
};

describe('email html', () => {
  test.each(EMAIL_SAMPLES.map(s => s.id))('%s renders complete, themed html with no unfilled token', id => {
    const html = render(id);
    expect(html).toContain('prefers-color-scheme:dark');
    expect(html).toContain('https://static.example.com/email/logo.png');
    expect(html).toContain('https://static.example.com/email/logo-light.png');
    expect(html).toContain('https://static.example.com/email/logo-dark.png');
    expect(html).not.toMatch(/\{\w+\}/);
  });

  test('every transactional sample with a link has its button label in the catalogue', () => {
    for (const sample of EMAIL_SAMPLES) {
      if (typeof sample.body !== 'string' || !t(sample.body, sample.params).includes(String(sample.params.url)))
        continue;
      expect(hasMessage(sample.body.replace(/\.body$/, '.action'))).toBe(true);
    }
  });

  test('a link on its own line becomes a button with the link repeated as a fallback', () => {
    const html = render('email.verify');
    expect(html).toContain('>Verify email</a>');
    expect(html).toContain(t('email.action.fallback'));
  });

  test('user-supplied text is escaped', () => {
    const sample = EMAIL_SAMPLES.find(s => s.id === 'email.pat_created')!;
    const html = renderHtml({
      ...sample,
      params: { ...sample.params, token_name: '<img src=x onerror=alert(1)>' },
      assetBaseUrl: 'https://static.example.com',
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&#60;img src=x');
  });

  test('storage emails show the quota as a figure and a meter', () => {
    expect(render('email.storage_almost_full')).toContain('4.8 GB');
    expect(render('email.storage_almost_full')).toContain('width="96%"');
    expect(render('email.storage_connected')).not.toContain('width="96%"');
  });

  test('a single change is a sentence, several changes get a heading and rows', () => {
    expect(render('email.notification')).not.toContain('<h1');
    expect(render('email.notification_many')).toContain('<h1');
  });

  test('activity mail links its unsubscribe and preferences footer', () => {
    const html = render('email.digest.daily');
    expect(html).toContain('>Stop the daily digest in one click</a>');
    expect(html).toContain('>Everything you receive</a>');
  });
});
