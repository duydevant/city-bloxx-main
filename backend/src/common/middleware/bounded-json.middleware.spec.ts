import express from 'express';
import { request as httpRequest, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import request from 'supertest';
import { boundedJson } from './bounded-json.middleware';

describe('HTTP body budgets before controllers', () => {
  const app = express();
  app.use(boundedJson());
  app.use((_req, res) => res.sendStatus(204));
  const body = (bytes: number) => JSON.stringify({ data: 'a'.repeat(bytes - 11) });
  const paths: [string, number][] = [
    ['/api/v1/auth/login', 16],
    ['/api/v1/users/me', 16],
    ['/api/v1/city-bloxx/analytics/events', 32],
    ['/api/v1/city-bloxx/analytics/guest-events', 32],
    ['/api/v1/city-bloxx/runs/finish', 256],
    ['/api/v1/city-bloxx/save', 272],
    ['/api/v1/city-bloxx/save/resolve', 272],
  ];
  for (const [path, kib] of paths) {
    it(`accepts ${kib} KiB and rejects one byte over at ${path}`, async () => {
      await request(app)
        .post(path)
        .type('json')
        .send(body(kib * 1024))
        .expect(204);
      await request(app)
        .post(path)
        .type('json')
        .send(body(kib * 1024 + 1))
        .expect(413);
    });
  }
  it('matches trailing slashes and rejects malformed JSON and unsupported encodings', async () => {
    await request(app)
      .post('/api/v1/city-bloxx/save/')
      .type('json')
      .send(body(272 * 1024))
      .expect(204);
    await request(app).post('/api/v1/auth/login').type('json').send('{').expect(400);
    await request(app).post('/api/v1/auth/login').type('text').send('hello').expect(415);
    await request(app)
      .post('/api/v1/auth/login')
      .type('json')
      .set('Content-Encoding', 'gzip')
      .send(gzipSync('{}'))
      .expect(415);
  });
  it('caps chunked bodies without Content-Length', async () => {
    const server: Server = app.listen(0, '127.0.0.1');
    try {
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const port = (server.address() as AddressInfo).port;
      const status = await new Promise<number>((resolve, reject) => {
        const req = httpRequest(
          {
            hostname: '127.0.0.1',
            port,
            method: 'POST',
            path: '/api/v1/auth/login',
            headers: {
              'Content-Type': 'application/json',
              'Transfer-Encoding': 'chunked',
            },
          },
          (res) => {
            res.resume();
            res.once('end', () => resolve(res.statusCode));
          },
        );
        req.on('error', reject);
        req.write('{"data":"');
        for (let i = 0; i < 20; i++) req.write('a'.repeat(1024));
        req.end('"}');
      });
      expect(status).toBe(413);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
