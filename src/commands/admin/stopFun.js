const delay = require('../../utils/delay');
const logger = require('../../utils/logger');

// Import fun modules for stopping
const chorFun = require('../fun/chor');
const murgiFun = require('../fun/murgi');
const abalFun = require('../fun/abal');
const seniorFun = require('../fun/senior');
const cowFun = require('../fun/cow');
const goatFun = require('../fun/goat');

module.exports = {
    name: 'stopfun',
    description: 'Stop all fun commands in current thread',
    usage: '!stopfun',
    category: 'admin',
    
    async execute(api, threadID, bot, senderID) {
        try {
            // Check if any fun is active in this thread
            if (!bot.funThreads.has(threadID)) {
                await api.sendMessage(
                    "⚠️ No active fun commands in this thread!\n" +
                    "Use !startfun <type> to start fun.",
                    threadID
                );
                return;
            }
            
            const funThread = bot.funThreads.get(threadID);
            const funType = funThread.type;
            
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
            
            // Send stopping message
            await api.sendMessage(
                `🛑 Stopping ${funType.toUpperCase()} fun...\n` +
                "Please wait...",
                threadID
            );
            
            await delay.humanDelay();
            
            // Stop the specific fun type
            let stopped = false;
            switch (funType) {
                case 'chor':
                    stopped = chorFun.stop(threadID, bot);
                    break;
                case 'murgi':
                    stopped = murgiFun.stop(threadID, bot);
                    break;
                case 'abal':
                    stopped = abalFun.stop(threadID, bot);
                    break;
                case 'senior':
                    stopped = seniorFun.stop(threadID, bot);
                    break;
                case 'cow':
                    stopped = cowFun.stop(threadID, bot);
                    break;
                case 'goat':
                    stopped = goatFun.stop(threadID, bot);
                    break;
                default:
                    // Generic stop for unknown types
                    if (funThread.interval) {
                        clearInterval(funThread.interval);
                    }
                    bot.funThreads.delete(threadID);
                    stopped = true;
            }
            
            if (stopped) {
                // Log the stop
                logger.info(
                    `Fun stopped: ${funType} by ${userName} (${senderID}) in thread ${threadID}\n` +
                    `Messages sent: ${funThread.index || 0}`
                );
                
                // Send success message
                await api.sendMessage(
                    `✅ Successfully stopped ${funType.toUpperCase()} fun!\n` +
                    `📊 Messages sent: ${funThread.index || 0}\n` +
                    "Thanks for using the fun commands! 😊",
                    threadID
                );
                
                // Update bot state if no more active fun threads
                if (bot.funThreads.size === 0) {
                    bot.funActive = false;
                }
            } else {
                await api.sendMessage(
                    `❌ Failed to stop ${funType} fun!\n` +
                    "Please try again or contact the bot owner.",
                    threadID
                );
            }
            
        } catch (error) {
            logger.error(`Error stopping fun in thread ${threadID}:`, error);
            await api.sendMessage(
                "❌ Error stopping fun commands!\n" +
                "Please try again or contact the bot owner.",
                threadID
            );
        }
    },
    
    async stopAllFun(bot) {
        try {
            let stoppedCount = 0;
            const threads = Array.from(bot.funThreads.keys());
            
            for (const threadID of threads) {
                const funThread = bot.funThreads.get(threadID);
                
                if (funThread && funThread.interval) {
                    clearInterval(funThread.interval);
                    bot.funThreads.delete(threadID);
                    stoppedCount++;
                }
            }
            
            bot.funActive = false;
            logger.info(`Stopped all fun commands in ${stoppedCount} threads`);
            
            return {
                success: true,
                stoppedCount: stoppedCount,
                message: `Stopped fun in ${stoppedCount} threads`
            };
        } catch (error) {
            logger.error('Error stopping all fun:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    async emergencyStop(api, bot, reason = "Emergency stop by owner") {
        try {
            logger.warn(`EMERGENCY STOP: ${reason}`);
            
            // Stop all fun threads
            const stopResult = await this.stopAllFun(bot);
            
            // Notify all active threads
            const threads = Array.from(bot.funThreads.keys());
            for (const threadID of threads) {
                try {
                    await api.sendMessage(
                        `🚨 **EMERGENCY STOP** 🚨\n` +
                        `Reason: ${reason}\n` +
                        `All fun commands have been stopped.\n` +
                        `Contact the bot owner for more information.`,
                        threadID
                    );
                } catch (error) {
                    logger.warn(`Could not notify thread ${threadID}:`, error.message);
                }
            }
            
            return {
                success: true,
                threadsNotified: threads.length,
                ...stopResult
            };
        } catch (error) {
            logger.error('Emergency stop failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    async getActiveFun(bot) {
        const activeFun = [];
        
        for (const [threadID, funData] of bot.funThreads.entries()) {
            activeFun.push({
                threadID,
                type: funData.type,
                messagesSent: funData.index || 0,
                userID: funData.userID,
                active: funData.active || false
            });
        }
        
        return activeFun;
    },
    
    async stopFunByType(bot, type) {
        try {
            let stoppedCount = 0;
            const threadsToStop = [];
            
            for (const [threadID, funData] of bot.funThreads.entries()) {
                if (funData.type === type) {
                    threadsToStop.push(threadID);
                }
            }
            
            for (const threadID of threadsToStop) {
                const funData = bot.funThreads.get(threadID);
                if (funData && funData.interval) {
                    clearInterval(funData.interval);
                    bot.funThreads.delete(threadID);
                    stoppedCount++;
                }
            }
            
            // Update bot state if no more active fun
            if (bot.funThreads.size === 0) {
                bot.funActive = false;
            }
            
            return {
                success: true,
                type: type,
                stoppedCount: stoppedCount,
                message: `Stopped ${type} fun in ${stoppedCount} threads`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
};