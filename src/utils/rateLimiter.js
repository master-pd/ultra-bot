const logger = require('./logger');

class RateLimiter {
  constructor() {
    this.limits = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Clean every minute
  }
  
  // Check if action is allowed
  check(key, limit, windowMs) {
    const now = Date.now();
    const userLimits = this.limits.get(key) || [];
    
    // Remove old entries
    const validLimits = userLimits.filter(time => now - time < windowMs);
    
    if (validLimits.length >= limit) {
      logger.warn(`Rate limit exceeded for key: ${key}`, {
        attempts: validLimits.length,
        limit,
        windowMs
      });
      return false;
    }
    
    // Add new attempt
    validLimits.push(now);
    this.limits.set(key, validLimits);
    
    return true;
  }
  
  // Bot-specific rate limiting
  checkUserCommand(userId) {
    const limit = 30; // 30 commands per minute
    const windowMs = 60000; // 1 minute
    return this.check(`user:cmd:${userId}`, limit, windowMs);
  }
  
  checkThreadMessage(threadId) {
    const limit = 50; // 50 messages per minute per thread
    const windowMs = 60000;
    return this.check(`thread:msg:${threadId}`, limit, windowMs);
  }
  
  checkFunCommand(userId, funType) {
    const limit = 5; // 5 fun starts per minute per user
    const windowMs = 60000;
    return this.check(`user:fun:${userId}:${funType}`, limit, windowMs);
  }
  
  checkAdminAction(userId) {
    const limit = 20; // 20 admin actions per minute
    const windowMs = 60000;
    return this.check(`user:admin:${userId}`, limit, windowMs);
  }
  
  // Get user's current rate limit status
  getUserStatus(userId) {
    const now = Date.now();
    const userKey = `user:cmd:${userId}`;
    const userLimits = this.limits.get(userKey) || [];
    const recent = userLimits.filter(time => now - time < 60000);
    
    return {
      userId,
      recentAttempts: recent.length,
      limit: 30,
      remaining: Math.max(0, 30 - recent.length),
      resetIn: 60000 - (now - (recent[0] || now))
    };
  }
  
  // Cleanup old entries
  cleanup() {
    const now = Date.now();
    const hourAgo = now - 3600000;
    
    for (const [key, times] of this.limits.entries()) {
      const validTimes = times.filter(time => time > hourAgo);
      if (validTimes.length === 0) {
        this.limits.delete(key);
      } else {
        this.limits.set(key, validTimes);
      }
    }
  }
  
  // Reset limits for a key
  reset(key) {
    this.limits.delete(key);
    logger.info(`Rate limits reset for key: ${key}`);
  }
  
  // Get all rate limit stats
  getStats() {
    const stats = {
      totalUsers: 0,
      totalThreads: 0,
      totalBlocks: 0,
      detailed: {}
    };
    
    for (const [key, times] of this.limits.entries()) {
      const recent = times.filter(time => Date.now() - time < 60000);
      stats.detailed[key] = {
        attempts: times.length,
        recentAttempts: recent.length,
        lastAttempt: times[times.length - 1] || null
      };
      
      if (key.startsWith('user:')) stats.totalUsers++;
      if (key.startsWith('thread:')) stats.totalThreads++;
    }
    
    return stats;
  }
}

module.exports = new RateLimiter();