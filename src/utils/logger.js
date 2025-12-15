const fs = require('fs');
const path = require('path');
const moment = require('moment');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../../data/logs');
    this.ensureLogDir();
  }
  
  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }
  
  getLogFilePath() {
    const date = moment().format('YYYY-MM-DD');
    return path.join(this.logDir, `${date}.log`);
  }
  
  log(level, message, data = null) {
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
    let logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    if (data) {
      logMessage += `\n${JSON.stringify(data, null, 2)}`;
    }
    
    // Console output
    console.log(logMessage);
    
    // File output
    const logFile = this.getLogFilePath();
    fs.appendFileSync(logFile, logMessage + '\n\n');
    
    // Update stats if command executed
    if (level === 'command') {
      this.updateCommandStats();
    }
  }
  
  updateCommandStats() {
    const statsPath = path.join(this.logDir, 'stats.json');
    let stats = { totalCommands: 0, lastUpdated: new Date().toISOString() };
    
    if (fs.existsSync(statsPath)) {
      stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
    }
    
    stats.totalCommands = (stats.totalCommands || 0) + 1;
    stats.lastUpdated = new Date().toISOString();
    
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  }
  
  info(message, data = null) {
    this.log('info', message, data);
  }
  
  error(message, data = null) {
    this.log('error', message, data);
  }
  
  warn(message, data = null) {
    this.log('warn', message, data);
  }
  
  command(message, data = null) {
    this.log('command', message, data);
  }
}

module.exports = new Logger();