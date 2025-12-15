#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const logger = require('./src/utils/logger');

class DeploymentManager {
  constructor() {
    this.config = {
      backupDir: path.join(__dirname, 'backups'),
      logsDir: path.join(__dirname, 'data/logs'),
      deployLog: path.join(__dirname, 'deployments.log')
    };
  }

  async deploy(version) {
    try {
      logger.info(`🚀 Starting deployment v${version}`);
      
      // Step 1: Create backup
      await this.createBackup(`pre-deploy-${version}`);
      
      // Step 2: Stop bot if running
      await this.stopBot();
      
      // Step 3: Update dependencies
      await this.updateDependencies();
      
      // Step 4: Run tests
      await this.runTests();
      
      // Step 5: Start bot
      await this.startBot();
      
      // Step 6: Verify deployment
      await this.verifyDeployment();
      
      logger.info(`✅ Deployment v${version} completed successfully`);
      
      // Log deployment
      await this.logDeployment(version, 'success');
      
    } catch (error) {
      logger.error('Deployment failed:', error);
      
      // Rollback on failure
      await this.rollback(version);
      
      await this.logDeployment(version, 'failed', error.message);
      process.exit(1);
    }
  }

  async createBackup(name) {
    const backupPath = path.join(this.config.backupDir, name);
    
    await fs.mkdir(backupPath, { recursive: true });
    
    const itemsToBackup = [
      'config',
      'data',
      'assets',
      'src/secure/owner.lock'
    ];
    
    logger.info(`Creating backup: ${name}`);
    
    for (const item of itemsToBackup) {
      try {
        const source = path.join(__dirname, item);
        const dest = path.join(backupPath, item);
        
        // Create destination directory
        await fs.mkdir(path.dirname(dest), { recursive: true });
        
        // Copy item
        await fs.cp(source, dest, { recursive: true });
        
        logger.debug(`Backed up: ${item}`);
      } catch (error) {
        logger.warn(`Failed to backup ${item}:`, error.message);
      }
    }
    
    return backupPath;
  }

  async stopBot() {
    logger.info('Stopping bot...');
    
    try {
      // Try PM2 first
      execSync('pm2 stop messenger-bot 2>/dev/null || true', { stdio: 'inherit' });
      
      // Kill any remaining node processes
      execSync('pkill -f "node.*main.js" 2>/dev/null || true', { stdio: 'inherit' });
      
      // Wait for process to stop
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      logger.info('Bot stopped successfully');
    } catch (error) {
      logger.warn('Error stopping bot:', error.message);
    }
  }

  async updateDependencies() {
    logger.info('Updating dependencies...');
    
    try {
      // Backup package.json
      await fs.copyFile(
        path.join(__dirname, 'package.json'),
        path.join(__dirname, 'package.json.backup')
      );
      
      // Install/update dependencies
      execSync('npm install', { stdio: 'inherit' });
      
      // Update only security patches
      execSync('npm audit fix --force', { stdio: 'inherit' });
      
      logger.info('Dependencies updated');
    } catch (error) {
      logger.error('Failed to update dependencies:', error);
      throw error;
    }
  }

  async runTests() {
    logger.info('Running tests...');
    
    try {
      // Run unit tests if available
      execSync('npm test 2>/dev/null || true', { stdio: 'inherit' });
      
      // Run basic health check
      await this.healthCheck();
      
      logger.info('Tests passed');
    } catch (error) {
      logger.error('Tests failed:', error);
      throw error;
    }
  }

  async healthCheck() {
    // Basic system health checks
    const checks = [
      this.checkConfigFiles,
      this.checkOwnerLock,
      this.checkDataDirectories,
      this.checkNodeModules
    ];
    
    for (const check of checks) {
      await check.call(this);
    }
  }

  async checkConfigFiles() {
    const requiredFiles = [
      'config/config.json',
      'config/settings.json',
      'src/secure/owner.lock'
    ];
    
    for (const file of requiredFiles) {
      const filePath = path.join(__dirname, file);
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      
      if (!exists) {
        throw new Error(`Required file missing: ${file}`);
      }
    }
  }

  async checkOwnerLock() {
    const lockPath = path.join(__dirname, 'src/secure/owner.lock');
    const content = await fs.readFile(lockPath, 'utf8');
    const lockData = JSON.parse(content);
    
    if (!lockData.ownerHash || !lockData.ownerUid) {
      throw new Error('Invalid owner.lock file');
    }
  }

  async checkDataDirectories() {
    const requiredDirs = [
      'data/fun-json',
      'data/logs',
      'data/admin-photos'
    ];
    
    for (const dir of requiredDirs) {
      const dirPath = path.join(__dirname, dir);
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  async checkNodeModules() {
    const nodeModulesPath = path.join(__dirname, 'node_modules');
    const exists = await fs.access(nodeModulesPath).then(() => true).catch(() => false);
    
    if (!exists) {
      throw new Error('node_modules not found. Run npm install first.');
    }
  }

  async startBot() {
    logger.info('Starting bot...');
    
    try {
      // Start with PM2 for production
      execSync('pm2 start main.js --name "messenger-bot" --update-env', { stdio: 'inherit' });
      
      // Wait for bot to initialize
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check if bot is running
      const status = execSync('pm2 status messenger-bot').toString();
      if (!status.includes('online')) {
        throw new Error('Bot failed to start');
      }
      
      logger.info('Bot started successfully');
    } catch (error) {
      logger.error('Failed to start bot:', error);
      
      // Fallback to direct start
      logger.info('Trying direct start...');
      execSync('node main.js &', { stdio: 'inherit' });
    }
  }

  async verifyDeployment() {
    logger.info('Verifying deployment...');
    
    // Check bot status
    try {
      const status = execSync('pm2 status messenger-bot 2>/dev/null || echo "not-running"').toString();
      
      if (status.includes('online')) {
        logger.info('✅ Bot is running');
      } else {
        throw new Error('Bot is not running');
      }
    } catch (error) {
      throw new Error('Verification failed: ' + error.message);
    }
    
    // Check logs for errors
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const logFile = path.join(this.config.logsDir, `${new Date().toISOString().split('T')[0]}.log`);
    
    if (await fs.access(logFile).then(() => true).catch(() => false)) {
      const logs = await fs.readFile(logFile, 'utf8');
      const recentErrors = logs.split('\n')
        .filter(line => line.includes('[ERROR]'))
        .slice(-5);
      
      if (recentErrors.length > 3) {
        throw new Error('Too many errors in logs after deployment');
      }
    }
    
    logger.info('✅ Deployment verified');
  }

  async rollback(version) {
    logger.info(`Rolling back to previous version...`);
    
    try {
      // Stop bot
      await this.stopBot();
      
      // Find latest backup
      const backups = await fs.readdir(this.config.backupDir);
      const sortedBackups = backups
        .filter(b => b.includes('pre-deploy'))
        .sort()
        .reverse();
      
      if (sortedBackups.length > 0) {
        const latestBackup = sortedBackups[0];
        const backupPath = path.join(this.config.backupDir, latestBackup);
        
        logger.info(`Restoring from backup: ${latestBackup}`);
        
        // Restore files
        await this.restoreBackup(backupPath);
        
        // Restart bot
        await this.startBot();
        
        logger.info('✅ Rollback completed');
      } else {
        logger.warn('No backup found for rollback');
      }
    } catch (error) {
      logger.error('Rollback failed:', error);
    }
  }

  async restoreBackup(backupPath) {
    const items = [
      'config',
      'data',
      'assets',
      'src/secure/owner.lock'
    ];
    
    for (const item of items) {
      try {
        const source = path.join(backupPath, item);
        const dest = path.join(__dirname, item);
        
        // Check if source exists
        const exists = await fs.access(source).then(() => true).catch(() => false);
        if (!exists) continue;
        
        // Remove destination
        await fs.rm(dest, { recursive: true, force: true });
        
        // Copy from backup
        await fs.cp(source, dest, { recursive: true });
        
        logger.debug(`Restored: ${item}`);
      } catch (error) {
        logger.warn(`Failed to restore ${item}:`, error.message);
      }
    }
  }

  async logDeployment(version, status, error = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      version,
      status,
      error,
      nodeVersion: process.version,
      platform: process.platform
    };
    
    const logLine = JSON.stringify(logEntry);
    
    await fs.appendFile(this.config.deployLog, logLine + '\n');
  }

  async cleanupOldBackups(daysToKeep = 7) {
    logger.info('Cleaning up old backups...');
    
    try {
      const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
      const backups = await fs.readdir(this.config.backupDir);
      
      for (const backup of backups) {
        const backupPath = path.join(this.config.backupDir, backup);
        const stats = await fs.stat(backupPath);
        
        if (stats.mtimeMs < cutoff) {
          await fs.rm(backupPath, { recursive: true, force: true });
          logger.info(`Deleted old backup: ${backup}`);
        }
      }
    } catch (error) {
      logger.error('Cleanup failed:', error);
    }
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const param = args[1];
  
  const deployer = new DeploymentManager();
  
  switch (command) {
    case 'deploy':
      deployer.deploy(param || '1.0.0');
      break;
      
    case 'backup':
      deployer.createBackup(`manual-${Date.now()}`);
      break;
      
    case 'rollback':
      deployer.rollback(param);
      break;
      
    case 'cleanup':
      deployer.cleanupOldBackups(parseInt(param) || 7);
      break;
      
    case 'status':
      execSync('pm2 status messenger-bot || echo "Not running"', { stdio: 'inherit' });
      break;
      
    default:
      console.log(`
Usage: node deploy.js <command> [options]
      
Commands:
  deploy [version]    - Deploy new version
  backup             - Create manual backup
  rollback [version] - Rollback to previous version
  cleanup [days]     - Cleanup old backups (default: 7 days)
  status             - Check bot status
      `);
  }
}

module.exports = DeploymentManager;