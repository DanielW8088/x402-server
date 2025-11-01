import { readFileSync } from "fs";
import { Pool } from "pg";
import Redis from "ioredis";
import { databaseUrl, redisUrl } from "./env.js";

// Setup database pool with SSL support
const dbSslEnabled = process.env.DB_SSL_ENABLED !== 'false';
const isRemoteDB = databaseUrl && !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1');

// SSL certificate configuration
const sslConfig = (dbSslEnabled && isRemoteDB) ? (() => {
  const sslCA = process.env.DB_SSL_CA;
  const sslCert = process.env.DB_SSL_CERT;
  const sslKey = process.env.DB_SSL_KEY;
  
  if (sslCA || sslCert || sslKey) {
    return {
      rejectUnauthorized: true,
      ca: sslCA ? readFileSync(sslCA).toString() : undefined,
      cert: sslCert ? readFileSync(sslCert).toString() : undefined,
      key: sslKey ? readFileSync(sslKey).toString() : undefined,
    };
  }
  
  return {
    rejectUnauthorized: false
  };
})() : false;

export const pool = new Pool({
  connectionString: databaseUrl,
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
  ssl: sslConfig,
});

// Redis setup (will be initialized in initRedis)
export let redis: Redis | null = null;

export async function initRedis(): Promise<Redis | null> {
  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      },
      lazyConnect: true,
    });
    await redis.connect();
    return redis;
  } catch (err: any) {
    redis = null;
    return null;
  }
}

