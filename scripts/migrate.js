#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const logger = require('../src/utils/logger');

class MigrationManager {
  constructor() {
    this.migrationDir = path.join(__dirname, '../migrations');
    this.dataDir = path.join(__dirname, '../data');
  }

  async runMigrations(backupFile = null) {
    logger.info('Starting database migrations...');
    
    try {
      // Restore from backup if provided
      if (backupFile && await this.fileExists(backupFile)) {
        await this.restoreFromBackup(backupFile);
      }
      
      // Get all migration files
      const migrationFiles = await this.getMigrationFiles();
      
      // Check which migrations have been run
      const executedMigrations = await this.getExecutedMigrations();
      
      // Run pending migrations
      for (const migration of migrationFiles) {
        if (!executedMigrations.includes(migration.name)) {
          await this.runMigration(migration);
          await this.markMigrationAsExecuted(migration.name);
        }
      }
      
      logger.info('Migrations completed successfully');
      
    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    }
  }

  async getMigrationFiles() {
    const files = await fs.readdir(this.migrationDir);
    
    return files
      .filter(file => file.endsWith('.js'))
      .map(file => ({
        name: path.basename(file, '.js'),
        path: path.join(this.migrationDir, file)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getExecutedMigrations() {
    const migrationLog = path.join(this.dataDir, 'logs', 'migrations.log');
    
    try {
      const content = await fs.readFile(migrationLog, 'utf8');
      return content.split('\n').filter(line => line.trim());
    } catch (error) {
      return [];
    }
  }

  async runMigration(migration) {
    logger.info(`Running migration: ${migration.name}`);
    
    try {
      const migrationModule = require(migration.path);
      await migrationModule.up();
      
      logger.info(`✅ Migration ${migration.name} completed`);
    } catch (error) {
      logger.error(`❌ Migration ${migration.name} failed:`, error);
      throw error;
    }
  }

  async markMigrationAsExecuted(migrationName) {
    const migrationLog = path.join(this.dataDir, 'logs', 'migrations.log');
    
    await fs.appendFile(migrationLog, `${migrationName}\n`);
  }

  async restoreFromBackup(backupFile) {
    logger.info(`Restoring from backup: ${backupFile}`);
    
    const backupDir = path.dirname(backupFile);
    const tempDir = path.join(backupDir, 'restore_temp');
    
    try {
      // Extract backup
      execSync(`tar -xzf "${backupFile}" -C "${tempDir}"`);
      
      // Restore data
      const items = ['data', 'config', 'assets'];
      
      for (const item of items) {
        const source = path.join(tempDir, item);
        const dest = path.join(__dirname, '..', item);
        
        if (await this.fileExists(source)) {
          await fs.cp(source, dest, { recursive: true });
          logger.info(`Restored: ${item}`);
        }
      }
      
      // Cleanup
      await fs.rm(tempDir, { recursive: true, force: true });
      
      logger.info('✅ Backup restored successfully');
      
    } catch (error) {
      logger.error('Backup restoration failed:', error);
      throw error;
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const migrator = new MigrationManager();
  
  switch (command) {
    case 'run':
      const backupFile = args[1];
      migrator.runMigrations(backupFile);
      break;
      
    case 'create':
      const migrationName = args[1];
      if (!migrationName) {
        console.log('Usage: node scripts/migrate.js create <migration-name>');
        process.exit(1);
      }
      createMigration(migrationName);
      break;
      
    case 'status':
      migrator.getExecutedMigrations().then(migrations => {
        console.log('Executed migrations:');
        migrations.forEach(m => console.log(`- ${m}`));
      });
      break;
      
    default:
      console.log(`
Usage: node scripts/migrate.js <command> [options]
      
Commands:
  run [backup-file]    - Run pending migrations
  create <name>        - Create new migration
  status               - Show migration status
      `);
  }
}

async function createMigration(name) {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
  const fileName = `${timestamp}_${name}.js`;
  const filePath = path.join(__dirname, '../migrations', fileName);
  
  const template = `module.exports = {
  up: async function() {
    // Migration logic here
    console.log('Running migration: ${name}');
    
    // Example: Create new directories
    // const fs = require('fs').promises;
    // await fs.mkdir('data/new-feature', { recursive: true });
  },
  
  down: async function() {
    // Rollback logic here
    console.log('Rolling back migration: ${name}');
  }
};`;
  
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, template);
  
  console.log(`✅ Migration created: ${fileName}`);
}

module.exports = MigrationManager;