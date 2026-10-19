/**
 * Structured logger for the SCMS application.
 * Prefixes all messages with timestamp and level.
 * In production, this could be swapped for Winston/Pino.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const formatTimestamp = (): string => {
  return new Date().toISOString();
};

const shouldLog = (level: LogLevel): boolean => {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
};

export const logger = {
  debug: (message: string, ...args: unknown[]): void => {
    if (shouldLog('debug')) {
      console.debug(`[${formatTimestamp()}] [DEBUG] ${message}`, ...args);
    }
  },

  info: (message: string, ...args: unknown[]): void => {
    if (shouldLog('info')) {
      console.info(`[${formatTimestamp()}] [INFO]  ${message}`, ...args);
    }
  },

  warn: (message: string, ...args: unknown[]): void => {
    if (shouldLog('warn')) {
      console.warn(`[${formatTimestamp()}] [WARN]  ${message}`, ...args);
    }
  },

  error: (message: string, ...args: unknown[]): void => {
    if (shouldLog('error')) {
      console.error(`[${formatTimestamp()}] [ERROR] ${message}`, ...args);
    }
  },
};
