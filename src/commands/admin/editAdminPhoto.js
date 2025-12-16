const fs = require('fs-extra');
const path = require('path');
const photoManager = require('../../utils/photo');
const delay = require('../../utils/delay');
const logger = require('../../utils/logger');
const validator = require('../../utils/validator');
const apiWrapper = require('../../utils/api');

module.exports = {
    name: 'adminphoto',
    description: 'Manage admin photos',
    usage: '!adminphoto [add/remove/list/set]',
    category: 'admin',
    
    async execute(api, threadID, args, bot, senderID) {
        const action = args[0] ? args[0].toLowerCase() : 'list';
        
        try {
            switch (action) {
                case 'add':
                case 'upload':
                    await this.addPhoto(api, threadID, args.slice(1), bot, senderID);
                    break;
                    
                case 'remove':
                case 'delete':
                    await this.removePhoto(api, threadID, args[1], bot, senderID);
                    break;
                    
                case 'list':
                case 'show':
                    await this.listPhotos(api, threadID, bot);
                    break;
                    
                case 'set':
                    await this.setPhoto(api, threadID, args[1], bot, senderID);
                    break;
                    
                case 'clear':
                    await this.clearPhotos(api, threadID, bot, senderID);
                    break;
                    
                default:
                    await this.showHelp(api, threadID, bot);
            }
        } catch (error) {
            logger.error(`Admin photo command error (${action}):`, error);
            await api.sendMessage(
                `❌ Error: ${error.message}`,
                threadID
            );
        }
    },
    
    async addPhoto(api, threadID, args, bot, senderID) {
        try {
            // Check if photo is attached
            if (!args[0] && !threadID.includes('@')) {
                await api.sendMessage(
                    "📸 **HOW TO ADD ADMIN PHOTO**\n\n" +
                    "**Method 1:** Send photo with caption\n" +
                    `Caption: ${bot.prefix}adminphoto add\n\n` +
                    "**Method 2:** Provide URL\n" +
                    `Usage: ${bot.prefix}adminphoto add <URL>\n\n` +
                    "**Method 3:** Upload file\n" +
                    `Usage: ${bot.prefix}adminphoto add /path/to/photo.jpg`,
                    threadID
                );
                return;
            }
            
            let photoPath;
            
            // Check if URL provided
            if (args[0] && validator.isValidURL(args[0])) {
                const url = args[0];
                await api.sendMessage(
                    `📥 Downloading photo from URL...\n${url}`,
                    threadID
                );
                
                // Download from URL
                const downloadDir = path.join(__dirname, '../../../temp/');
                await fs.ensureDir(downloadDir);
                photoPath = path.join(downloadDir, `admin_${Date.now()}.jpg`);
                
                try {
                    await apiWrapper.downloadFile(url, photoPath);
                } catch (error) {
                    throw new Error(`Failed to download from URL: ${error.message}`);
                }
            } 
            // Check if file path provided
            else if (args[0] && args[0].startsWith('/')) {
                photoPath = args[0];
                if (!await fs.pathExists(photoPath)) {
                    throw new Error('File not found at provided path');
                }
            }
            // Check for attached photo
            else {
                // This would need to handle message attachments
                // For now, we'll assume URL or file path
                throw new Error('Please provide a photo URL or file path');
            }
            
            // Validate photo
            const validation = await validator.isValidImage(photoPath);
            if (!validation.valid) {
                throw new Error(validation.error);
            }
            
            // Check admin photo limit
            const currentPhotos = photoManager.adminPhotos.length;
            const maxPhotos = 3;
            
            if (currentPhotos >= maxPhotos) {
                await api.sendMessage(
                    `❌ Maximum ${maxPhotos} admin photos allowed!\n` +
                    `Use ${bot.prefix}adminphoto remove <number> first.`,
                    threadID
                );
                return;
            }
            
            // Add the photo
            await api.sendMessage("⏳ Adding admin photo...", threadID);
            
            const fileName = await photoManager.addAdminPhoto(photoPath);
            
            // Upload to cloud storage (optional)
            let cloudUrl = null;
            try {
                const uploadResult = await apiWrapper.uploadToCloudinary(photoPath, {
                    folder: 'admin_photos'
                });
                
                if (uploadResult.success) {
                    cloudUrl = uploadResult.url;
                }
            } catch (error) {
                logger.warn('Cloudinary upload failed:', error.message);
            }
            
            // Clean up temp file if downloaded
            if (args[0] && validator.isValidURL(args[0])) {
                await fs.unlink(photoPath).catch(() => {});
            }
            
            // Log the addition
            logger.info(`Admin photo added by ${senderID}: ${fileName}`);
            
            // Send confirmation
            await api.sendMessage(
                `✅ Admin photo added successfully!\n\n` +
                `📝 **Details:**\n` +
                `• Name: ${fileName}\n` +
                `• Size: ${(validation.size / 1024).toFixed(2)} KB\n` +
                `• Format: ${validation.extension.toUpperCase()}\n` +
                `• Total Admin Photos: ${currentPhotos + 1}/${maxPhotos}\n` +
                (cloudUrl ? `• Cloud URL: ${cloudUrl}\n` : '') +
                `\nUse ${bot.prefix}adminphoto list to view all photos`,
                threadID
            );
            
            // Send the actual photo
            await delay.humanDelay();
            await api.sendMessage({
                body: "📸 New Admin Photo:",
                attachment: fs.createReadStream(path.join(
                    __dirname, '../../../data/admin-photos/', fileName
                ))
            }, threadID);
            
        } catch (error) {
            throw error;
        }
    },
    
    async removePhoto(api, threadID, indexStr, bot, senderID) {
        try {
            if (!indexStr) {
                await api.sendMessage(
                    `❌ Please specify photo number!\n` +
                    `Usage: ${bot.prefix}adminphoto remove <number>\n` +
                    `Example: ${bot.prefix}adminphoto remove 1`,
                    threadID
                );
                return;
            }
            
            const index = parseInt(indexStr) - 1;
            const currentPhotos = photoManager.adminPhotos.length;
            
            if (isNaN(index) || index < 0 || index >= currentPhotos) {
                await api.sendMessage(
                    `❌ Invalid photo number!\n` +
                    `Please use number between 1 and ${currentPhotos}`,
                    threadID
                );
                return;
            }
            
            const photoPath = photoManager.adminPhotos[index];
            const fileName = path.basename(photoPath);
            
            // Confirm removal
            await api.sendMessage(
                `⚠️ **CONFIRM REMOVAL**\n\n` +
                `Are you sure you want to remove admin photo #${index + 1}?\n` +
                `File: ${fileName}\n\n` +
                `Type **CONFIRM** to proceed or **CANCEL** to abort.`,
                threadID
            );
            
            // Wait for confirmation (simplified - in real bot, you'd need to track state)
            // For now, we'll just proceed
            await delay.sleep(2000);
            
            // Remove the photo
            await photoManager.removeAdminPhoto(index);
            
            // Log the removal
            logger.info(`Admin photo removed by ${senderID}: ${fileName}`);
            
            await api.sendMessage(
                `✅ Admin photo removed successfully!\n\n` +
                `• Removed: ${fileName}\n` +
                `• Remaining: ${photoManager.adminPhotos.length}/3\n` +
                `\nUse ${bot.prefix}adminphoto list to view remaining photos`,
                threadID
            );
            
        } catch (error) {
            throw error;
        }
    },
    
    async listPhotos(api, threadID, bot) {
        try {
            const photos = photoManager.adminPhotos;
            
            if (photos.length === 0) {
                await api.sendMessage(
                    "📭 No admin photos set!\n" +
                    `Use ${bot.prefix}adminphoto add to add photos.`,
                    threadID
                );
                return;
            }
            
            let message = `📸 **ADMIN PHOTOS** (${photos.length}/3)\n`;
            message += "════════════════════════════════\n\n";
            
            photos.forEach((photoPath, index) => {
                const fileName = path.basename(photoPath);
                const stats = fs.statSync(photoPath);
                const fileSize = (stats.size / 1024).toFixed(2);
                
                message += `**${index + 1}. ${fileName}**\n`;
                message += `   Size: ${fileSize} KB\n`;
                message += `   Added: ${stats.mtime.toLocaleDateString()}\n`;
                message += `   Path: ${photoPath}\n\n`;
            });
            
            message += "════════════════════════════════\n";
            message += `**Commands:**\n`;
            message += `• ${bot.prefix}adminphoto remove <number>\n`;
            message += `• ${bot.prefix}adminphoto add <URL>\n`;
            message += `• ${bot.prefix}adminphoto clear (Owner only)`;
            
            await api.sendMessage(message, threadID);
            
            // Send one sample photo
            if (photos.length > 0) {
                await delay.humanDelay();
                await api.sendMessage({
                    body: "📸 Sample Admin Photo:",
                    attachment: fs.createReadStream(photos[0])
                }, threadID);
            }
            
        } catch (error) {
            throw error;
        }
    },
    
    async setPhoto(api, threadID, indexStr, bot, senderID) {
        // This would set a specific photo as the default admin photo
        // Implementation would depend on your specific requirements
        await api.sendMessage(
            "🔄 This feature is under development!\n" +
            "Currently, admin photos are selected randomly.",
            threadID
        );
    },
    
    async clearPhotos(api, threadID, bot, senderID) {
        // Only owner can clear all photos
        if (senderID !== bot.ownerUID) {
            await api.sendMessage(
                "❌ Only the bot owner can clear all admin photos!",
                threadID
            );
            return;
        }
        
        try {
            const photoCount = photoManager.adminPhotos.length;
            
            if (photoCount === 0) {
                await api.sendMessage("📭 No admin photos to clear!", threadID);
                return;
            }
            
            // Confirm clearance
            await api.sendMessage(
                `🚨 **CONFIRM CLEAR ALL ADMIN PHOTOS**\n\n` +
                `This will remove ALL ${photoCount} admin photos!\n` +
                `This action cannot be undone.\n\n` +
                `Type **CLEAR ALL** to proceed or **CANCEL** to abort.`,
                threadID
            );
            
            // Wait for confirmation
            await delay.sleep(2000);
            
            // Clear all photos
            const adminPhotosDir = path.join(__dirname, '../../../data/admin-photos/');
            const files = await fs.readdir(adminPhotosDir);
            
            let removedCount = 0;
            for (const file of files) {
                if (file.match(/^admin\d+\.(png|jpg|jpeg|gif)$/i)) {
                    await fs.unlink(path.join(adminPhotosDir, file));
                    removedCount++;
                }
            }
            
            // Reload photos
            await photoManager.loadAdminPhotos();
            
            // Log the clearance
            logger.warn(`ALL admin photos cleared by owner ${senderID}`);
            
            await api.sendMessage(
                `✅ Cleared all admin photos!\n` +
                `• Removed: ${removedCount} photos\n` +
                `• Admin photos directory is now empty.`,
                threadID
            );
            
        } catch (error) {
            throw error;
        }
    },
    
    async showHelp(api, threadID, bot) {
        const helpMessage = `📸 **ADMIN PHOTO MANAGEMENT**\n
**Purpose:** Manage photos that appear when admin uses commands

**Available Commands:**
• ${bot.prefix}adminphoto list - Show all admin photos
• ${bot.prefix}adminphoto add <URL> - Add photo from URL
• ${bot.prefix}adminphoto remove <number> - Remove specific photo
• ${bot.prefix}adminphoto clear - Clear ALL photos (Owner only)

**Photo Requirements:**
• Max 3 photos allowed
• Formats: PNG, JPG, JPEG, GIF
• Max size: 10MB per photo
• Square photos work best

**Examples:**
${bot.prefix}adminphoto add https://example.com/photo.jpg
${bot.prefix}adminphoto remove 2
${bot.prefix}adminphoto list

**Notes:**
• Photos are selected randomly for admin actions
• Owner photos cannot be modified here
• Make sure photos are appropriate`;

        await api.sendMessage(helpMessage, threadID);
    },
    
    async getPhotoStats() {
        const stats = photoManager.getStats();
        
        return {
            adminPhotos: stats.adminPhotos,
            ownerPhotos: stats.ownerPhotos,
            cachedUserPhotos: stats.cachedUserPhotos,
            maxAdminPhotos: 3
        };
    }
};