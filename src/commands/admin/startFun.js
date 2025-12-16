const fs = require('fs-extra');
const path = require('path');
const delay = require('../../utils/delay');
const validator = require('../../utils/validator');
const logger = require('../../utils/logger');

// Import fun command modules
const chorFun = require('../fun/chor');
const murgiFun = require('../fun/murgi');
const abalFun = require('../fun/abal');
const seniorFun = require('../fun/senior');
const cowFun = require('../fun/cow');
const goatFun = require('../fun/goat');

module.exports = {
    name: 'startfun',
    description: 'Start fun commands',
    usage: '!startfun <type>',
    category: 'admin',
    
    async execute(api, threadID, funType, bot, senderID) {
        try {
            // Validate fun type
            if (!funType) {
                await api.sendMessage(
                    "❌ Please specify a fun type!\n" +
                    "📋 Available types: chor, murgi, abal, senior, cow, goat\n" +
                    `📝 Usage: ${bot.prefix}startfun <type>`,
                    threadID
                );
                return;
            }
            
            // Convert to lowercase
            funType = funType.toLowerCase();
            
            // Check if fun is already active in this thread
            if (bot.funThreads.has(threadID)) {
                const activeFun = bot.funThreads.get(threadID);
                await api.sendMessage(
                    `⚠️ ${activeFun.type.toUpperCase()} fun is already active in this thread!\n` +
                    `Type ${bot.prefix}stopfun to stop it first.`,
                    threadID
                );
                return;
            }
            
            // Validate fun type exists
            const validTypes = ['chor', 'murgi', 'abal', 'senior', 'cow', 'goat'];
            if (!validTypes.includes(funType)) {
                await api.sendMessage(
                    `❌ Invalid fun type: ${funType}\n` +
                    `✅ Available types: ${validTypes.join(', ')}`,
                    threadID
                );
                return;
            }
            
            // Check if fun data file exists
            const funDataPath = path.join(__dirname, '../../../data/fun-json/', `${funType}.json`);
            if (!await fs.pathExists(funDataPath)) {
                await api.sendMessage(
                    `❌ ${funType}.json data file not found!\n` +
                    "Please check the data/fun-json directory.",
                    threadID
                );
                return;
            }
            
            // Read fun data
            const funData = await fs.readJson(funDataPath);
            if (!Array.isArray(funData) || funData.length === 0) {
                await api.sendMessage(
                    `❌ ${funType}.json is empty or invalid!\n` +
                    "Please add some messages to the JSON file.",
                    threadID
                );
                return;
            }
            
            // Send starting message
            await api.sendMessage(
                `🎮 Starting ${funType.toUpperCase()} fun...\n` +
                `📊 Total messages: ${funData.length}\n` +
                `⏰ Auto-stop in 5 minutes\n` +
                `🛑 Type ${bot.prefix}stopfun to stop`,
                threadID
            );
            
            await delay.humanDelay();
            
            // Get user info for logging
            let userName = 'Unknown';
            try {
                const userInfo = await new Promise((resolve, reject) => {
                    api.getUserInfo(senderID, (err, ret) => {
                        if (err) reject(err);
                        else resolve(ret[senderID]);
                    });
                });
                if (userInfo) userName = userInfo.name;
            } catch (error) {
                logger.warn(`Could not get user info for ${senderID}:`, error.message);
            }
            
            // Log the fun start
            logger.info(
                `Fun started: ${funType} by ${userName} (${senderID}) in thread ${threadID}`
            );
            
            // Execute the specific fun command
            switch (funType) {
                case 'chor':
                    await chorFun.execute(api, threadID, bot, senderID);
                    break;
                case 'murgi':
                    await murgiFun.execute(api, threadID, bot, senderID);
                    break;
                case 'abal':
                    await abalFun.execute(api, threadID, bot, senderID);
                    break;
                case 'senior':
                    await seniorFun.execute(api, threadID, bot, senderID);
                    break;
                case 'cow':
                    await cowFun.execute(api, threadID, bot, senderID);
                    break;
                case 'goat':
                    await goatFun.execute(api, threadID, bot, senderID);
                    break;
                default:
                    await api.sendMessage(`❌ Unknown fun type: ${funType}`, threadID);
                    return;
            }
            
            // Update bot state
            bot.funActive = true;
            
            // Send confirmation
            await delay.humanDelay();
            await api.sendMessage(
                `✅ ${funType.toUpperCase()} fun is now running!\n` +
                "Enjoy the fun! 🎉",
                threadID
            );
            
        } catch (error) {
            logger.error(`Error starting ${funType} fun:`, error);
            await api.sendMessage(
                `❌ Error starting ${funType} fun: ${error.message}`,
                threadID
            );
        }
    },
    
    async getFunStatus(threadID, bot) {
        if (!bot.funThreads.has(threadID)) {
            return {
                active: false,
                message: "No active fun in this thread"
            };
        }
        
        const funThread = bot.funThreads.get(threadID);
        const funDataPath = path.join(__dirname, '../../../data/fun-json/', `${funThread.type}.json`);
        
        try {
            const funData = await fs.readJson(funDataPath);
            
            return {
                active: true,
                type: funThread.type,
                messagesSent: funThread.index || 0,
                totalMessages: funData.length,
                loopsCompleted: Math.floor((funThread.index || 0) / funData.length),
                userID: funThread.userID,
                running: funThread.active || false
            };
        } catch (error) {
            return {
                active: false,
                error: error.message
            };
        }
    },
    
    async listFunTypes() {
        const funDir = path.join(__dirname, '../../../data/fun-json/');
        
        try {
            if (!await fs.pathExists(funDir)) {
                return [];
            }
            
            const files = await fs.readdir(funDir);
            const funTypes = files
                .filter(file => file.endsWith('.json'))
                .map(file => file.replace('.json', ''))
                .sort();
            
            return funTypes;
        } catch (error) {
            logger.error('Error listing fun types:', error);
            return [];
        }
    },
    
    async getFunInfo(funType) {
        const funDataPath = path.join(__dirname, '../../../data/fun-json/', `${funType}.json`);
        
        try {
            if (!await fs.pathExists(funDataPath)) {
                return null;
            }
            
            const funData = await fs.readJson(funDataPath);
            const stats = fs.statSync(funDataPath);
            
            return {
                type: funType,
                messageCount: funData.length,
                fileSize: (stats.size / 1024).toFixed(2) + ' KB',
                lastModified: stats.mtime,
                sampleMessages: funData.slice(0, 3)
            };
        } catch (error) {
            return null;
        }
    }
};