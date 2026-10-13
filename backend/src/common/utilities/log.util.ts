import * as winston from 'winston';
import { WinstonModuleOptions } from 'nest-winston';
import { getAppConfig } from 'src/config';

export const getWinstonConfig = (appName: string): WinstonModuleOptions => {
  const { nodeEnv } = getAppConfig();

  const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize({ level: true, message: true }),
    winston.format.printf((info) => {
      const appPrefix = `[${appName}]`;
      const context = `[${typeof info.context === 'string' ? info.context : 'Application'}]`;

      let errorOutput = '';
      const error = info.error;
      if (typeof info.stack === 'string') {
        errorOutput = `\n\t${info.stack}`;
      } else if (error instanceof Error) {
        errorOutput = `\n\t${error.message}`;
      }

      const timestamp = typeof info.timestamp === 'string' ? info.timestamp : '';
      const message =
        typeof info.message === 'string' ? info.message : 'Structured event';
      return `${appPrefix} - ${timestamp}   ${context} ${info.level}: ${message} ${errorOutput}`;
    }),
  );

  return {
    transports: [
      // Console transport
      new winston.transports.Console({
        level: nodeEnv === 'production' ? 'info' : 'debug',
        format: consoleFormat,
        handleExceptions: true,
      }),
    ],
  };
};
