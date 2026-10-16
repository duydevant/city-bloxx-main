import { randomBytes } from 'node:crypto';
import { TicketCrypto } from './ticket-crypto';

describe('dedicated ticket encryption', () => {
  const key = randomBytes(32).toString('base64');
  const env = { GAME_TICKET_ENCRYPTION_KEY: key, GAME_TICKET_KEY_ID: 'v1' };
  it('recovers the exact response with authenticated owner/run context', () => {
    const c = new TicketCrypto(env),
      value = { ticket: 'secret', config: { seed: -17 } };
    const raw = c.encrypt(value, 'owner:run');
    expect(raw).not.toContain('secret');
    expect(c.decrypt(raw, 'v1', 'owner:run')).toEqual(value);
    expect(() => c.decrypt(raw, 'v1', 'other:run')).toThrow();
    expect(() => c.decrypt(raw + 'bad', 'v1', 'owner:run')).toThrow();
  });
  it('rotates the active key while retaining outstanding responses', () => {
    const old = new TicketCrypto(env),
      raw = old.encrypt({ ticket: 'old' }, 'owner:run');
    const rotated = new TicketCrypto({
      GAME_TICKET_KEY_ID: 'v2',
      GAME_TICKET_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      GAME_TICKET_DECRYPTION_KEYS: JSON.stringify({ v1: key }),
    });
    expect(rotated.decrypt(raw, 'v1', 'owner:run')).toEqual({ ticket: 'old' });
    expect(() => rotated.decrypt(raw, 'gone', 'owner:run')).toThrow();
  });
  it('fails closed without an active key; never invents a retry ticket', () => {
    expect(() => new TicketCrypto({}).encrypt({}, 'owner:run')).toThrow();
  });
  it('rejects malformed, reused auth/mail keys and reused key IDs', () => {
    for (const bad of [
      { ...env, GAME_TICKET_ENCRYPTION_KEY: 'short' },
      { ...env, JWT_SECRET: key },
      { ...env, MAIL_OUTBOX_KEY: Buffer.from(key, 'base64').toString('hex') },
      { ...env, GAME_TICKET_KEY_ID: '' },
      {
        ...env,
        GAME_TICKET_DECRYPTION_KEYS: JSON.stringify({
          v1: randomBytes(32).toString('base64'),
        }),
      },
    ])
      expect(() => new TicketCrypto(bad)).toThrow();
  });
});
