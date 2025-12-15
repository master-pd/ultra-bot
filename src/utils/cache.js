const NodeCache = require('node-cache');
const logger = require('./logger');

class CacheManager {
  constructor() {
    this.cache = new NodeCache({
      stdTTL: 300, // 5 minutes default
      checkperiod: 60,
      useClones: false
    });
    
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }
  
  set(key, value, ttl = 300) {
    try {
      const success = this.cache.set(key, value, ttl);
      if (success) {
        this.stats.sets++;
        logger.info(`Cache set: ${key}`, { ttl });
      }
      return success;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }
  
  get(key) {
    try {
      const value = this.cache.get(key);
      if (value !== undefined) {
        this.stats.hits++;
        logger.debug(`Cache hit: ${key}`);
      } else {
        this.stats.misses++;
        logger.debug(`Cache miss: ${key}`);
      }
      return value;
    } catch (error) {
      logger.error('Cache get error:', error);
      return undefined;
    }
  }
  
  del(key) {
    try {
      const deleted = this.cache.del(key);
      if (deleted > 0) {
        this.stats.deletes++;
        logger.info(`Cache deleted: ${key}`);
      }
      return deleted;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return 0;
    }
  }
  
  flush() {
    try {
      this.cache.flushAll();
      logger.info('Cache flushed');
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  }
  
  getStats() {
    const cacheStats = this.cache.getStats();
    return {
      ...this.stats,
      keys: cacheStats.keys,
      total: this.stats.hits + this.stats.misses,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
    };
  }
  
  // Specialized cache methods for bot
  cacheUserInfo(userId, userInfo) {
    return this.set(`user:${userId}`, userInfo, 1800); // 30 minutes
  }
  
  getCachedUserInfo(userId) {
    return this.get(`user:${userId}`);
  }
  
  cacheThreadInfo(threadId, threadInfo) {
    return this.set(`thread:${threadId}`, threadInfo, 900); // 15 minutes
  }
  
  getCachedThreadInfo(threadId) {
    return this.get(`thread:${threadId}`);
  }
  
  cacheCommandResult(command, args, result) {
    const key = `cmd:${command}:${JSON.stringify(args).hashCode()}`;
    return this.set(key, result, 60); // 1 minute
  }
  
  getCachedCommandResult(command, args) {
    const key = `cmd:${command}:${JSON.stringify(args).hashCode()}`;
    return this.get(key);
  }
}

// String hash function
String.prototype.hashCode = function() {
  let hash = 0;
  for (let i = 0; i < this.length; i++) {
    const char = this.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
};

module.exports = new CacheManager();