const fs = require('fs');
const path = require('path');
const moment = require('moment');

class Statistics {
  constructor() {
    this.statsPath = path.join(__dirname, '../../data/logs/advanced_stats.json');
    this.initStats();
  }
  
  initStats() {
    if (!fs.existsSync(this.statsPath)) {
      const initialStats = {
        daily: {},
        hourly: {},
        commands: {},
        users: {},
        threads: {},
        funUsage: {},
        startTime: new Date().toISOString(),
        totalUptime: 0
      };
      this.saveStats(initialStats);
    }
  }
  
  getStats() {
    return JSON.parse(fs.readFileSync(this.statsPath, 'utf8'));
  }
  
  saveStats(stats) {
    fs.writeFileSync(this.statsPath, JSON.stringify(stats, null, 2));
  }
  
  recordCommand(command, userId, threadId) {
    const stats = this.getStats();
    const now = moment();
    const date = now.format('YYYY-MM-DD');
    const hour = now.format('YYYY-MM-DD-HH');
    
    // Daily stats
    if (!stats.daily[date]) stats.daily[date] = { commands: 0, users: new Set() };
    stats.daily[date].commands++;
    stats.daily[date].users.add(userId);
    
    // Hourly stats
    if (!stats.hourly[hour]) stats.hourly[hour] = 0;
    stats.hourly[hour]++;
    
    // Command stats
    if (!stats.commands[command]) stats.commands[command] = 0;
    stats.commands[command]++;
    
    // User stats
    if (!stats.users[userId]) stats.users[userId] = { commands: 0, lastSeen: now.toISOString() };
    stats.users[userId].commands++;
    stats.users[userId].lastSeen = now.toISOString();
    
    // Thread stats
    if (!stats.threads[threadId]) stats.threads[threadId] = { commands: 0, users: new Set() };
    stats.threads[threadId].commands++;
    stats.threads[threadId].users.add(userId);
    
    // Update uptime
    const startTime = moment(stats.startTime);
    stats.totalUptime = moment().diff(startTime, 'seconds');
    
    this.saveStats(stats);
  }
  
  recordFunUsage(funType, userId) {
    const stats = this.getStats();
    
    if (!stats.funUsage[funType]) stats.funUsage[funType] = 0;
    stats.funUsage[funType]++;
    
    this.saveStats(stats);
  }
  
  getSummary() {
    const stats = this.getStats();
    
    const totalCommands = Object.values(stats.commands).reduce((a, b) => a + b, 0);
    const uniqueUsers = Object.keys(stats.users).length;
    const uniqueThreads = Object.keys(stats.threads).length;
    
    return {
      totalCommands,
      uniqueUsers,
      uniqueThreads,
      mostUsedCommand: Object.entries(stats.commands).sort((a, b) => b[1] - a[1])[0] || ['none', 0],
      uptime: stats.totalUptime,
      funUsage: stats.funUsage
    };
  }
}

module.exports = new Statistics();