const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../../src/utils/logger');
const guard = require('../../src/secure/guard');

class AuthManager {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || this.generateRandomSecret();
    this.tokenBlacklist = new Set();
    this.loginAttempts = new Map();
    this.maxLoginAttempts = 5;
    this.lockoutTime = 15 * 60 * 1000; // 15 minutes
    
    // Cleanup blacklist periodically
    setInterval(() => this.cleanupBlacklist(), 3600000); // Every hour
  }

  generateRandomSecret() {
    return crypto.randomBytes(64).toString('hex');
  }

  // Generate JWT token
  generateToken(userData) {
    const payload = {
      uid: userData.uid,
      name: userData.name,
      isOwner: userData.isOwner,
      isAdmin: userData.isAdmin,
      permissions: this.getPermissions(userData),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };

    return jwt.sign(payload, this.jwtSecret);
  }

  getPermissions(userData) {
    const permissions = ['read:basic'];
    
    if (userData.isAdmin || userData.isOwner) {
      permissions.push('read:admin', 'write:admin', 'execute:commands');
    }
    
    if (userData.isOwner) {
      permissions.push('read:owner', 'write:owner', 'execute:system', 'manage:users');
    }
    
    return permissions;
  }

  // Verify JWT token
  verifyToken(token) {
    try {
      // Check if token is blacklisted
      if (this.tokenBlacklist.has(token)) {
        throw new Error('Token is blacklisted');
      }

      const decoded = jwt.verify(token, this.jwtSecret);
      return {
        valid: true,
        data: decoded,
        expired: false
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        expired: error.name === 'TokenExpiredError'
      };
    }
  }

  // Blacklist token (for logout)
  blacklistToken(token) {
    const result = this.verifyToken(token);
    if (result.valid && result.data.exp) {
      // Store until expiration
      const expiresIn = result.data.exp * 1000 - Date.now();
      this.tokenBlacklist.add(token);
      
      // Auto-remove after expiration
      setTimeout(() => {
        this.tokenBlacklist.delete(token);
      }, expiresIn);
      
      return true;
    }
    return false;
  }

  // Cleanup expired tokens from blacklist
  cleanupBlacklist() {
    const now = Date.now();
    // We'll check tokens when they're used, not proactively
    // This just limits the size
    if (this.tokenBlacklist.size > 1000) {
      // Remove oldest tokens (FIFO)
      const iterator = this.tokenBlacklist.values();
      for (let i = 0; i < 100; i++) {
        const token = iterator.next().value;
        if (token) this.tokenBlacklist.delete(token);
      }
    }
  }

  // Rate limiting for login attempts
  checkLoginAttempts(ip) {
    const attempts = this.loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
    
    if (attempts.lockedUntil > Date.now()) {
      const remainingMinutes = Math.ceil((attempts.lockedUntil - Date.now()) / 60000);
      throw new Error(`Too many login attempts. Try again in ${remainingMinutes} minutes.`);
    }
    
    return attempts;
  }

  recordLoginAttempt(ip, success) {
    let attempts = this.loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
    
    if (success) {
      // Reset on successful login
      attempts.count = 0;
      attempts.lockedUntil = 0;
    } else {
      attempts.count++;
      
      if (attempts.count >= this.maxLoginAttempts) {
        attempts.lockedUntil = Date.now() + this.lockoutTime;
        logger.warn('IP locked due to too many failed login attempts', { ip });
      }
    }
    
    this.loginAttempts.set(ip, attempts);
    
    // Cleanup old entries
    if (this.loginAttempts.size > 1000) {
      const iterator = this.loginAttempts.entries();
      for (let i = 0; i < 100; i++) {
        const [key] = iterator.next().value || [];
        if (key) this.loginAttempts.delete(key);
      }
    }
  }

  // Permission checking middleware
  requirePermission(permission) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      if (!req.user.permissions || !req.user.permissions.includes(permission)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      
      next();
    };
  }

  // Role-based middleware
  requireOwner() {
    return (req, res, next) => {
      if (!req.user || !req.user.isOwner) {
        return res.status(403).json({ error: 'Owner access required' });
      }
      next();
    };
  }

  requireAdmin() {
    return (req, res, next) => {
      if (!req.user || (!req.user.isAdmin && !req.user.isOwner)) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      next();
    };
  }

  // API key authentication (for external services)
  validateApiKey(apiKey) {
    // In production, store API keys in database
    const validKeys = process.env.API_KEYS ? process.env.API_KEYS.split(',') : [];
    
    if (validKeys.includes(apiKey)) {
      return {
        valid: true,
        type: 'api_key',
        permissions: ['read:basic', 'read:admin']
      };
    }
    
    return { valid: false };
  }

  // Two-factor authentication (simplified)
  async generate2FACode(userId) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    
    // Store code (in production, use Redis or database)
    if (!global.twoFACodes) {
      global.twoFACodes = new Map();
    }
    
    global.twoFACodes.set(`${userId}:${code}`, {
      userId,
      code,
      expiresAt
    });
    
    // Cleanup expired codes
    setTimeout(() => {
      global.twoFACodes.delete(`${userId}:${code}`);
    }, 10 * 60 * 1000);
    
    return code;
  }

  verify2FACode(userId, code) {
    if (!global.twoFACodes) return false;
    
    const key = `${userId}:${code}`;
    const record = global.twoFACodes.get(key);
    
    if (!record || record.expiresAt < Date.now()) {
      return false;
    }
    
    // Remove used code
    global.twoFACodes.delete(key);
    
    return true;
  }

  // Session management
  createSession(userId, userAgent, ip) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const session = {
      id: sessionId,
      userId,
      userAgent,
      ip,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      active: true
    };
    
    // Store session (in production, use database)
    if (!global.sessions) {
      global.sessions = new Map();
    }
    
    global.sessions.set(sessionId, session);
    
    // Cleanup old sessions
    this.cleanupOldSessions();
    
    return sessionId;
  }

  getSession(sessionId) {
    if (!global.sessions) return null;
    
    const session = global.sessions.get(sessionId);
    
    if (session && session.active) {
      session.lastActive = new Date().toISOString();
      return session;
    }
    
    return null;
  }

  invalidateSession(sessionId) {
    if (global.sessions) {
      const session = global.sessions.get(sessionId);
      if (session) {
        session.active = false;
        session.endedAt = new Date().toISOString();
      }
    }
  }

  cleanupOldSessions() {
    if (!global.sessions) return;
    
    const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
    
    for (const [sessionId, session] of global.sessions.entries()) {
      if (new Date(session.lastActive).getTime() < cutoff) {
        global.sessions.delete(sessionId);
      }
    }
  }

  // Audit logging
  logAuthEvent(event, userId, ip, details = {}) {
    logger.info('Authentication event', {
      event,
      userId,
      ip,
      timestamp: new Date().toISOString(),
      ...details
    });
    
    // Store in database for audit trail
    this.storeAuditLog(event, userId, ip, details);
  }

  async storeAuditLog(event, userId, ip, details) {
    // In production, store in database
    const auditLog = {
      event,
      userId,
      ip,
      details,
      timestamp: new Date().toISOString(),
      userAgent: details.userAgent
    };
    
    // Append to file for now
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const logDir = path.join(__dirname, '../../data/logs/audit');
      await fs.mkdir(logDir, { recursive: true });
      
      const logFile = path.join(logDir, 'auth.log');
      await fs.appendFile(logFile, JSON.stringify(auditLog) + '\n');
    } catch (error) {
      logger.error('Failed to write audit log:', error);
    }
  }

  // Get statistics
  getAuthStats() {
    return {
      activeSessions: global.sessions ? Array.from(global.sessions.values()).filter(s => s.active).length : 0,
      totalSessions: global.sessions ? global.sessions.size : 0,
      blacklistedTokens: this.tokenBlacklist.size,
      loginAttempts: this.loginAttempts.size,
      twoFACodes: global.twoFACodes ? global.twoFACodes.size : 0
    };
  }
}

module.exports = new AuthManager();