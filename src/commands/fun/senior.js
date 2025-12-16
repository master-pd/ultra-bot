const fs = require('fs-extra');
const path = require('path');
const delay = require('../../utils/delay');

module.exports = {
    name: 'senior',
    description: 'Senior fun command',
    type: 'fun',
    
    async execute(api, threadID, bot, userID) {
        const funDataPath = path.join(__dirname, '../../../data/fun-json/senior.json');
        
        if (!await fs.pathExists(funDataPath)) {
            await api.sendMessage("❌ senior.json data file not found!", threadID);
            return;
        }
        
        const funData = await fs.readJson(funDataPath);
        
        if (!bot.funThreads.has(threadID)) {
            bot.funThreads.set(threadID, {
                type: 'senior',
                index: 0,
                interval: null,
                active: true,
                userID: userID
            });
        }
        
        await api.sendMessage("👴 Starting SENIOR fun! Type !stopfun to stop.", threadID);
        
        const funThread = bot.funThreads.get(threadID);
        let iteration = 0;
        
        funThread.interval = setInterval(async () => {
            try {
                if (!funThread.active) {
                    clearInterval(funThread.interval);
                    return;
                }
                
                const message = funData[funThread.index % funData.length];
                
                // Add senior-style variations
                let finalMessage = message;
                if (iteration % 5 === 0) {
                    finalMessage = `🧓 ${message} 👨‍🏫`;
                } else if (iteration % 8 === 0) {
                    finalMessage = `📚 ${message} 🎓`;
                }
                
                await api.sendMessage(finalMessage, threadID);
                
                funThread.index++;
                iteration++;
                
                const waitTime = await delay.funDelay(iteration);
                await delay.sleep(waitTime);
                
                // Senior wisdom
                if (iteration % 15 === 0) {
                    const wisdom = [
                        "সিনিয়রের পরামর্শ: ধৈর্য ধরুন! 💡",
                        "সিনিয়র টিপ: শিখতে থাকুন! 📖",
                        "সিনিয়র উপদেশ: সাহসী হোন! 🦁",
                        "সিনিয়র বুদ্ধি: পরিকল্পনা করুন! 📝"
                    ];
                    const randomWisdom = wisdom[Math.floor(Math.random() * wisdom.length)];
                    
                    await api.sendMessage(
                        `📊 Senior Update:\n` +
                        `• ${randomWisdom}\n` +
                        `• Messages shared: ${iteration}\n` +
                        `• Seniority Level: EXPERT 🎩`,
                        threadID
                    );
                    await delay.humanDelay();
                }
                
            } catch (error) {
                console.error("Senior fun error:", error);
                clearInterval(funThread.interval);
                bot.funThreads.delete(threadID);
            }
        }, 500);
        
        setTimeout(() => {
            if (funThread.active) {
                clearInterval(funThread.interval);
                bot.funThreads.delete(threadID);
                api.sendMessage("⏰ Senior fun auto-stopped after 5 minutes!", threadID);
            }
        }, 5 * 60 * 1000);
    },
    
    stop(threadID, bot) {
        if (bot.funThreads.has(threadID)) {
            const funThread = bot.funThreads.get(threadID);
            if (funThread.type === 'senior') {
                clearInterval(funThread.interval);
                bot.funThreads.delete(threadID);
                return true;
            }
        }
        return false;
    }
};