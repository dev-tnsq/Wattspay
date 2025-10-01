import util from 'util';
import { env } from '../config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogFn = (message: string, meta?: Record<string, unknown>) => void;

const timestamp = () => new Date().toISOString();

const log = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
  const base = `[${timestamp()}] [${level.toUpperCase()}] ${message}`;
  if (meta && Object.keys(meta).length > 0) {
    // eslint-disable-next-line no-console
    console.log(`${base} ${util.inspect(meta, { depth: 5, colors: false })}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(base);
  }
};

export const logger: Record<LogLevel, LogFn> = {
  debug: (message, meta) => {
    if (env.NODE_ENV !== 'production') {
      log('debug', message, meta);
    }
  },
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
};
