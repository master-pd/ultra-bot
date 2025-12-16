const photoManager = require('../../utils/photo');
const delay = require('../../utils/delay');
const config = require('../../../config/config.json');

module.exports = {
    name: 'help',
    description: 'Show all available commands',
    usage: '!help [command]',
    category: 'normal',
    
    async execute(api, threadID, senderID, role) {
        try {
            await delay.typingDelay(api, threadID, 1000);
            
            let helpMessage = "🤖 **YOUR CRUSH BOT HELP MENU** 🤖\n";
            helpMessage += "══════════════════════════════════\n\n";
            
            // Basic info
            helpMessage += "📌 **BASIC INFO:**\n";
            helpMessage += `• Prefix: ${config.prefix}\n`;
            helpMessage += `• Your Role: ${role.toUpperCase()}\n`;
            helpMessage += `• Owner: ${config.ownerName}\n\n`;
            
            // Normal commands (everyone can use)
            helpMessage += "📋 **NORMAL COMMANDS:**\n";
            helpMessage += `• ${config.prefix}help - Show this help menu\n`;
            helpMessage += `• ${config.prefix}info - Show bot information\n`;
            helpMessage += `• ${config.prefix}ping - Check if bot is alive\n\n`;
            
            // Admin commands
            if (role === 'admin' || role === 'owner') {
                helpMessage += "🛠️ **ADMIN COMMANDS:**\n";
                helpMessage += `• ${config.prefix}startfun <type> - Start fun commands\n`;
                helpMessage += `• ${config.prefix}stopfun - Stop fun commands\n`;
                helpMessage += `• ${config.prefix}stats - Show bot statistics\n`;
                helpMessage += `• ${config.prefix}prefix <new> - Change bot prefix\n\n`;
            }
            
            // Owner commands
            if (role === 'owner') {
                helpMessage += "👑 **OWNER COMMANDS:**\n";
                helpMessage += `• ${config.prefix}owner stop - Stop the bot\n`;
                helpMessage += `• ${config.prefix}owner restart - Restart bot\n`;
                helpMessage += `• ${config.prefix}owner status - Bot status\n`;
                helpMessage += `• ${config.prefix}addadmin <id> - Add admin\n`;
                helpMessage += `• ${config.prefix}removeadmin <id> - Remove admin\n\n`;
            }
            
            // Fun commands info
            helpMessage += "🎮 **FUN COMMANDS TYPES:**\n";
            helpMessage += "• chor - চোর ধর চোর!\n";
            helpMessage += "• murgi - মুরগি ফান!\n";
            helpMessage += "• abal - আবাল টাইম!\n";
            helpMessage += "• senior - সিনিয়র মোড!\n";
            helpMessage += "• cow - গরু গেম!\n";
            helpMessage += "• goat - ছাগল ফান!\n\n";
            
            helpMessage += "📝 **USAGE EXAMPLES:**\n";
            helpMessage += `• ${config.prefix}startfun chor\n`;
            helpMessage += `• ${config.prefix}stopfun\n`;
            helpMessage += `• ${config.prefix}info\n\n`;
            
            helpMessage += "⚠️ **NOTES:**\n";
            helpMessage += "• Fun commands are admin/owner only\n";
            helpMessage += "• Be respectful when using the bot\n";
            helpMessage += "• Report bugs to the owner\n\n";
            
            helpMessage += "══════════════════════════════════\n";
            helpMessage += "👑 Developer: RANA (MASTER 🪓)\n";
            helpMessage += `📧 ${config.ownerEmail}\n`;
            helpMessage += `📱 ${config.ownerPhone}\n`;
            helpMessage += `📍 ${config.ownerLocation}\n`;
            
            // Send help message
            await api.sendMessage(helpMessage, threadID);
            
            // Send owner photo if user is owner
            if (role === 'owner') {
                const ownerPhoto = photoManager.getRandomOwnerPhoto();
                if (ownerPhoto) {
                    await delay.humanDelay();
                    await api.sendMessage({
                        body: "👑 Here's a random owner photo:",
                        attachment: await photoManager.downloadPhoto(ownerPhoto)
                    }, threadID);
                }
            }
            
        } catch (error) {
            console.error("Help command error:", error);
            api.sendMessage("❌ Error showing help. Please try again.", threadID);
        }
    }
};