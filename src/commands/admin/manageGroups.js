const fs = require('fs-extra');
const path = require('path');
const delay = require('../../utils/delay');
const logger = require('../../utils/logger');
const validator = require('../../utils/validator');

module.exports = {
    name: 'groups',
    description: 'Manage bot groups',
    usage: '!groups [list/add/remove/leave]',
    category: 'admin',
    
    async execute(api, threadID, args, bot, senderID) {
        const action = args[0] ? args[0].toLowerCase() : 'list';
        
        try {
            switch (action) {
                case 'list':
                    await this.listGroups(api, threadID, bot);
                    break;
                    
                case 'add':
                    await this.addGroup(api, threadID, args[1], bot, senderID);
                    break;
                    
                case 'remove':
                case 'delete':
                    await this.removeGroup(api, threadID, args[1], bot, senderID);
                    break;
                    
                case 'leave':
                    await this.leaveGroup(api, threadID, args[1], bot, senderID);
                    break;
                    
                case 'info':
                    await this.groupInfo(api, threadID, args[1], bot);
                    break;
                    
                default:
                    await this.showHelp(api, threadID, bot);
            }
        } catch (error) {
            logger.error(`Groups command error (${action}):`, error);
            await api.sendMessage(
                `❌ Error executing groups command: ${error.message}`,
                threadID
            );
        }
    },
    
    async listGroups(api, threadID, bot) {
        try {
            // Get all threads the bot is in
            api.getThreadList(100, null, [], (err, threads) => {
                if (err) {
                    logger.error('Error getting thread list:', err);
                    api.sendMessage("❌ Error getting group list.", threadID);
                    return;
                }
                
                // Filter groups only (exclude individual conversations)
                const groups = threads.filter(thread => 
                    thread.threadID !== thread.threadID.toString() && // Not a user ID
                    thread.isGroup === true
                );
                
                if (groups.length === 0) {
                    api.sendMessage(
                        "📭 Bot is not in any groups.\n" +
                        `Use ${bot.prefix}groups add <groupID> to add a group.`,
                        threadID
                    );
                    return;
                }
                
                let message = `📋 **GROUPS LIST** (${groups.length} groups)\n`;
                message += "════════════════════════════════\n\n";
                
                groups.forEach((group, index) => {
                    const name = group.name || `Group ${index + 1}`;
                    const participantCount = group.participantIDs ? group.participantIDs.length : 'N/A';
                    
                    message += `**${index + 1}. ${name}**\n`;
                    message += `   ID: ${group.threadID}\n`;
                    message += `   Members: ${participantCount}\n`;
                    message += `   Unread: ${group.unreadCount || 0}\n`;
                    
                    // Add fun status if active
                    if (bot.funThreads.has(group.threadID)) {
                        const funData = bot.funThreads.get(group.threadID);
                        message += `   Fun: ${funData.type.toUpperCase()} (${funData.index} msgs)\n`;
                    }
                    
                    message += "\n";
                });
                
                message += "════════════════════════════════\n";
                message += `Use ${bot.prefix}groups info <ID> for detailed info`;
                
                api.sendMessage(message, threadID);
            });
            
        } catch (error) {
            throw error;
        }
    },
    
    async addGroup(api, threadID, groupID, bot, senderID) {
        if (!groupID) {
            await api.sendMessage(
                "❌ Please provide a group ID!\n" +
                `Usage: ${bot.prefix}groups add <groupID>`,
                threadID
            );
            return;
        }
        
        if (!validator.isValidThreadID(groupID)) {
            await api.sendMessage(
                "❌ Invalid group ID format!\n" +
                "Group ID should be a numeric ID.",
                threadID
            );
            return;
        }
        
        try {
            // Try to get group info to verify it exists
            api.getThreadInfo(groupID, async (err, groupInfo) => {
                if (err) {
                    logger.error(`Error getting group info for ${groupID}:`, err);
                    await api.sendMessage(
                        "❌ Could not access group!\n" +
                        "Make sure:\n" +
                        "1. The group ID is correct\n" +
                        "2. The bot is a member of the group\n" +
                        "3. The group exists",
                        threadID
                    );
                    return;
                }
                
                // Log the addition
                logger.info(
                    `Group added by ${senderID}: ${groupInfo.name || groupID} (${groupID})`
                );
                
                await api.sendMessage(
                    `✅ Successfully added group!\n\n` +
                    `📝 **Group Info:**\n` +
                    `• Name: ${groupInfo.name || 'Unnamed Group'}\n` +
                    `• ID: ${groupID}\n` +
                    `• Members: ${groupInfo.participantIDs ? groupInfo.participantIDs.length : 'N/A'}\n` +
                    `• Admin IDs: ${groupInfo.adminIDs ? groupInfo.adminIDs.join(', ') : 'None'}\n\n` +
                    `The bot will now respond to commands in this group.`,
                    threadID
                );
            });
            
        } catch (error) {
            throw error;
        }
    },
    
    async removeGroup(api, threadID, groupID, bot, senderID) {
        if (!groupID) {
            await api.sendMessage(
                "❌ Please provide a group ID!\n" +
                `Usage: ${bot.prefix}groups remove <groupID>`,
                threadID
            );
            return;
        }
        
        try {
            // Check if bot is in the group
            api.getThreadList(100, null, [], async (err, threads) => {
                if (err) {
                    await api.sendMessage("❌ Error checking groups.", threadID);
                    return;
                }
                
                const groupExists = threads.some(thread => 
                    thread.threadID === groupID && thread.isGroup === true
                );
                
                if (!groupExists) {
                    await api.sendMessage(
                        "❌ Bot is not in that group!\n" +
                        "Check the group ID and try again.",
                        threadID
                    );
                    return;
                }
                
                // Log the removal
                logger.info(`Group removed by ${senderID}: ${groupID}`);
                
                // Stop any active fun in that group
                if (bot.funThreads.has(groupID)) {
                    const funData = bot.funThreads.get(groupID);
                    if (funData.interval) {
                        clearInterval(funData.interval);
                    }
                    bot.funThreads.delete(groupID);
                }
                
                await api.sendMessage(
                    `✅ Group removed from bot's active list!\n\n` +
                    `Note: The bot is still in the group.\n` +
                    `To completely remove, use ${bot.prefix}groups leave ${groupID}`,
                    threadID
                );
            });
            
        } catch (error) {
            throw error;
        }
    },
    
    async leaveGroup(api, threadID, groupID, bot, senderID) {
        if (!groupID) {
            await api.sendMessage(
                "❌ Please provide a group ID!\n" +
                `Usage: ${bot.prefix}groups leave <groupID>`,
                threadID
            );
            return;
        }
        
        // Only owner can make bot leave groups
        if (senderID !== bot.ownerUID) {
            await api.sendMessage(
                "❌ Only the bot owner can make the bot leave groups!",
                threadID
            );
            return;
        }
        
        try {
            // Send goodbye message first
            await api.sendMessage(
                "👋 Goodbye everyone!\n" +
                "Bot is leaving this group by owner's command.\n" +
                "Thanks for having me! 🤖",
                groupID
            );
            
            await delay.humanDelay();
            
            // Actually leave the group
            api.removeUserFromGroup(bot.currentUser, groupID, (err) => {
                if (err) {
                    logger.error(`Error leaving group ${groupID}:`, err);
                    api.sendMessage(
                        "❌ Failed to leave the group!\n" +
                        "You may need to remove the bot manually.",
                        threadID
                    );
                    return;
                }
                
                // Log the leave
                logger.info(`Bot left group ${groupID} by owner ${senderID}`);
                
                // Stop any active fun
                if (bot.funThreads.has(groupID)) {
                    const funData = bot.funThreads.get(groupID);
                    if (funData.interval) {
                        clearInterval(funData.interval);
                    }
                    bot.funThreads.delete(groupID);
                }
                
                api.sendMessage(
                    `✅ Successfully left group ${groupID}!`,
                    threadID
                );
            });
            
        } catch (error) {
            throw error;
        }
    },
    
    async groupInfo(api, threadID, groupID, bot) {
        if (!groupID) {
            // Show info for current thread
            groupID = threadID;
        }
        
        try {
            api.getThreadInfo(groupID, async (err, info) => {
                if (err) {
                    logger.error(`Error getting info for group ${groupID}:`, err);
                    await api.sendMessage(
                        "❌ Could not get group information!\n" +
                        "Make sure the bot is in the group.",
                        threadID
                    );
                    return;
                }
                
                let message = "📊 **GROUP INFORMATION**\n";
                message += "════════════════════════════════\n\n";
                
                message += `**Name:** ${info.name || 'Unnamed Group'}\n`;
                message += `**ID:** ${groupID}\n`;
                message += `**Type:** ${info.isGroup ? 'Group Chat' : 'Individual'}\n`;
                message += `**Members:** ${info.participantIDs ? info.participantIDs.length : 'N/A'}\n`;
                message += `**Admins:** ${info.adminIDs ? info.adminIDs.length : '0'}\n`;
                
                if (info.adminIDs && info.adminIDs.length > 0) {
                    message += `**Admin IDs:** ${info.adminIDs.join(', ')}\n`;
                }
                
                message += `**Unread Messages:** ${info.unreadCount || 0}\n`;
                message += `**Message Count:** ${info.messageCount || 'N/A'}\n`;
                message += `**Color:** ${info.color || 'Default'}\n`;
                message += `**Emoji:** ${info.emoji || 'None'}\n\n`;
                
                // Bot status in this group
                message += "🤖 **BOT STATUS:**\n";
                if (bot.funThreads.has(groupID)) {
                    const funData = bot.funThreads.get(groupID);
                    message += `• Fun Active: ${funData.type.toUpperCase()}\n`;
                    message += `• Messages Sent: ${funData.index || 0}\n`;
                    message += `• Started By: ${funData.userID}\n`;
                } else {
                    message += "• Fun Active: No\n";
                }
                
                message += `• Responding: Yes\n`;
                message += `• Prefix: ${bot.prefix}\n\n`;
                
                message += "════════════════════════════════\n";
                message += `Use ${bot.prefix}groups list to see all groups`;
                
                await api.sendMessage(message, threadID);
            });
            
        } catch (error) {
            throw error;
        }
    },
    
    async showHelp(api, threadID, bot) {
        const helpMessage = `📋 **GROUPS COMMAND HELP**\n
**Available Commands:**
• ${bot.prefix}groups list - List all groups
• ${bot.prefix}groups add <ID> - Add a group
• ${bot.prefix}groups remove <ID> - Remove a group
• ${bot.prefix}groups leave <ID> - Leave a group (Owner only)
• ${bot.prefix}groups info [ID] - Show group info

**Examples:**
${bot.prefix}groups list
${bot.prefix}groups add 1234567890123456
${bot.prefix}groups info

**Notes:**
• Only admins/owner can manage groups
• Use group ID (numeric) for operations
• Bot must be in the group to manage it`;

        await api.sendMessage(helpMessage, threadID);
    },
    
    async getGroupStatistics(bot) {
        try {
            return new Promise((resolve, reject) => {
                api.getThreadList(100, null, [], (err, threads) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    const groups = threads.filter(thread => thread.isGroup === true);
                    const stats = {
                        total: groups.length,
                        withActiveFun: 0,
                        participantCount: 0,
                        adminCount: 0
                    };
                    
                    groups.forEach(group => {
                        if (bot.funThreads.has(group.threadID)) {
                            stats.withActiveFun++;
                        }
                        
                        if (group.participantIDs) {
                            stats.participantCount += group.participantIDs.length;
                        }
                        
                        if (group.adminIDs) {
                            stats.adminCount += group.adminIDs.length;
                        }
                    });
                    
                    resolve(stats);
                });
            });
        } catch (error) {
            throw error;
        }
    }
};