export class Logger {
  constructor(private readonly scope: string) {}

  info(message: string, extra?: Record<string, unknown>) {
    console.log(`[${this.scope}] ${message}`, extra ?? '');
  }

  warn(message: string, extra?: Record<string, unknown>) {
    console.warn(`[${this.scope}] ${message}`, extra ?? '');
  }

  error(message: string, extra?: Record<string, unknown>) {
    console.error(`[${this.scope}] ${message}`, extra ?? '');
  }
}

export const createLogger = (scope: string) => new Logger(scope);
