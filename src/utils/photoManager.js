const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('./logger');
const cache = require('./cache');

class PhotoManager {
  constructor() {
    this.ownerPhotos = [];
    this.adminPhotos = [];
    this.userPhotoCache = new Map();
    this.loadPhotos();
  }
  
  async loadPhotos() {
    try {
      // Load owner photos
      const ownerPhotosPath = path.join(__dirname, '../../assets/owner-photos/ownerPhotos.json');
      if (await fs.access(ownerPhotosPath).then(() => true).catch(() => false)) {
        this.ownerPhotos = JSON.parse(await fs.readFile(ownerPhotosPath, 'utf8'));
        logger.info(`Loaded ${this.ownerPhotos.length} owner photos`);
      }
      
      // Load admin photos
      const adminPhotosDir = path.join(__dirname, '../../data/admin-photos');
      if (await fs.access(adminPhotosDir).then(() => true).catch(() => false)) {
        const files = await fs.readdir(adminPhotosDir);
        this.adminPhotos = files.filter(f => f.match(/\.(png|jpg|jpeg)$/i))
          .map(f => path.join(adminPhotosDir, f))
          .slice(0, 3); // Limit to 3
        logger.info(`Loaded ${this.adminPhotos.length} admin photos`);
      }
    } catch (error) {
      logger.error('Error loading photos:', error);
    }
  }
  
  async getOwnerPhoto() {
    if (this.ownerPhotos.length === 0) {
      return null;
    }
    
    // Random selection from 10-12 photos
    const randomIndex = Math.floor(Math.random() * this.ownerPhotos.length);
    const photoUrl = this.ownerPhotos[randomIndex];
    
    // Cache the photo for faster access
    const cacheKey = `owner_photo_${randomIndex}`;
    let cached = cache.get(cacheKey);
    
    if (!cached) {
      try {
        // Download and cache the photo
        const response = await axios.get(photoUrl, { responseType: 'arraybuffer' });
        cached = Buffer.from(response.data);
        cache.set(cacheKey, cached, 3600); // Cache for 1 hour
        logger.debug(`Downloaded and cached owner photo ${randomIndex}`);
      } catch (error) {
        logger.error('Error downloading owner photo:', error);
        return null;
      }
    }
    
    return cached;
  }
  
  async getAdminPhoto(adminNumber = null) {
    if (this.adminPhotos.length === 0) {
      return this.getDefaultPhoto();
    }
    
    let photoPath;
    if (adminNumber !== null && adminNumber >= 1 && adminNumber <= 3) {
      photoPath = this.adminPhotos[adminNumber - 1];
    } else {
      // Random admin photo
      const randomIndex = Math.floor(Math.random() * this.adminPhotos.length);
      photoPath = this.adminPhotos[randomIndex];
    }
    
    try {
      return await fs.readFile(photoPath);
    } catch (error) {
      logger.error('Error reading admin photo:', error);
      return this.getDefaultPhoto();
    }
  }
  
  async getUserPhoto(userId, api) {
    const cacheKey = `user_photo_${userId}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    try {
      // Fetch user info from Facebook API
      const userInfo = await api.getUserInfo([userId]);
      const photoUrl = userInfo[userId]?.thumbSrc;
      
      if (!photoUrl) {
        return this.getDefaultPhoto();
      }
      
      // Download profile photo
      const response = await axios.get(photoUrl, { responseType: 'arraybuffer' });
      const photoBuffer = Buffer.from(response.data);
      
      // Cache for 5 minutes
      cache.set(cacheKey, photoBuffer, 300);
      
      return photoBuffer;
    } catch (error) {
      logger.error('Error fetching user photo:', error);
      return this.getDefaultPhoto();
    }
  }
  
  async getDefaultPhoto() {
    // Create a simple default image
    const defaultSvg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#4A90E2"/>
      <circle cx="100" cy="80" r="40" fill="#FFFFFF"/>
      <ellipse cx="100" cy="140" rx="60" ry="40" fill="#FFFFFF"/>
    </svg>`;
    
    return Buffer.from(defaultSvg);
  }
  
  async updateAdminPhoto(photoNumber, imageBuffer) {
    if (photoNumber < 1 || photoNumber > 3) {
      throw new Error('Photo number must be 1-3');
    }
    
    const adminPhotosDir = path.join(__dirname, '../../data/admin-photos');
    await fs.mkdir(adminPhotosDir, { recursive: true });
    
    const photoPath = path.join(adminPhotosDir, `admin${photoNumber}.png`);
    await fs.writeFile(photoPath, imageBuffer);
    
    // Update in-memory array
    this.adminPhotos[photoNumber - 1] = photoPath;
    
    logger.info(`Admin photo ${photoNumber} updated`);
    return photoPath;
  }
  
  async validateImage(buffer) {
    // Check file size (max 5MB)
    if (buffer.length > 5 * 1024 * 1024) {
      throw new Error('Image too large (max 5MB)');
    }
    
    // Check magic numbers for image formats
    const magic = buffer.toString('hex', 0, 4);
    
    const validFormats = {
      '89504e47': 'png', // PNG
      'ffd8ffe0': 'jpg', // JPEG
      'ffd8ffe1': 'jpg',
      '47494638': 'gif', // GIF
      '52494646': 'webp' // WEBP
    };
    
    if (!validFormats[magic]) {
      throw new Error('Invalid image format. Use PNG, JPG, GIF, or WEBP');
    }
    
    return validFormats[magic];
  }
  
  async compressImage(buffer, format) {
    // Simple compression - in production, use sharp or jimp
    if (buffer.length < 1024 * 1024) { // Less than 1MB
      return buffer;
    }
    
    // For now, just return original
    // TODO: Implement proper compression
    return buffer;
  }
  
  getStats() {
    return {
      ownerPhotos: this.ownerPhotos.length,
      adminPhotos: this.adminPhotos.length,
      cachedUserPhotos: cache.getStats().keys,
      cacheHitRate: cache.getStats().hitRate
    };
  }
}

module.exports = new PhotoManager();