const fs = require('fs-extra');
const path = require('path');
const delay = require('../../utils/delay');

module.exports = {
    name: 'murgi',
    description: 'Murgi fun command',
    type: 'fun',
    
    async execute(api, threadID, bot, userID) {
        const funDataPath = path.join(__dirname, '../../../data/fun-json/murgi.json');
        
        if (!await fs.pathExists(funDataPath)) {
            await api.sendMessage("❌ murgi.json data file not found!", threadID);
            return;
        }
        
        const funData = await fs.readJson(funDataPath);
        
        // Store fun data in bot instance
        if (!bot.funThreads.has(threadID)) {
            bot.funThreads.set(threadID, {
                type: 'murgi',
                index: 0,
                interval: null,
                active: true,
                userID: userID
            });
        }
        
        await api.sendMessage("🐔 Starting MURGI fun! Type !stopfun to stop.", threadID);
        
        const funThread = bot.funThreads.get(threadID);
        let iteration = 0;
        
        // Start the fun loop
        funThread.interval = setInterval(async () => {
            try {
                if (!funThread.active) {
                    clearInterval(funThread.interval);
                    return;
                }
                
                const message = funData[funThread.index % funData.length];
                
                // Add chicken emoji variations
                let finalMessage = message;
                const chickenEmojis = ['🐔', '🐓', '🍗', '🥚', '🐤'];
                const randomEmoji = chickenEmojis[Math.floor(Math.random() * chickenEmojis.length)];
                
                if (iteration % 3 === 0) {
                    finalMessage = `${randomEmoji} ${message} ${randomEmoji}`;
                }
                
                await api.sendMessage(finalMessage, threadID);
                
                // Update stats
                funThread.index++;
                iteration++;
                
                // Random delay between messages
                const waitTime = await delay.funDelay(iteration);
                await delay.sleep(waitTime);
                
                // Every 15 messages, send chicken status
                if (iteration % 15 === 0) {
                    const statusMessages = [
                        "মুরগি দৌড়াচ্ছে! 🏃‍♀️",
                        "মুরগি ডিম পেড়েছে! 🥚",
                        "মুরগি উড়ছে! ✈️",
                        "মুরগি খাচ্ছে! 🌾",
                        "মুরগি ডাকছে! 🔊"
                    ];
                    const randomStatus = statusMessages[Math.floor(Math.random() * statusMessages.length)];
                    
                    await api.sendMessage(
                        `📊 Murgi Fun Update:\n` +
                        `• ${randomStatus}\n` +
                        `• Total messages: ${iteration}\n` +
                        `• কুকড়া কু! 🐓`,
                        threadID
                    );
                    await delay.humanDelay();
                }
                
            } catch (error) {
                console.error("Murgi fun error:", error);
                clearInterval(funThread.interval);
                bot.funThreads.delete(threadID);
            }
        }, 500);
        
        // Auto-stop after 5 minutes
        setTimeout(() => {
            if (funThread.active) {
                clearInterval(funThread.interval);
                bot.funThreads.delete(threadID);
                api.sendMessage("⏰ Murgi fun auto-stopped after 5 minutes!", threadID);
            }
        }, 5 * 60 * 1000);
    },
    
    stop(threadID, bot) {
        if (bot.funThreads.has(threadID)) {
            const funThread = bot.funThreads.get(threadID);
            if (funThread.type === 'murgi') {
                clearInterval(funThread.interval);
                bot.funThreads.delete(threadID);
                return true;
            }
        }
        return false;
    }
};