import { INestApplication } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { configureApplication } from '../src/bootstrap';
import { setupSwagger } from '../src/common/docs/swagger';
import { AppModule } from '../src/modules/app.module';
import { InfrastructureService } from '../src/modules/security/infrastructure.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApplication(app);
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });
  it('reports dependency failures as 503 while liveness remains public', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    const query = jest
      .spyOn(app.get(DataSource), 'query')
      .mockRejectedValueOnce(new Error('offline'));
    try {
      await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
      expect(query).not.toHaveBeenCalled();
      await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
    } finally {
      query.mockRestore();
    }
    const ping = jest
      .spyOn(app.get(InfrastructureService).redis, 'ping')
      .mockRejectedValueOnce(new Error('offline'));
    try {
      await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
    } finally {
      ping.mockRestore();
    }
  });
  it('Swagger distinguishes public, bearer and cookie authentication', async () => {
    const response = await request(app.getHttpServer()).get('/swagger-json').expect(200);
    const document = response.body as OpenAPIObject;
    for (const route of [
      'register',
      'login',
      'forgot-password',
      'reset-password',
      'verify-email',
      'resend-verification',
    ]) {
      expect(document.paths[`/api/v1/auth/${route}`].post.security ?? []).toEqual([]);
    }
    expect(document.paths['/api/v1/auth/me'].get.security).toEqual([{ bearer: [] }]);
    expect(document.paths['/api/v1/auth/logout-all'].post.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/api/v1/auth/sessions'].get.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/api/v1/auth/sessions/{id}'].delete.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/api/v1/auth/refresh'].post.security).toEqual([
      { refresh_token: [] },
    ]);
    expect(document.paths['/api/v1/auth/logout'].post.security).toEqual([
      { bearer: [] },
      { refresh_token: [] },
    ]);
    expect(document.components.securitySchemes.refresh_token).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'refresh_token',
    });
  });
});
