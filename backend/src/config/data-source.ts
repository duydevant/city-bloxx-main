import 'dotenv/config';
import { DataSource } from 'typeorm';
import { typeormOptions } from './typeorm-options';

const dataSource = new DataSource(typeormOptions);

export default dataSource;
