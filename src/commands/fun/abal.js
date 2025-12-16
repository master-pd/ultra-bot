const fs = require('fs-extra');
const path = require('path');
const delay = require('../../utils/delay');

module.exports = {
    name: 'abal',
    description: 'Abal fun command',
    type: 'fun',
    
    async execute(api, threadID, bot, userID) {
        const funDataPath = path.join(__dirname, '../../../data/fun-json/abal.json');
        
        if (!await fs.pathExists(funDataPath)) {
            await api.sendMessage("❌ abal.json data file not found!", threadID);
            return;
        }
        
        const funData = await fs.readJson(funDataPath);
        
        if (!bot.funThreads.has(threadID)) {
            bot.funThreads.set(threadID, {
                type: 'abal',
                index: 0,
                interval: null,
                active: true,
                userID: userID
            });
        }
        
        await api.sendMessage("🤪 Starting ABAL fun! Type !stopfun to stop.", threadID);
        
        const funThread = bot.funThreads.get(threadID);
        let iteration = 0;
        
        funThread.interval = setInterval(async () => {
            try {
                if (!funThread.active) {
                    clearInterval(funThread.interval);
                    return;
                }
                
                const message = funData[funThread.index % funData.length];
                
                // Add crazy variations
                let finalMessage = message;
                if (iteration % 4 === 0) {
                    finalMessage = message.toUpperCase() + "!!!";
                } else if (iteration % 6 === 0) {
                    finalMessage = `🎭 ${message} 🤡`;
                }
                
                await api.sendMessage(finalMessage, threadID);
                
                funThread.index++;
                iteration++;
                
                const waitTime = await delay.funDelay(iteration);
                await delay.sleep(waitTime);
                
                // Random abal reactions
                if (iteration % 12 === 0) {
                    const reactions = [
                        "আবাল পাওয়ার ম্যাক্স! 💥",
                        "আবাল লেভেল 업! 📈",
                        "আবাল অ্যাটাক! ⚔️",
                        "আবাল ডিফেন্স! 🛡️"
                    ];
                    const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
                    
                    await api.sendMessage(
                        `📊 Abal Status:\n` +
                        `• ${randomReaction}\n` +
                        `• Messages: ${iteration}\n` +
                        `• আবাল মোড: ACTIVE 🚀`,
                        threadID
                    );
                    await delay.humanDelay();
                }
                
            } catch (error) {
                console.error("Abal fun error:", error);
                clearInterval(funThread.interval);
                bot.funThreads.delete(threadID);
            }
        }, 500);
        
        setTimeout(() => {
            if (funThread.active) {
                clearInterval(funThread.interval);
                bot.funThreads.delete(threadID);
                api.sendMessage("⏰ Abal fun auto-stopped after 5 minutes!", threadID);
            }
        }, 5 * 60 * 1000);
    },
    
    stop(threadID, bot) {
        if (bot.funThreads.has(threadID)) {
            const funThread = bot.funThreads.get(threadID);
            if (funThread.type === 'abal') {
                clearInterval(funThread.interval);
                bot.funThreads.delete(threadID);
                return true;
            }
        }
        return false;
    }
};