#!/usr/bin/env node

const schedule = require('node-schedule');
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const logger = require('../src/utils/logger');

class BackupScheduler {
  constructor() {
    this.backupDir = path.join(__dirname, '../backups');
    this.retentionDays = 30;
    this.schedules = {
      daily: '0 2 * * *',        // 2 AM daily
      weekly: '0 2 * * 0',       // 2 AM every Sunday
      monthly: '0 2 1 * *'       // 2 AM on 1st of month
    };
  }

  async start() {
    logger.info('Starting backup scheduler...');
    
    // Schedule daily backups
    schedule.scheduleJob(this.schedules.daily, async () => {
      await this.createBackup('daily');
      await this.cleanupOldBackups();
    });
    
    // Schedule weekly backups
    schedule.scheduleJob(this.schedules.weekly, async () => {
      await this.createBackup('weekly');
    });
    
    // Schedule monthly backups
    schedule.scheduleJob(this.schedules.monthly, async () => {
      await this.createBackup('monthly');
    });
    
    logger.info('Backup scheduler started');
    
    // Create initial backup
    await this.createBackup('initial');
  }

  async createBackup(type) {
    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .split('.')[0];
    
    const backupName = `${type}_${timestamp}`;
    const backupPath = path.join(this.backupDir, backupName);
    
    logger.info(`Creating ${type} backup: ${backupName}`);
    
    try {
      await fs.mkdir(backupPath, { recursive: true });
      
      // Backup items
      const items = [
        { source: '../config', dest: 'config' },
        { source: '../data', dest: 'data' },
        { source: '../assets', dest: 'assets' },
        { source: '../src/secure/owner.lock', dest: 'owner.lock' },
        { source: '../package.json', dest: 'package.json' }
      ];
      
      for (const item of items) {
        const source = path.join(__dirname, item.source);
        const dest = path.join(backupPath, item.dest);
        
        try {
          await fs.cp(source, dest, { recursive: true });
          logger.debug(`Backed up: ${item.source} -> ${item.dest}`);
        } catch (error) {
          logger.warn(`Failed to backup ${item.source}:`, error.message);
        }
      }
      
      // Create backup info file
      const info = {
        type,
        timestamp: new Date().toISOString(),
        version: require('../package.json').version,
        items: items.map(i => i.source),
        size: await this.getDirectorySize(backupPath)
      };
      
      await fs.writeFile(
        path.join(backupPath, 'backup-info.json'),
        JSON.stringify(info, null, 2)
      );
      
      logger.info(`✅ Backup created: ${backupName} (${info.size})`);
      
      return backupPath;
      
    } catch (error) {
      logger.error('Backup creation failed:', error);
      throw error;
    }
  }

  async getDirectorySize(dir) {
    let total = 0;
    
    const calculateSize = async (dirPath) => {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item.name);
        
        if (item.isDirectory()) {
          await calculateSize(itemPath);
        } else {
          const stats = await fs.stat(itemPath);
          total += stats.size;
        }
      }
    };
    
    await calculateSize(dir);
    
    // Format size
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = total;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  async cleanupOldBackups() {
    logger.info('Cleaning up old backups...');
    
    try {
      const items = await fs.readdir(this.backupDir);
      const cutoff = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
      
      let deletedCount = 0;
      
      for (const item of items) {
        const itemPath = path.join(this.backupDir, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.mtimeMs < cutoff) {
          await fs.rm(itemPath, { recursive: true, force: true });
          deletedCount++;
          logger.debug(`Deleted old backup: ${item}`);
        }
      }
      
      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} old backups`);
      }
      
    } catch (error) {
      logger.error('Cleanup failed:', error);
    }
  }

  async listBackups() {
    try {
      const items = await fs.readdir(this.backupDir, { withFileTypes: true });
      const backups = [];
      
      for (const item of items) {
        if (item.isDirectory()) {
          const backupPath = path.join(this.backupDir, item.name);
          const infoPath = path.join(backupPath, 'backup-info.json');
          
          try {
            const info = JSON.parse(await fs.readFile(infoPath, 'utf8'));
            backups.push({
              name: item.name,
              path: backupPath,
              ...info
            });
          } catch {
            // Backup without info file
            const stats = await fs.stat(backupPath);
            backups.push({
              name: item.name,
              path: backupPath,
              timestamp: stats.mtime.toISOString(),
              size: await this.getDirectorySize(backupPath)
            });
          }
        }
      }
      
      // Sort by timestamp (newest first)
      backups.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      
      return backups;
    } catch (error) {
      logger.error('Error listing backups:', error);
      return [];
    }
  }

  async restoreBackup(backupName) {
    logger.info(`Restoring backup: ${backupName}`);
    
    const backupPath = path.join(this.backupDir, backupName);
    
    try {
      // Verify backup exists
      await fs.access(backupPath);
      
      // Create restore backup (in case of issues)
      await this.createBackup('pre-restore');
      
      // Restore items
      const items = [
        { source: 'config', dest: '../config' },
        { source: 'data', dest: '../data' },
        { source: 'assets', dest: '../assets' },
        { source: 'owner.lock', dest: '../src/secure/owner.lock' }
      ];
      
      for (const item of items) {
        const source = path.join(backupPath, item.source);
        const dest = path.join(__dirname, item.dest);
        
        // Check if source exists in backup
        try {
          await fs.access(source);
          
          // Remove destination
          await fs.rm(dest, { recursive: true, force: true });
          
          // Copy from backup
          await fs.cp(source, dest, { recursive: true });
          
          logger.debug(`Restored: ${item.source}`);
        } catch (error) {
          logger.warn(`Skipping ${item.source}: not found in backup`);
        }
      }
      
      logger.info(`✅ Backup restored: ${backupName}`);
      
      // Restart bot to apply changes
      this.restartBot();
      
      return true;
      
    } catch (error) {
      logger.error('Restore failed:', error);
      
      // Attempt rollback
      await this.rollbackRestore();
      
      throw error;
    }
  }

  async rollbackRestore() {
    logger.warn('Attempting restore rollback...');
    
    try {
      const backups = await this.listBackups();
      const latestPreRestore = backups.find(b => 
        b.name.startsWith('pre-restore')
      );
      
      if (latestPreRestore) {
        await this.restoreBackup(latestPreRestore.name);
        logger.info('Restore rollback completed');
      } else {
        logger.warn('No pre-restore backup found for rollback');
      }
    } catch (error) {
      logger.error('Restore rollback failed:', error);
    }
  }

  restartBot() {
    logger.info('Restarting bot after restore...');
    
    try {
      execSync('pm2 restart messenger-bot 2>/dev/null || true', { stdio: 'pipe' });
      logger.info('Bot restart initiated');
    } catch (error) {
      logger.warn('Failed to restart bot:', error.message);
    }
  }

  stop() {
    schedule.gracefulShutdown();
    logger.info('Backup scheduler stopped');
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const scheduler = new BackupScheduler();
  
  switch (command) {
    case 'start':
      scheduler.start();
      break;
      
    case 'stop':
      scheduler.stop();
      break;
      
    case 'list':
      scheduler.listBackups().then(backups => {
        console.log('Available backups:');
        backups.forEach(backup => {
          console.log(`\n${backup.name}:`);
          console.log(`  Date: ${backup.timestamp}`);
          console.log(`  Type: ${backup.type || 'unknown'}`);
          console.log(`  Size: ${backup.size}`);
        });
      });
      break;
      
    case 'create':
      const type = args[1] || 'manual';
      scheduler.createBackup(type);
      break;
      
    case 'restore':
      const backupName = args[1];
      if (!backupName) {
        console.log('Usage: node backup-scheduler.js restore <backup-name>');
        process.exit(1);
      }
      scheduler.restoreBackup(backupName);
      break;
      
    case 'cleanup':
      scheduler.cleanupOldBackups();
      break;
      
    default:
      console.log(`
Usage: node scripts/backup-scheduler.js <command> [options]
      
Commands:
  start                    - Start backup scheduler
  stop                     - Stop backup scheduler
  list                     - List available backups
  create [type]            - Create manual backup
  restore <backup-name>    - Restore from backup
  cleanup                  - Cleanup old backups
      `);
  }
}

module.exports = BackupScheduler;