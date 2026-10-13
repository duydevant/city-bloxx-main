import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from '../security/policy';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

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
