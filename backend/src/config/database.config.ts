import { registerAs } from '@nestjs/config';
import { typeormOptions } from './typeorm-options';

export const databaseConfig = typeormOptions;

export default registerAs('database', () => databaseConfig);
