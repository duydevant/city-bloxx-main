import { json, RequestHandler } from 'express';

// Select exactly one parser. The small auth parser must never run before a game parser.
export function boundedJson(): RequestHandler {
  const parsers = new Map(
    [16, 32, 256, 272].map((kib) => [
      kib,
      json({ limit: kib * 1024, inflate: false, strict: true }),
    ]),
  );
  return (req, res, next) => {
    const path = req.path.replace(/\/+$/, '').toLowerCase();
    const game = '/api/v1/city-bloxx';
    const limit =
      path === `${game}/save` || path === `${game}/save/resolve`
        ? 272
        : path === `${game}/runs/finish`
          ? 256
          : path === `${game}/analytics/events` ||
              path === `${game}/analytics/guest-events`
            ? 32
            : 16;
    if (
      req.headers['content-encoding'] &&
      req.headers['content-encoding'] !== 'identity'
    ) {
      res.status(415).json({ statusCode: 415, message: 'Unsupported content encoding' });
      return;
    }
    if (
      ['POST', 'PUT', 'PATCH'].includes(req.method) &&
      !req.is('application/json') &&
      (req.headers['transfer-encoding'] || Number(req.headers['content-length']) > 0)
    ) {
      res.status(415).json({ statusCode: 415, message: 'Expected application/json' });
      return;
    }
    parsers.get(limit)(req, res, (error?: { status?: number }) => {
      if (!error) return next();
      const status = error.status === 413 ? 413 : error.status === 415 ? 415 : 400;
      res.status(status).json({
        statusCode: status,
        message: status === 413 ? 'Request body too large' : 'Invalid JSON body',
      });
    });
  };
}
