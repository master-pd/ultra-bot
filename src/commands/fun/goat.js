const fs = require('fs-extra');
const path = require('path');
const delay = require('../../utils/delay');

module.exports = {
    name: 'goat',
    description: 'Goat fun command',
    type: 'fun',
    
    async execute(api, threadID, bot, userID) {
        const funDataPath = path.join(__dirname, '../../../data/fun-json/goat.json');
        
        if (!await fs.pathExists(funDataPath)) {
            await api.sendMessage("❌ goat.json data file not found!", threadID);
            return;
        }
        
        const funData = await fs.readJson(funDataPath);
        
        if (!bot.funThreads.has(threadID)) {
            bot.funThreads.set(threadID, {
                type: 'goat',
                index: 0,
                interval: null,
                active: true,
                userID: userID
            });
        }
        
        await api.sendMessage("🐐 Starting GOAT fun! Type !stopfun to stop.", threadID);
        
        const funThread = bot.funThreads.get(threadID);
        let iteration = 0;
        
        funThread.interval = setInterval(async () => {
            try {
                if (!funThread.active) {
                    clearInterval(funThread.interval);
                    return;
                }
                
                const message = funData[funThread.index % funData.length];
                
                // Add goat variations
                let finalMessage = message;
                const goatEmojis = ['🐐', '🐏', '🌿', '🏔️', '⛰️'];
                const randomGoat = goatEmojis[Math.floor(Math.random() * goatEmojis.length)];
                
                if (iteration % 3 === 0) {
                    finalMessage = `${randomGoat} ${message} ${randomGoat}`;
                }
                
                await api.sendMessage(finalMessage, threadID);
                
                funThread.index++;
                iteration++;
                
                const waitTime = await delay.funDelay(iteration);
                await delay.sleep(waitTime);
                
                // Goat mountain adventures
                if (iteration % 18 === 0) {
                    const adventures = [
                        "ছাগল পাহাড়ে চড়ছে! 🏔️",
                        "ছাগল লাফাচ্ছে! 🦘",
                        "ছাগল ঘাস খাচ্ছে! 🌿",
                        "ছাগল দৌড়াচ্ছে! 🏃"
                    ];
                    const randomAdventure = adventures[Math.floor(Math.random() * adventures.length)];
                    
                    await api.sendMessage(
                        `📊 Goat Adventure:\n` +
                        `• ${randomAdventure}\n` +
                        `• Total bleats: ${iteration}\n` +
                        `• Adventure Level: EXTREME 🧗‍♂️`,
                        threadID
                    );
                    await delay.humanDelay();
                }
                
            } catch (error) {
                console.error("Goat fun error:", error);
                clearInterval(funThread.interval);
                bot.funThreads.delete(threadID);
            }
        }, 500);
        
        setTimeout(() => {
            if (funThread.active) {
                clearInterval(funThread.interval);
                bot.funThreads.delete(threadID);
                api.sendMessage("⏰ Goat fun auto-stopped after 5 minutes!", threadID);
            }
        }, 5 * 60 * 1000);
    },
    
    stop(threadID, bot) {
        if (bot.funThreads.has(threadID)) {
            const funThread = bot.funThreads.get(threadID);
            if (funThread.type === 'goat') {
                clearInterval(funThread.interval);
                bot.funThreads.delete(threadID);
                return true;
            }
        }
        return false;
    }
};