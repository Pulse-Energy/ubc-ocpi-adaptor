import winston from 'winston';
import { getLoggerConfig } from '../config/logger.config';

class LoggerService {
    private logger: winston.Logger;
    private correlationId?: string;

    constructor() {
        this.logger = winston.createLogger(getLoggerConfig());
    }

    setCorrelationId(id: string): void {
        this.correlationId = id;
    }

    private getMeta(): Record<string, any> {
        const meta: Record<string, any> = {};
        if (this.correlationId) {
            meta.correlationId = this.correlationId;
        }
        return meta;
    }

    error(message: string, error?: Error, meta?: Record<string, any>): void {
        const allMeta = { ...this.getMeta(), ...meta };
        if (error) {
            allMeta.error = {
                message: error.message,
                stack: error.stack,
                name: error.name,
            };
        }
        this.logger.error(message, allMeta);
    }

    warn(message: string, meta?: Record<string, any>): void {
        this.logger.warn(message, { ...this.getMeta(), ...meta });
    }

    info(message: string, meta?: Record<string, any>): void {
        this.logger.info(message, { ...this.getMeta(), ...meta });
    }

    debug(message: string, meta?: Record<string, any>): void {
        this.logger.debug(message, { ...this.getMeta(), ...meta });
    }
}

export const logger = new LoggerService();
