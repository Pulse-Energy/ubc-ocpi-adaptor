import Redis from 'ioredis';
import { redisConfig } from '../config/redis.config';
import { logger } from './logger.service';

class CacheService {
    private client: Redis | null = null;
    private enabled: boolean = false;

    constructor() {
        // Redis is disabled - cache service is not used
        // This prevents connection attempts
        this.enabled = false;
    }

    private setupEventHandlers(): void {
        if (!this.client) return;
        
        this.client.on('connect', () => {
            logger.info('Redis client connected');
        });

        this.client.on('error', (error) => {
            logger.error('Redis client error', error);
        });

        this.client.on('close', () => {
            logger.warn('Redis client connection closed');
        });
    }

    async get<T>(key: string): Promise<T | null> {
        if (!this.enabled || !this.client) return null;
        try {
            const value = await this.client.get(key);
            if (!value) return null;
            return JSON.parse(value) as T;
        }
        catch (error) {
            logger.error(`Error getting cache key: ${key}`, error as Error);
            return null;
        }
    }

    async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
        if (!this.enabled || !this.client) return false;
        try {
            const serialized = JSON.stringify(value);
            if (ttlSeconds) {
                await this.client.setex(key, ttlSeconds, serialized);
            }
            else {
                await this.client.set(key, serialized);
            }
            return true;
        }
        catch (error) {
            logger.error(`Error setting cache key: ${key}`, error as Error);
            return false;
        }
    }

    async delete(key: string): Promise<boolean> {
        if (!this.enabled || !this.client) return false;
        try {
            await this.client.del(key);
            return true;
        }
        catch (error) {
            logger.error(`Error deleting cache key: ${key}`, error as Error);
            return false;
        }
    }

    async exists(key: string): Promise<boolean> {
        if (!this.enabled || !this.client) return false;
        try {
            const result = await this.client.exists(key);
            return result === 1;
        }
        catch (error) {
            logger.error(`Error checking cache key existence: ${key}`, error as Error);
            return false;
        }
    }

    async flush(): Promise<void> {
        if (!this.enabled || !this.client) return;
        try {
            await this.client.flushdb();
            logger.info('Redis cache flushed');
        }
        catch (error) {
            logger.error('Error flushing cache', error as Error);
        }
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.quit();
        }
    }
}

export const cacheService = new CacheService();
