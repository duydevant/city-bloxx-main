import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { GameWorkerService } from '../city-bloxx/common/game-worker.service';
import { InfrastructureService } from '../security/infrastructure.service';
import { Public } from '../security/policy';

@Controller('health')
@Public()
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly infrastructure: InfrastructureService,
    private readonly workers: GameWorkerService,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    try {
      await Promise.all([
        this.workers.run({ operation: 'ping' }),
        this.dataSource.query('SELECT 1'),
        this.infrastructure.redis.ping().then((reply) => {
          if (reply !== 'PONG') throw new Error('Redis not ready');
        }),
      ]);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Dependencies unavailable');
    }
  }

  @Get()
  async check() {
    let db = 'up';
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      db = 'down';
    }
    return {
      status: db === 'up' ? 'ok' : 'error',
      db,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
