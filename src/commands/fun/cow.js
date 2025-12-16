const fs = require('fs-extra');
const path = require('path');
const delay = require('../../utils/delay');

module.exports = {
    name: 'cow',
    description: 'Cow fun command',
    type: 'fun',
    
    async execute(api, threadID, bot, userID) {
        const funDataPath = path.join(__dirname, '../../../data/fun-json/cow.json');
        
        if (!await fs.pathExists(funDataPath)) {
            await api.sendMessage("❌ cow.json data file not found!", threadID);
            return;
        }
        
        const funData = await fs.readJson(funDataPath);
        
        if (!bot.funThreads.has(threadID)) {
            bot.funThreads.set(threadID, {
                type: 'cow',
                index: 0,
                interval: null,
                active: true,
                userID: userID
            });
        }
        
        await api.sendMessage("🐄 Starting COW fun! Type !stopfun to stop.", threadID);
        
        const funThread = bot.funThreads.get(threadID);
        let iteration = 0;
        
        funThread.interval = setInterval(async () => {
            try {
                if (!funThread.active) {
                    clearInterval(funThread.interval);
                    return;
                }
                
                const message = funData[funThread.index % funData.length];
                
                // Add cow variations
                let finalMessage = message;
                const cowEmojis = ['🐄', '🐮', '🥛', '🍦', '🧀'];
                const randomCow = cowEmojis[Math.floor(Math.random() * cowEmojis.length)];
                
                if (iteration % 4 === 0) {
                    finalMessage = `${randomCow} ${message} ${randomCow}`;
                }
                
                await api.sendMessage(finalMessage, threadID);
                
                funThread.index++;
                iteration++;
                
                const waitTime = await delay.funDelay(iteration);
                await delay.sleep(waitTime);
                
                // Cow farm updates
                if (iteration % 20 === 0) {
                    const farmUpdates = [
                        "গরু চরছে মাঠে! 🌾",
                        "গরু দুধ দিচ্ছে! 🥛",
                        "গরু ঘুমাচ্ছে! 💤",
                        "গরু ডাকছে! 🔊"
                    ];
                    const randomUpdate = farmUpdates[Math.floor(Math.random() * farmUpdates.length)];
                    
                    await api.sendMessage(
                        `📊 Cow Farm Report:\n` +
                        `• ${randomUpdate}\n` +
                        `• Total moos: ${iteration}\n` +
                        `• Farm Status: HAPPY 🐮`,
                        threadID
                    );
                    await delay.humanDelay();
                }
                
            } catch (error) {
                console.error("Cow fun error:", error);
                clearInterval(funThread.interval);
                bot.funThreads.delete(threadID);
            }
        }, 500);
        
        setTimeout(() => {
            if (funThread.active) {
                clearInterval(funThread.interval);
                bot.funThreads.delete(threadID);
                api.sendMessage("⏰ Cow fun auto-stopped after 5 minutes!", threadID);
            }
        }, 5 * 60 * 1000);
    },
    
    stop(threadID, bot) {
        if (bot.funThreads.has(threadID)) {
            const funThread = bot.funThreads.get(threadID);
            if (funThread.type === 'cow') {
                clearInterval(funThread.interval);
                bot.funThreads.delete(threadID);
                return true;
            }
        }
        return false;
    }
};