const guard = require('../secure/guard');

class Validator {
  static isValidFacebookID(id) {
    return /^\d+$/.test(id.toString()) && id.toString().length >= 10;
  }
  
  static isValidCommandInput(input, minLength = 1, maxLength = 1000) {
    if (!input || typeof input !== 'string') return false;
    if (input.length < minLength || input.length > maxLength) return false;
    
    // Check for malicious patterns
    const maliciousPatterns = [
      /<script>/i,
      /javascript:/i,
      /onload=/i,
      /onerror=/i,
      /eval\(/i,
      /document\./i,
      /window\./i,
      /localStorage\./i,
      /process\./i,
      /require\(/i,
      /fs\./i,
      /child_process/i
    ];
    
    return !maliciousPatterns.some(pattern => pattern.test(input));
  }
  
  static isValidURL(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
  
  static isValidImageURL(url) {
    if (!this.isValidURL(url)) return false;
    
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    return imageExtensions.some(ext => url.toLowerCase().endsWith(ext));
  }
  
  static validateAdminAction(userId, targetUserId) {
    // Admin can't modify other admins or owner
    if (guard.isAdmin(userId) && guard.isAdmin(targetUserId)) {
      return { valid: false, error: 'Cannot modify other admins' };
    }
    
    if (guard.isAdmin(userId) && guard.isOwner(targetUserId)) {
      return { valid: false, error: 'Cannot modify owner' };
    }
    
    return { valid: true };
  }
}

module.exports = Validator;