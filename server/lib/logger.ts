/**
 * Simple logger with configurable log levels
 * Reduces debug noise in production
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

class Logger {
  private level: LogLevel;
  private isDevelopment: boolean;

  constructor() {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const logLevelEnv = process.env.LOG_LEVEL;
    
    this.isDevelopment = nodeEnv === 'development';
    
    // Default log levels based on environment
    if (logLevelEnv) {
      this.level = this.parseLogLevel(logLevelEnv);
    } else {
      // Development: show all logs
      // Production: only show INFO and above
      this.level = this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;
    }
  }

  private parseLogLevel(level: string): LogLevel {
    const normalized = level.toUpperCase();
    switch (normalized) {
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      case 'SILENT': return LogLevel.SILENT;
      default: return LogLevel.INFO;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}]`;
    return `${prefix} ${args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : arg
    ).join(' ')}`;
  }

  /**
   * Debug logs - only in development or when LOG_LEVEL=DEBUG
   * Use for: detailed debugging info, request/response details
   */
  debug(...args: any[]) {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage('DEBUG', ...args));
    }
  }

  /**
   * Info logs - important operational messages
   * Use for: server startup, successful operations, stats
   */
  info(...args: any[]) {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage('INFO', ...args));
    }
  }

  /**
   * Warning logs - potential issues
   * Use for: deprecations, fallbacks, retries
   */
  warn(...args: any[]) {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', ...args));
    }
  }

  /**
   * Error logs - actual errors
   * Use for: exceptions, failed operations
   */
  error(...args: any[]) {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage('ERROR', ...args));
    }
  }

  /**
   * Always log - bypasses log level check
   * Use sparingly for critical startup messages
   */
  always(...args: any[]) {
    console.log(...args);
  }

  /**
   * Get current log level
   */
  getLevel(): string {
    return LogLevel[this.level];
  }

  /**
   * Check if debug is enabled
   */
  isDebugEnabled(): boolean {
    return this.shouldLog(LogLevel.DEBUG);
  }
}

// Export singleton instance
export const logger = new Logger();

// Convenience methods for common patterns
export const log = {
  // Startup messages (always show)
  startup: (...args: any[]) => logger.always(...args),
  
  // Debug (development only)
  debug: (...args: any[]) => logger.debug(...args),
  
  // Info (production + development)
  info: (...args: any[]) => logger.info(...args),
  
  // Warnings (always show)
  warn: (...args: any[]) => logger.warn(...args),
  
  // Errors (always show)
  error: (...args: any[]) => logger.error(...args),
  
  // Payment/transaction logs (info level)
  payment: (...args: any[]) => logger.info('💰', ...args),
  
  // Mint logs (info level)
  mint: (...args: any[]) => logger.info('🪙', ...args),
  
  // Verification logs (info level)  
  verify: (...args: any[]) => logger.info('🔍', ...args),
  
  // Success logs (info level)
  success: (...args: any[]) => logger.info('✅', ...args),
  
  // Failure logs (error level)
  failure: (...args: any[]) => logger.error('❌', ...args),
};

