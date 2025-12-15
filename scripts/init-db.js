const fs = require('fs').promises;
const path = require('path');
const logger = require('../src/utils/logger');

class DatabaseInitializer {
  constructor() {
    this.basePath = path.join(__dirname, '..');
    this.structure = {
      directories: [
        'data/logs',
        'data/fun-json',
        'data/admin-photos',
        'config',
        'assets/owner-photos',
        'assets/media',
        'backups',
        'scripts'
      ],
      files: {
        'config/config.json': {
          prefix: "!",
          admins: [],
          ownerUid: "61578706761898",
          funEnabled: true,
          maxAdminPhotos: 3,
          delayRange: [300, 600],
          _version: "1.0.0"
        },
        'config/settings.json': {
          bot: {
            name: "Ultra Professional Bot",
            version: "1.0.0",
            maintainer: "Bot Developer Team"
          },
          performance: {
            maxConcurrentThreads: 50
          }
        },
        'data/fun-json/chor.json': [
          "Chor detected! 🚨",
          "Ei je chor ke dhore fellam! 🏃‍♂️",
          "Chor er upor najar rakho 👀"
        ],
        'data/fun-json/murgi.json': [
          "Murgi pakha nei! 🐔",
          "Murgir dim kinte hobe 🥚",
          "Murgi khabo kire? 😋"
        ],
        'assets/owner-photos/ownerPhotos.json': [
          "https://i.ibb.co/XXXXXXX/owner1.png",
          "https://i.ibb.co/YYYYYYY/owner2.jpg",
          "https://i.ibb.co/ZZZZZZZ/owner3.png"
        ],
        '.env.example': `BOT_PREFIX=!
BOT_OWNER=61578706761898
NODE_ENV=production
LOG_LEVEL=info`
      }
    };
  }

  async initialize() {
    logger.info('Initializing bot database structure...');
    
    try {
      // Create directories
      for (const dir of this.structure.directories) {
        const dirPath = path.join(this.basePath, dir);
        await fs.mkdir(dirPath, { recursive: true });
        logger.debug(`Created directory: ${dir}`);
      }
      
      // Create files with default content
      for (const [filePath, content] of Object.entries(this.structure.files)) {
        const fullPath = path.join(this.basePath, filePath);
        
        // Check if file already exists
        const exists = await fs.access(fullPath).then(() => true).catch(() => false);
        
        if (!exists) {
          const contentStr = typeof content === 'object' 
            ? JSON.stringify(content, null, 2) 
            : content;
          
          await fs.writeFile(fullPath, contentStr);
          logger.debug(`Created file: ${filePath}`);
        } else {
          logger.debug(`File already exists: ${filePath}`);
        }
      }
      
      // Create owner lock file
      await this.createOwnerLock();
      
      // Create initial admin photos
      await this.createDefaultAdminPhotos();
      
      logger.info('✅ Database initialization completed successfully');
      
      this.printNextSteps();
      
    } catch (error) {
      logger.error('Initialization failed:', error);
      throw error;
    }
  }

  async createOwnerLock() {
    const crypto = require('crypto');
    const config = require('../config/config.json');
    
    const hashUid = (uid) => {
      return crypto.createHash('sha256').update(uid.toString()).digest('hex');
    };
    
    const lockData = {
      ownerHash: hashUid(config.ownerUid),
      ownerUid: config.ownerUid,
      lockedAt: new Date().toISOString(),
      _note: "DO NOT MODIFY OR SHARE THIS FILE"
    };
    
    const lockPath = path.join(this.basePath, 'src/secure/owner.lock');
    await fs.writeFile(lockPath, JSON.stringify(lockData, null, 2));
    
    logger.info(`Owner lock created for UID: ${config.ownerUid}`);
  }

  async createDefaultAdminPhotos() {
    // Create default admin photos using canvas or placeholders
    const adminPhotosDir = path.join(this.basePath, 'data/admin-photos');
    
    // Create simple SVG placeholder images
    const createSvg = (number, color) => `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${color}"/>
        <text x="50%" y="50%" font-family="Arial" font-size="48" 
              fill="white" text-anchor="middle" dy=".3em">
          Admin ${number}
        </text>
        <text x="50%" y="70%" font-family="Arial" font-size="16"
              fill="white" text-anchor="middle">
          Replace with your photo
        </text>
      </svg>
    `;
    
    const colors = ['#4A90E2', '#7B68EE', '#20B2AA'];
    
    for (let i = 1; i <= 3; i++) {
      const svgContent = createSvg(i, colors[i - 1]);
      const filePath = path.join(adminPhotosDir, `admin${i}.png`);
      
      // Note: In production, you might want to use a library like canvas
      // to create actual PNG images. For now, we'll create SVG files.
      const svgPath = path.join(adminPhotosDir, `admin${i}.svg`);
      await fs.writeFile(svgPath, svgContent);
      
      logger.debug(`Created admin photo placeholder: admin${i}.svg`);
    }
  }

  printNextSteps() {
    console.log(`
🎉 BOT INITIALIZATION COMPLETE

Next Steps:
1. Edit configuration files:
   - config/config.json: Add admin UIDs, change prefix
   - assets/owner-photos/ownerPhotos.json: Add 10-12 image URLs

2. Set up Facebook login:
   - Place your appstate.json in src/secure/appstats.json
   - Or use facebook-chat-api to generate session

3. Install dependencies:
   $ npm install

4. Start the bot:
   $ npm start

5. For production:
   $ npm run build
   $ pm2 start main.js --name messenger-bot

Configuration Checklist:
- [ ] Owner UID set in config.json
- [ ] Admin UIDs added
- [ ] Owner photos added (10-12 URLs)
- [ ] Facebook session configured
- [ ] Fun JSON files populated

Need help? Check README.md for detailed instructions.
    `);
  }

  async validateStructure() {
    logger.info('Validating database structure...');
    
    const errors = [];
    const warnings = [];
    
    // Check required directories
    for (const dir of this.structure.directories) {
      const dirPath = path.join(this.basePath, dir);
      try {
        await fs.access(dirPath);
      } catch {
        errors.push(`Missing directory: ${dir}`);
      }
    }
    
    // Check required files
    for (const file of Object.keys(this.structure.files)) {
      const filePath = path.join(this.basePath, file);
      try {
        await fs.access(filePath);
      } catch {
        warnings.push(`Missing file: ${file} (will be created)`);
      }
    }
    
    // Check owner lock
    const lockPath = path.join(this.basePath, 'src/secure/owner.lock');
    try {
      await fs.access(lockPath);
    } catch {
      errors.push('Missing owner.lock file - run initialization first');
    }
    
    // Check node_modules
    const nodeModulesPath = path.join(this.basePath, 'node_modules');
    try {
      await fs.access(nodeModulesPath);
    } catch {
      warnings.push('node_modules not found - run npm install');
    }
    
    // Print results
    if (errors.length > 0) {
      logger.error('Validation errors:');
      errors.forEach(err => logger.error(`  ❌ ${err}`));
    }
    
    if (warnings.length > 0) {
      logger.warn('Validation warnings:');
      warnings.forEach(warn => logger.warn(`  ⚠️ ${warn}`));
    }
    
    if (errors.length === 0 && warnings.length === 0) {
      logger.info('✅ All checks passed! Bot structure is valid.');
    }
    
    return { errors, warnings };
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'init';
  
  const initializer = new DatabaseInitializer();
  
  switch (command) {
    case 'init':
      initializer.initialize();
      break;
      
    case 'validate':
      initializer.validateStructure();
      break;
      
    case 'reset':
      console.log('This will reset all data. Are you sure? (yes/no)');
      process.stdin.once('data', async (data) => {
        if (data.toString().trim().toLowerCase() === 'yes') {
          await initializer.initialize();
          console.log('✅ Reset completed');
        } else {
          console.log('Reset cancelled');
        }
        process.exit();
      });
      break;
      
    default:
      console.log(`
Usage: node scripts/init-db.js [command]
      
Commands:
  init     - Initialize database structure (default)
  validate - Validate current structure
  reset    - Reset all data (WARNING: destructive)
      `);
  }
}

module.exports = DatabaseInitializer;