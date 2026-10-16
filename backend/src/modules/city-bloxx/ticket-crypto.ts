import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { gameError } from './common/game-worker.service';

// Dedicated AES-GCM keys; the ticket itself is never stored in plaintext.
export class TicketCrypto {
  private keys = new Map<string, Buffer>();
  readonly keyId: string;
  constructor(env = process.env) {
    this.keyId = env.GAME_TICKET_KEY_ID || '';
    try {
      const previous: unknown = JSON.parse(env.GAME_TICKET_DECRYPTION_KEYS || '{}');
      if (!previous || typeof previous !== 'object' || Array.isArray(previous))
        throw new Error('Invalid key map');
      for (const [id, key] of Object.entries(previous)) this.add(id, key, env);
      if (env.GAME_TICKET_ENCRYPTION_KEY)
        this.add(this.keyId, env.GAME_TICKET_ENCRYPTION_KEY, env);
    } catch {
      throw new Error('Invalid dedicated game ticket encryption configuration');
    }
  }
  private add(id: string, value: unknown, env: NodeJS.ProcessEnv) {
    if (
      !/^[a-zA-Z0-9_-]{1,64}$/.test(id) ||
      typeof value !== 'string' ||
      !/^[A-Za-z0-9+/]{43}=$/.test(value) ||
      [env.JWT_SECRET, env.MAIL_OUTBOX_KEY].includes(value)
    )
      throw new Error('Invalid ticket key');
    const key = Buffer.from(value, 'base64');
    if (key.length !== 32 || key.toString('base64') !== value)
      throw new Error('Invalid key');
    if (
      key.toString('hex') === env.MAIL_OUTBOX_KEY ||
      key.equals(Buffer.from(env.JWT_SECRET || '', 'utf8'))
    )
      throw new Error('Key reuse');
    const existing = this.keys.get(id);
    if (existing && !existing.equals(key)) throw new Error('Key ID reused');
    this.keys.set(id, key);
  }
  encrypt(value: object, context: string) {
    const key = this.keys.get(this.keyId);
    if (!key)
      throw gameError(503, 'GAME_TICKET_KEY_UNAVAILABLE', 'Ticket issuance unavailable');
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(context));
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
  }
  decrypt(raw: string, id: string, context: string) {
    try {
      const key = this.keys.get(id);
      if (!key) throw new Error('Key unavailable');
      const parts = raw.split('.');
      if (
        parts.length !== 3 ||
        parts.some((v) => !v || Buffer.from(v, 'base64').toString('base64') !== v)
      )
        throw new Error('Noncanonical ciphertext');
      const [iv, tag, data, extra] = parts.map((v) => Buffer.from(v, 'base64'));
      if (extra || iv.length !== 12 || tag.length !== 16)
        throw new Error('Invalid ciphertext');
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(tag);
      return JSON.parse(
        Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'),
      ) as Record<string, unknown>;
    } catch {
      throw gameError(
        503,
        'GAME_TICKET_KEY_UNAVAILABLE',
        'Original ticket recovery unavailable',
      );
    }
  }
}
