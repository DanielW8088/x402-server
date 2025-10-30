import { http, FallbackTransport, fallback } from 'viem';

/**
 * RPC Load Balancer
 * Distributes RPC requests across multiple endpoints using round-robin
 */
export class RPCBalancer {
  private urls: string[];
  private currentIndex: number = 0;

  constructor(urls: string | string[]) {
    // Support both single URL and array of URLs
    this.urls = Array.isArray(urls) ? urls : [urls];
    
    if (this.urls.length === 0) {
      throw new Error('At least one RPC URL is required');
    }
  }

  /**
   * Get next RPC URL using round-robin
   */
  getNextUrl(): string {
    const url = this.urls[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.urls.length;
    return url;
  }

  /**
   * Get all URLs
   */
  getUrls(): string[] {
    return [...this.urls];
  }

  /**
   * Create viem transport with fallback support
   * Uses viem's built-in fallback mechanism for automatic failover
   */
  createTransport(config?: {
    timeout?: number;
    retryCount?: number;
    retryDelay?: number;
  }) {
    const { timeout = 30000, retryCount = 3, retryDelay = 1000 } = config || {};

    // If only one URL, use simple http transport
    if (this.urls.length === 1) {
      return http(this.urls[0], {
        timeout,
        retryCount,
        retryDelay,
      });
    }

    // Multiple URLs: use fallback transport for automatic failover
    // viem will automatically try the next URL if one fails
    const transports = this.urls.map(url =>
      http(url, {
        timeout,
        retryCount,
        retryDelay,
      })
    );

    return fallback(transports, {
      rank: false, // Don't rank by latency, use round-robin order
    });
  }

  /**
   * Get status info
   */
  getStatus() {
    return {
      totalUrls: this.urls.length,
      currentIndex: this.currentIndex,
      urls: this.urls,
    };
  }
}

/**
 * Normalize RPC URL
 * - Remove trailing slashes
 * - Trim whitespace
 */
function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Parse RPC URLs from environment variable
 * Supports comma-separated list: URL1,URL2,URL3
 */
export function parseRPCUrls(envValue: string | undefined, defaultUrl: string): string[] {
  if (!envValue) {
    return [normalizeUrl(defaultUrl)];
  }

  // Split by comma, trim whitespace, and normalize URLs
  const urls = envValue
    .split(',')
    .map(url => normalizeUrl(url))
    .filter(url => url.length > 0);

  return urls.length > 0 ? urls : [normalizeUrl(defaultUrl)];
}

/**
 * Create RPC balancer from environment variable
 */
export function createRPCBalancer(
  envValue: string | undefined,
  defaultUrl: string
): RPCBalancer {
  const urls = parseRPCUrls(envValue, defaultUrl);
  return new RPCBalancer(urls);
}

