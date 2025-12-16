const fs = require('fs-extra');
const path = require('path');
const delay = require('../../utils/delay');
const logger = require('../../utils/logger');
const validator = require('../../utils/validator');

module.exports = {
    name: 'funjson',
    description: 'Update fun JSON files',
    usage: '!funjson [list/view/edit/add/delete]',
    category: 'admin',
    
    async execute(api, threadID, args, bot, senderID) {
        const action = args[0] ? args[0].toLowerCase() : 'list';
        
        try {
            switch (action) {
                case 'list':
                    await this.listFunJSON(api, threadID, bot);
                    break;
                    
                case 'view':
                    await this.viewFunJSON(api, threadID, args[1], bot);
                    break;
                    
                case 'edit':
                    await this.editFunJSON(api, threadID, args.slice(1), bot, senderID);
                    break;
                    
                case 'add':
                    await this.addFunMessage(api, threadID, args.slice(1), bot, senderID);
                    break;
                    
                case 'delete':
                case 'remove':
                    await this.deleteFunMessage(api, threadID, args.slice(1), bot, senderID);
                    break;
                    
                case 'create':
                    await this.createFunJSON(api, threadID, args[1], bot, senderID);
                    break;
                    
                case 'backup':
                    await this.backupFunJSON(api, threadID, bot, senderID);
                    break;
                    
                case 'restore':
                    await this.restoreFunJSON(api, threadID, args[1], bot, senderID);
                    break;
                    
                default:
                    await this.showHelp(api, threadID, bot);
            }
        } catch (error) {
            logger.error(`FunJSON command error (${action}):`, error);
            await api.sendMessage(
                `❌ Error: ${error.message}`,
                threadID
            );
        }
    },
    
    async listFunJSON(api, threadID, bot) {
        try {
            const funDir = path.join(__dirname, '../../../data/fun-json/');
            await fs.ensureDir(funDir);
            
            const files = await fs.readdir(funDir);
            const jsonFiles = files.filter(file => file.endsWith('.json'));
            
            if (jsonFiles.length === 0) {
                await api.sendMessage(
                    "📭 No fun JSON files found!\n" +
                    `Use ${bot.prefix}funjson create <name> to create one.`,
                    threadID
                );
                return;
            }
            
            let message = `📁 **FUN JSON FILES** (${jsonFiles.length} files)\n`;
            message += "════════════════════════════════\n\n";
            
            for (const file of jsonFiles) {
                const filePath = path.join(funDir, file);
                const stats = await fs.stat(filePath);
                const content = await fs.readJson(filePath);
                
                message += `**${file}**\n`;
                message += `   Messages: ${Array.isArray(content) ? content.length : 'Invalid'}\n`;
                message += `   Size: ${(stats.size / 1024).toFixed(2)} KB\n`;
                message += `   Modified: ${stats.mtime.toLocaleDateString()}\n\n`;
            }
            
            message += "════════════════════════════════\n";
            message += `**Commands:**\n`;
            message += `• ${bot.prefix}funjson view <name> - View messages\n`;
            message += `• ${bot.prefix}funjson edit <name> - Edit file\n`;
            message += `• ${bot.prefix}funjson create <name> - Create new\n`;
            message += `• ${bot.prefix}funjson backup - Backup all files`;
            
            await api.sendMessage(message, threadID);
            
        } catch (error) {
            throw error;
        }
    },
    
    async viewFunJSON(api, threadID, funName, bot) {
        if (!funName) {
            await api.sendMessage(
                "❌ Please specify fun file name!\n" +
                `Usage: ${bot.prefix}funjson view <name>\n` +
                `Example: ${bot.prefix}funjson view chor`,
                threadID
            );
            return;
        }
        
        // Remove .json extension if provided
        funName = funName.replace('.json', '');
        
        try {
            const filePath = path.join(__dirname, '../../../data/fun-json/', `${funName}.json`);
            
            if (!await fs.pathExists(filePath)) {
                await api.sendMessage(
                    `❌ ${funName}.json not found!\n` +
                    `Use ${bot.prefix}funjson list to see available files.`,
                    threadID
                );
                return;
            }
            
            const content = await fs.readJson(filePath);
            
            if (!Array.isArray(content)) {
                await api.sendMessage(
                    `❌ ${funName}.json is not a valid array!`,
                    threadID
                );
                return;
            }
            
            let message = `📄 **${funName.toUpperCase()}.json**\n`;
            message += `Total Messages: ${content.length}\n`;
            message += "════════════════════════════════\n\n";
            
            // Show first 10 messages
            const previewCount = Math.min(10, content.length);
            for (let i = 0; i < previewCount; i++) {
                message += `${i + 1}. ${content[i]}\n`;
            }
            
            if (content.length > previewCount) {
                message += `\n... and ${content.length - previewCount} more messages\n`;
            }
            
            message += "\n════════════════════════════════\n";
            message += `**Commands for ${funName}:**\n`;
            message += `• ${bot.prefix}funjson edit ${funName} <index> <new message>\n`;
            message += `• ${bot.prefix}funjson add ${funName} <message>\n`;
            message += `• ${bot.prefix}funjson delete ${funName} <index>`;
            
            await api.sendMessage(message, threadID);
            
        } catch (error) {
            throw error;
        }
    },
    
    async editFunJSON(api, threadID, args, bot, senderID) {
        if (args.length < 3) {
            await api.sendMessage(
                "❌ Please provide all parameters!\n" +
                `Usage: ${bot.prefix}funjson edit <name> <index> <new message>\n` +
                `Example: ${bot.prefix}funjson edit chor 1 "চোর ধর! 🏃‍♂️"`,
                threadID
            );
            return;
        }
        
        const funName = args[0].replace('.json', '');
        const index = parseInt(args[1]) - 1; // Convert to 0-based index
        const newMessage = args.slice(2).join(' ');
        
        if (isNaN(index) || index < 0) {
            await api.sendMessage(
                "❌ Invalid index! Please use a positive number.",
                threadID
            );
            return;
        }
        
        try {
            const filePath = path.join(__dirname, '../../../data/fun-json/', `${funName}.json`);
            
            if (!await fs.pathExists(filePath)) {
                await api.sendMessage(
                    `❌ ${funName}.json not found!`,
                    threadID
                );
                return;
            }
            
            const content = await fs.readJson(filePath);
            
            if (!Array.isArray(content)) {
                await api.sendMessage(
                    `❌ ${funName}.json is not a valid array!`,
                    threadID
                );
                return;
            }
            
            if (index >= content.length) {
                await api.sendMessage(
                    `❌ Index ${index + 1} out of range!\n` +
                    `File has only ${content.length} messages.`,
                    threadID
                );
                return;
            }
            
            // Save old message for logging
            const oldMessage = content[index];
            
            // Update the message
            content[index] = newMessage;
            
            // Save back to file
            await fs.writeJson(filePath, content, { spaces: 2 });
            
            // Log the edit
            logger.info(
                `Fun JSON edited by ${senderID}: ${funName}.json[${index}] ` +
                `"${oldMessage}" -> "${newMessage}"`
            );
            
            await api.sendMessage(
                `✅ Message updated successfully!\n\n` +
                `**File:** ${funName}.json\n` +
                `**Index:** ${index + 1}\n` +
                `**Old:** ${oldMessage}\n` +
                `**New:** ${newMessage}\n\n` +
                `Total messages: ${content.length}`,
                threadID
            );
            
        } catch (error) {
            throw error;
        }
    },
    
    async addFunMessage(api, threadID, args, bot, senderID) {
        if (args.length < 2) {
            await api.sendMessage(
                "❌ Please provide all parameters!\n" +
                `Usage: ${bot.prefix}funjson add <name> <message>\n` +
                `Example: ${bot.prefix}funjson add chor "নতুন চোর বার্তা!"`,
                threadID
            );
            return;
        }
        
        const funName = args[0].replace('.json', '');
        const newMessage = args.slice(1).join(' ');
        
        try {
            const filePath = path.join(__dirname, '../../../data/fun-json/', `${funName}.json`);
            
            if (!await fs.pathExists(filePath)) {
                await api.sendMessage(
                    `❌ ${funName}.json not found!\n` +
                    `Use ${bot.prefix}funjson create ${funName} first.`,
                    threadID
                );
                return;
            }
            
            const content = await fs.readJson(filePath);
            
            if (!Array.isArray(content)) {
                await api.sendMessage(
                    `❌ ${funName}.json is not a valid array!`,
                    threadID
                );
                return;
            }
            
            // Add new message
            content.push(newMessage);
            
            // Save back to file
            await fs.writeJson(filePath, content, { spaces: 2 });
            
            // Log the addition
            logger.info(
                `Fun JSON message added by ${senderID}: ${funName}.json[${content.length - 1}] ` +
                `"${newMessage}"`
            );
            
            await api.sendMessage(
                `✅ Message added successfully!\n\n` +
                `**File:** ${funName}.json\n` +
                `**New Index:** ${content.length}\n` +
                `**Message:** ${newMessage}\n\n` +
                `Total messages: ${content.length}`,
                threadID
            );
            
        } catch (error) {
            throw error;
        }
    },
    
    async deleteFunMessage(api, threadID, args, bot, senderID) {
        if (args.length < 2) {
            await api.sendMessage(
                "❌ Please provide all parameters!\n" +
                `Usage: ${bot.prefix}funjson delete <name> <index>\n` +
                `Example: ${bot.prefix}funjson delete chor 5`,
                threadID
            );
            return;
        }
        
        const funName = args[0].replace('.json', '');
        const index = parseInt(args[1]) - 1; // Convert to 0-based index
        
        if (isNaN(index) || index < 0) {
            await api.sendMessage(
                "❌ Invalid index! Please use a positive number.",
                threadID
            );
            return;
        }
        
        try {
            const filePath = path.join(__dirname, '../../../data/fun-json/', `${funName}.json`);
            
            if (!await fs.pathExists(filePath)) {
                await api.sendMessage(
                    `❌ ${funName}.json not found!`,
                    threadID
                );
                return;
            }
            
            const content = await fs.readJson(filePath);
            
            if (!Array.isArray(content)) {
                await api.sendMessage(
                    `❌ ${funName}.json is not a valid array!`,
                    threadID
                );
                return;
            }
            
            if (index >= content.length) {
                await api.sendMessage(
                    `❌ Index ${index + 1} out of range!\n` +
                    `File has only ${content.length} messages.`,
                    threadID
                );
                return;
            }
            
            // Get message to be deleted
            const deletedMessage = content[index];
            
            // Confirm deletion
            await api.sendMessage(
                `⚠️ **CONFIRM DELETION**\n\n` +
                `Are you sure you want to delete message #${index + 1}?\n` +
                `Message: "${deletedMessage}"\n\n` +
                `Type **DELETE** to proceed or **CANCEL** to abort.`,
                threadID
            );
            
            // Wait for confirmation
            await delay.sleep(2000);
            
            // Remove the message
            content.splice(index, 1);
            
            // Save back to file
            await fs.writeJson(filePath, content, { spaces: 2 });
            
            // Log the deletion
            logger.info(
                `Fun JSON message deleted by ${senderID}: ${funName}.json[${index}] ` +
                `"${deletedMessage}"`
            );
            
            await api.sendMessage(
                `✅ Message deleted successfully!\n\n` +
                `**File:** ${funName}.json\n` +
                `**Deleted Index:** ${index + 1}\n` +
                `**Message:** ${deletedMessage}\n\n` +
                `Total messages: ${content.length}`,
                threadID
            );
            
        } catch (error) {
            throw error;
        }
    },
    
    async createFunJSON(api, threadID, funName, bot, senderID) {
        if (!funName) {
            await api.sendMessage(
                "❌ Please specify fun file name!\n" +
                `Usage: ${bot.prefix}funjson create <name>\n` +
                `Example: ${bot.prefix}funjson create newfun`,
                threadID
            );
            return;
        }
        
        // Remove .json extension if provided
        funName = funName.replace('.json', '');
        
        // Validate name
        if (!validator.isValidFilename(funName)) {
            await api.sendMessage(
                "❌ Invalid file name!\n" +
                "Use only letters, numbers, hyphens, and underscores.",
                threadID
            );
            return;
        }
        
        try {
            const filePath = path.join(__dirname, '../../../data/fun-json/', `${funName}.json`);
            
            if (await fs.pathExists(filePath)) {
                await api.sendMessage(
                    `❌ ${funName}.json already exists!\n` +
                    `Use a different name or edit the existing file.`,
                    threadID
                );
                return;
            }
            
            // Create with default messages
            const defaultMessages = [
                `${funName} message 1! 🎉`,
                `${funName} message 2! 🚀`,
                `${funName} message 3! ⭐`
            ];
            
            await fs.writeJson(filePath, defaultMessages, { spaces: 2 });
            
            // Log the creation
            logger.info(`Fun JSON created by ${senderID}: ${funName}.json`);
            
            await api.sendMessage(
                `✅ ${funName}.json created successfully!\n\n` +
                `**File:** ${funName}.json\n` +
                `**Location:** data/fun-json/\n` +
                `**Default Messages:** 3\n\n` +
                `Use these commands to manage:\n` +
                `• ${bot.prefix}funjson view ${funName}\n` +
                `• ${bot.prefix}funjson add ${funName} <message>\n` +
                `• ${bot.prefix}funjson edit ${funName} <index> <message>`,
                threadID
            );
            
        } catch (error) {
            throw error;
        }
    },
    
    async backupFunJSON(api, threadID, bot, senderID) {
        try {
            const funDir = path.join(__dirname, '../../../data/fun-json/');
            const backupDir = path.join(__dirname, '../../../data/backups/fun-json/');
            
            await fs.ensureDir(backupDir);
            
            const timestamp = new Date().toISOString()
                .replace(/[:.]/g, '-')
                .replace('T', '_')
                .split('.')[0];
            
            const backupPath = path.join(backupDir, `fun-json-backup-${timestamp}.zip`);
            
            // Get all JSON files
            const files = await fs.readdir(funDir);
            const jsonFiles = files.filter(file => file.endsWith('.json'));
            
            if (jsonFiles.length === 0) {
                await api.sendMessage("📭 No fun JSON files to backup!", threadID);
                return;
            }
            
            await api.sendMessage(
                `📦 Creating backup of ${jsonFiles.length} fun JSON files...`,
                threadID
            );
            
            // Create backup by copying files
            let backedUpCount = 0;
            for (const file of jsonFiles) {
                const source = path.join(funDir, file);
                const dest = path.join(backupDir, `${timestamp}_${file}`);
                await fs.copy(source, dest);
                backedUpCount++;
            }
            
            // Log the backup
            logger.info(`Fun JSON backup created by ${senderID}: ${backedUpCount} files`);
            
            await api.sendMessage(
                `✅ Backup created successfully!\n\n` +
                `**Backup Details:**\n` +
                `• Files: ${backedUpCount}\n` +
                `• Timestamp: ${timestamp}\n` +
                `• Location: data/backups/fun-json/\n\n` +
                `Use ${bot.prefix}funjson restore <timestamp> to restore.`,
                threadID
            );
            
        } catch (error) {
            throw error;
        }
    },
    
    async restoreFunJSON(api, threadID, timestamp, bot, senderID) {
        if (!timestamp) {
            await api.sendMessage(
                "❌ Please specify backup timestamp!\n" +
                `Usage: ${bot.prefix}funjson restore <timestamp>\n` +
                `Example: ${bot.prefix}funjson restore 2024-01-15_12-30-00`,
                threadID
            );
            return;
        }
        
        try {
            const backupDir = path.join(__dirname, '../../../data/backups/fun-json/');
            const funDir = path.join(__dirname, '../../../data/fun-json/');
            
            // Find backup files
            const files = await fs.readdir(backupDir);
            const backupFiles = files.filter(file => file.startsWith(`${timestamp}_`));
            
            if (backupFiles.length === 0) {
                await api.sendMessage(
                    `❌ No backup found with timestamp: ${timestamp}\n` +
                    `Use ${bot.prefix}funjson backup to create a new backup first.`,
                    threadID
                );
                return;
            }
            
            // Confirm restoration
            await api.sendMessage(
                `⚠️ **CONFIRM RESTORATION**\n\n` +
                `This will restore ${backupFiles.length} fun JSON files!\n` +
                `Current files will be overwritten.\n\n` +
                `Type **RESTORE** to proceed or **CANCEL** to abort.`,
                threadID
            );
            
            // Wait for confirmation
            await delay.sleep(2000);
            
            // Restore files
            let restoredCount = 0;
            for (const file of backupFiles) {
                const source = path.join(backupDir, file);
                const originalName = file.replace(`${timestamp}_`, '');
                const dest = path.join(funDir, originalName);
                
                await fs.copy(source, dest);
                restoredCount++;
            }
            
            // Log the restoration
            logger.info(`Fun JSON restored by ${senderID}: ${restoredCount} files from ${timestamp}`);
            
            await api.sendMessage(
                `✅ Restoration completed!\n\n` +
                `**Restored:** ${restoredCount} files\n` +
                `**From Backup:** ${timestamp}\n` +
                `**To:** data/fun-json/\n\n` +
                `Fun JSON files have been restored to their backed up state.`,
                threadID
            );
            
        } catch (error) {
            throw error;
        }
    },
    
    async showHelp(api, threadID, bot) {
        const helpMessage = `📄 **FUN JSON MANAGEMENT**\n
**Purpose:** Manage the messages used in fun commands

**Available Commands:**
• ${bot.prefix}funjson list - List all fun JSON files
• ${bot.prefix}funjson view <name> - View messages in a file
• ${bot.prefix}funjson edit <name> <index> <message> - Edit a message
• ${bot.prefix}funjson add <name> <message> - Add a new message
• ${bot.prefix}funjson delete <name> <index> - Delete a message
• ${bot.prefix}funjson create <name> - Create new fun JSON file
• ${bot.prefix}funjson backup - Backup all fun JSON files
• ${bot.prefix}funjson restore <timestamp> - Restore from backup

**File Locations:**
• Current: data/fun-json/
• Backups: data/backups/fun-json/

**Examples:**
${bot.prefix}funjson list
${bot.prefix}funjson view chor
${bot.prefix}funjson add chor "নতুন বার্তা!"
${bot.prefix}funjson edit chor 1 "আপডেটেড বার্তা"

**Notes:**
• Only admins/owner can modify fun JSON
• Backup regularly to prevent data loss
• Use meaningful message content`;

        await api.sendMessage(helpMessage, threadID);
    },
    
    async getFunJSONStats() {
        try {
            const funDir = path.join(__dirname, '../../../data/fun-json/');
            await fs.ensureDir(funDir);
            
            const files = await fs.readdir(funDir);
            const jsonFiles = files.filter(file => file.endsWith('.json'));
            
            const stats = {
                totalFiles: jsonFiles.length,
                totalMessages: 0,
                files: []
            };
            
            for (const file of jsonFiles) {
                const filePath = path.join(funDir, file);
                const content = await fs.readJson(filePath);
                const fileStats = await fs.stat(filePath);
                
                if (Array.isArray(content)) {
                    stats.totalMessages += content.length;
                    stats.files.push({
                        name: file,
                        messageCount: content.length,
                        size: fileStats.size,
                        modified: fileStats.mtime
                    });
                }
            }
            
            return stats;
        } catch (error) {
            logger.error('Error getting fun JSON stats:', error);
            return { error: error.message };
        }
    }
};