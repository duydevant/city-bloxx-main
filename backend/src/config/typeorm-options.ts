import 'dotenv/config';
import path from 'path';
import { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

export const typeormOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'app_db',
  schema: process.env.DB_SCHEMA || 'public',
  synchronize: false,
  poolSize: 10,
  namingStrategy: new SnakeNamingStrategy(),
  entities: [path.join(__dirname, '../common/entities/**/*.entity{.ts,.js}')],
  migrations: [path.join(__dirname, '../database/migrations/*{.ts,.js}')],
  // Query errors may carry bound password hashes/tokens. Report sanitized failures above the DB layer.
  logging: false,
};
