const statsManager = require('../../utils/stats');
const delay = require('../../utils/delay');
const moment = require('moment');

module.exports = {
    name: 'stats',
    description: 'Show bot statistics',
    usage: '!stats [daily/hourly]',
    category: 'admin',
    
    async execute(api, threadID, bot) {
        try {
            await delay.typingDelay(api, threadID, 1000);
            
            const stats = statsManager.getStats();
            
            let statsMessage = "📊 **YOUR CRUSH BOT STATISTICS** 📊\n";
            statsMessage += "══════════════════════════════════════\n\n";
            
            // Uptime
            statsMessage += "⏰ **UPTIME:**\n";
            statsMessage += `• Total: ${stats.general.uptime.days}d ${stats.general.uptime.hours}h ${stats.general.uptime.minutes}m\n`;
            statsMessage += `• Started: ${moment(stats.general.startTime).format('YYYY-MM-DD HH:mm:ss')}\n\n`;
            
            // Messages
            statsMessage += "💬 **MESSAGES:**\n";
            statsMessage += `• Sent: ${stats.general.messages.sent}\n`;
            statsMessage += `• Received: ${stats.general.messages.received}\n`;
            statsMessage += `• Total: ${stats.general.messages.total}\n`;
            statsMessage += `• Success Rate: ${stats.general.messages.successRate}\n\n`;
            
            // Commands
            statsMessage += "⚡ **COMMANDS:**\n";
            statsMessage += `• Executed: ${stats.general.commands.executed}\n`;
            statsMessage += `• Fun Commands: ${stats.general.commands.funExecuted}\n`;
            statsMessage += `• Unique Commands: ${stats.commands.totalUnique}\n\n`;
            
            // Users & Groups
            statsMessage += "👥 **USERS & GROUPS:**\n";
            statsMessage += `• Total Users: ${stats.general.users.total}\n`;
            statsMessage += `• Active Today: ${stats.general.users.activeToday}\n`;
            statsMessage += `• Total Groups: ${stats.general.groups.total}\n`;
            statsMessage += `• Active Today: ${stats.general.groups.activeToday}\n\n`;
            
            // Errors
            statsMessage += "❌ **ERRORS:** " + stats.general.errors + "\n\n";
            
            // Top Commands
            if (stats.commands.top.length > 0) {
                statsMessage += "🏆 **TOP 5 COMMANDS:**\n";
                stats.commands.top.forEach((cmd, i) => {
                    statsMessage += `${i + 1}. ${cmd.command}: ${cmd.count} times (${cmd.uniqueUsers} users, ${cmd.successRate}% success)\n`;
                });
                statsMessage += "\n";
            }
            
            // Fun Commands
            if (stats.commands.fun.length > 0) {
                statsMessage += "🎮 **FUN COMMANDS:**\n";
                stats.commands.fun.forEach(cmd => {
                    statsMessage += `• ${cmd.type}: ${cmd.count} times in ${cmd.uniqueThreads} threads\n`;
                });
                statsMessage += "\n";
            }
            
            // Today's Activity
            const today = stats.daily.today;
            statsMessage += "📈 **TODAY'S ACTIVITY:**\n";
            statsMessage += `• Messages: ${today.messagesSent + today.messagesReceived}\n`;
            statsMessage += `• Commands: ${today.commandsExecuted}\n`;
            statsMessage += `• Fun Commands: ${today.funCommandsExecuted}\n`;
            statsMessage += `• Active Users: ${today.activeUsers}\n`;
            statsMessage += `• Active Groups: ${today.activeGroups}\n\n`;
            
            // Bot Status
            statsMessage += "🔧 **BOT STATUS:**\n";
            statsMessage += `• Running: ${bot.isRunning ? '✅ Yes' : '❌ No'}\n`;
            statsMessage += `• Fun Active: ${bot.funActive ? '✅ Yes' : '❌ No'}\n`;
            statsMessage += `• Active Threads: ${bot.funThreads ? bot.funThreads.size : 0}\n`;
            statsMessage += `• Memory Usage: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB\n\n`;
            
            // Last 7 Days Summary
            const last7Days = stats.daily.last7Days;
            const avgMessages = last7Days.reduce((sum, day) => 
                sum + day.messagesSent + day.messagesReceived, 0) / 7;
            const avgCommands = last7Days.reduce((sum, day) => 
                sum + day.commandsExecuted, 0) / 7;
            
            statsMessage += "📅 **LAST 7 DAYS AVERAGE:**\n";
            statsMessage += `• Messages/Day: ${avgMessages.toFixed(1)}\n`;
            statsMessage += `• Commands/Day: ${avgCommands.toFixed(1)}\n\n`;
            
            statsMessage += "══════════════════════════════════════\n";
            statsMessage += `📅 Report Date: ${moment().format('YYYY-MM-DD HH:mm:ss')}\n`;
            statsMessage += "🤖 YOUR CRUSH BOT - RANA (MASTER 🪓)\n";
            
            await api.sendMessage(statsMessage, threadID);
            
        } catch (error) {
            console.error("Stats command error:", error);
            api.sendMessage("❌ Error showing statistics. Please try again.", threadID);
        }
    }
};