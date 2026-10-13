import * as nodemailer from 'nodemailer';
import {
  HttpException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'crypto';
import Redis from 'ioredis';
import { DataSource, EntityManager } from 'typeorm';
import { rows } from './types';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const opaque = () => randomBytes(32).toString('base64url');
export const boolEnv = (key: string, fallback = true) =>
  process.env[key] === undefined ? fallback : process.env[key] === 'true';

@Injectable()
export class InfrastructureService implements OnModuleInit, OnModuleDestroy {
  readonly redis = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  private timer?: NodeJS.Timeout;
  private busy = false;
  private readonly transport = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 1025),
    secure: boolEnv('MAIL_SECURE', false),
    ...(process.env.MAIL_USERNAME
      ? { auth: { user: process.env.MAIL_USERNAME, pass: process.env.MAIL_PASSWORD } }
      : {}),
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
  });
  constructor(private readonly db: DataSource) {
    this.redis.on('error', () => undefined);
  }
  async onModuleInit() {
    await this.redis.connect();
    this.timer = setInterval(() => {
      void this.dispatch().catch(() => undefined);
    }, 2000);
    this.timer.unref();
  }
  async onModuleDestroy() {
    clearInterval(this.timer);
    this.transport.close();
    await this.redis.quit();
  }
  async rateLimit(route: string, ip: string, email?: string) {
    const limit = Number(
      process.env[`${route.replace(/-/g, '_').toUpperCase()}_RATE_LIMIT`] ||
        (route === 'login' ? 5 : route === 'refresh' ? 30 : 10),
    );
    const window = Number(
      process.env[`${route.replace(/-/g, '_').toUpperCase()}_RATE_WINDOW_SECONDS`] || 300,
    );
    const keys = [`auth:rate:${route}:ip:${digest(ip)}`];
    if (email)
      keys.push(`auth:rate:${route}:email:${digest(email.trim().toLowerCase())}`);
    for (const key of keys) {
      let count: number;
      try {
        count = Number(
          await this.redis.eval(
            `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n`,
            1,
            key,
            window,
          ),
        );
      } catch {
        throw new ServiceUnavailableException('Authentication rate limiter unavailable');
      }
      if (count > limit) throw new HttpException('Too many requests; retry later', 429);
    }
  }
  async queueMail(
    tx: EntityManager,
    email: string,
    purpose: 'verify' | 'reset',
    token: string,
    expires: Date,
  ) {
    const base = process.env.FRONTEND_USER_PORTAL_URL.replace(/\/$/, '');
    const link = `${base}/${purpose === 'verify' ? 'verify-email' : 'reset-password'}?token=${encodeURIComponent(token)}`;
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      Buffer.from(process.env.MAIL_OUTBOX_KEY, 'hex'),
      iv,
    );
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify({ email, purpose, link }), 'utf8'),
      cipher.final(),
    ]);
    const payload = [
      iv.toString('hex'),
      cipher.getAuthTag().toString('hex'),
      encrypted.toString('hex'),
    ].join('.');
    await tx.query('INSERT INTO mail_outbox(id,payload,expires_at) VALUES($1,$2,$3)', [
      randomUUID(),
      payload,
      expires,
    ]);
  }
  async dispatch() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.db.transaction(async (tx) => {
        const [job] = await rows<{ id: string; payload: string; attempts: number }>(
          tx,
          `SELECT * FROM mail_outbox WHERE sent_at IS NULL AND expires_at>now() AND next_attempt_at<=now() ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
        );
        if (!job) return;
        try {
          const [iv, tag, ciphertext] = job.payload.split('.');
          const decipher = createDecipheriv(
            'aes-256-gcm',
            Buffer.from(process.env.MAIL_OUTBOX_KEY, 'hex'),
            Buffer.from(iv, 'hex'),
          );
          decipher.setAuthTag(Buffer.from(tag, 'hex'));
          const message = JSON.parse(
            Buffer.concat([
              decipher.update(Buffer.from(ciphertext, 'hex')),
              decipher.final(),
            ]).toString('utf8'),
          ) as { email: string; purpose: string; link: string };
          await this.transport.sendMail({
            from: process.env.MAIL_SENDER,
            to: message.email,
            subject:
              message.purpose === 'verify' ? 'Verify your email' : 'Set your password',
            text: `Open this one-time link before it expires:\n${message.link}\nIf you did not request this, ignore this email.`,
          });
          await tx.query("UPDATE mail_outbox SET sent_at=now(),payload='' WHERE id=$1", [
            job.id,
          ]);
        } catch {
          await tx.query(
            `UPDATE mail_outbox SET attempts=attempts+1,next_attempt_at=now()+make_interval(secs=>LEAST(3600,30*power(2,LEAST(attempts,7)))::int) WHERE id=$1`,
            [job.id],
          );
        }
      });
      await this.db.query(
        `DELETE FROM mail_outbox WHERE expires_at<now() OR sent_at<now()-interval '1 day'`,
      );
      // Retain used lineage beyond absolute session expiry for replay analysis.
      await this.db.query(
        `DELETE FROM auth_sessions WHERE expires_at<now()-interval '7 days'`,
      );
      await this.db.query(
        `DELETE FROM password_reset_tokens WHERE expires_at<now()-interval '7 days'`,
      );
      await this.db.query(
        `DELETE FROM email_verification_tokens WHERE expires_at<now()-interval '7 days'`,
      );
    } finally {
      this.busy = false;
    }
  }
}
