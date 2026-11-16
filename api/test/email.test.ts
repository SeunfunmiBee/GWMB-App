import { describe, expect, it } from 'vitest';
import { renderEmail, sendEmail } from '../src/email';
import type { Env } from '../src/env';

function fakeEnv(overrides: Partial<Env> = {}) {
  const sent: unknown[] = [];
  const EMAIL = { send: async (message: unknown) => { sent.push(message); return { messageId: 'm-1' }; } } as unknown as SendEmail;
  return { env: { EMAIL, NOTIFICATION_FROM_EMAIL: 'no-reply@notify.example.org', ENVIRONMENT: 'production', ...overrides } as Env, sent };
}

describe('sendEmail', () => {
  it('sends through the Cloudflare email binding with text and html', async () => {
    const { env, sent } = fakeEnv();
    await sendEmail(env, 'member@example.com', 'Your code', 'Your code is 123456.', '<p>Your code is 123456.</p>');
    expect(sent).toEqual([{
      from: { email: 'no-reply@notify.example.org', name: 'Girls Who Mean Business' },
      to: 'member@example.com', subject: 'Your code', text: 'Your code is 123456.', html: '<p>Your code is 123456.</p>',
    }]);
  });

  it('fails closed outside development when email is not configured', async () => {
    const { env } = fakeEnv({ NOTIFICATION_FROM_EMAIL: undefined });
    await expect(sendEmail(env, 'member@example.com', 'Your code', 'x')).rejects.toThrow('Email is not configured.');
  });

  it('renders codes, https buttons and escaped text in the branded template', () => {
    const html = renderEmail({ BETTER_AUTH_URL: 'https://api.example.org/' }, {
      title: 'Hi <you>', body: 'First line.\n\nSecond & last.', code: '123456', action: { label: 'Join', url: 'https://meet.example.com/x' }, footnote: 'Ignore me',
    });
    expect(html).toContain('src="https://api.example.org/email-logo.png"');
    expect(html).toContain('Hi &lt;you&gt;');
    expect(html).toContain('Second &amp; last.');
    expect(html).toContain('>123456</div>');
    expect(html).toContain('href="https://meet.example.com/x"');
    expect(html).toContain('Ignore me');
    expect(renderEmail({ BETTER_AUTH_URL: 'https://api.example.org' }, { title: 't', body: 'b', action: { label: 'x', url: 'javascript:alert(1)' } })).not.toContain('javascript:');
  });

  it('prints instead of sending in local development', async () => {
    const { env, sent } = fakeEnv({ ENVIRONMENT: 'development' });
    await sendEmail(env, 'member@example.com', 'Your code', 'x');
    expect(sent).toEqual([]);
  });
});
