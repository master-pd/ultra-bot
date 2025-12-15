const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const { getRandomDelay, delay } = require('./delay');

class FunEngine {
  constructor() {
    this.activeFuns = new Map(); // threadId -> { type, interval, index, lines }
    this.funTemplates = {};
    this.loadTemplates();
  }
  
  async loadTemplates() {
    const funDir = path.join(__dirname, '../../data/fun-json');
    
    try {
      const files = await fs.readdir(funDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      for (const file of jsonFiles) {
        const funType = path.basename(file, '.json');
        const filePath = path.join(funDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        
        try {
          this.funTemplates[funType] = JSON.parse(content);
          logger.info(`Loaded fun template: ${funType} (${this.funTemplates[funType].length} lines)`);
        } catch (error) {
          logger.error(`Error parsing ${file}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error loading fun templates:', error);
    }
  }
  
  async startFun(api, threadId, funType, userId) {
    // Check if already running in this thread
    if (this.activeFuns.has(threadId)) {
      return { success: false, error: 'Fun already running in this thread' };
    }
    
    // Validate fun type
    if (!this.funTemplates[funType]) {
      return { success: false, error: `Unknown fun type: ${funType}` };
    }
    
    const lines = this.funTemplates[funType];
    if (lines.length === 0) {
      return { success: false, error: 'No lines available for this fun type' };
    }
    
    let currentIndex = 0;
    
    // Create interval for sending messages
    const interval = setInterval(async () => {
      if (currentIndex >= lines.length) {
        currentIndex = 0; // Loop back to start
      }
      
      const line = lines[currentIndex];
      currentIndex++;
      
      try {
        // Send with typing indicator
        await api.sendTypingIndicator(threadId);
        await delay(getRandomDelay(200, 400)); // Typing delay
        
        // Send the message
        await api.sendMessage(line, threadId);
        
        // Update stats
        const stats = require('./stats');
        stats.recordFunUsage(funType, userId);
        
      } catch (error) {
        logger.error('Error sending fun message:', error);
        
        // If sending fails, stop the fun
        this.stopFun(threadId);
        api.sendMessage('❌ Error sending fun message. Fun stopped.', threadId);
      }
    }, getRandomDelay(300, 600)); // Message interval
    
    // Store active fun
    this.activeFuns.set(threadId, {
      type: funType,
      interval,
      index: currentIndex,
      lines,
      userId,
      startTime: Date.now(),
      messageCount: 0
    });
    
    logger.info('Fun started', {
      threadId,
      funType,
      userId,
      totalLines: lines.length
    });
    
    return { success: true, message: `✅ ${funType} fun started!` };
  }
  
  stopFun(threadId) {
    const fun = this.activeFuns.get(threadId);
    
    if (!fun) {
      return { success: false, error: 'No active fun in this thread' };
    }
    
    // Clear interval
    clearInterval(fun.interval);
    
    // Calculate stats
    const duration = Date.now() - fun.startTime;
    const stats = {
      type: fun.type,
      duration: Math.round(duration / 1000),
      messagesSent: fun.messageCount,
      userId: fun.userId
    };
    
    // Remove from active funs
    this.activeFuns.delete(threadId);
    
    logger.info('Fun stopped', stats);
    
    return { 
      success: true, 
      message: `⛔ Fun stopped.\nDuration: ${stats.duration}s\nMessages: ${stats.messagesSent}`,
      stats 
    };
  }
  
  stopAllFuns() {
    const stopped = [];
    
    for (const [threadId, fun] of this.activeFuns.entries()) {
      clearInterval(fun.interval);
      stopped.push({
        threadId,
        type: fun.type,
        duration: Date.now() - fun.startTime
      });
    }
    
    this.activeFuns.clear();
    
    logger.warn('All funs stopped', { stoppedCount: stopped.length });
    return stopped;
  }
  
  getActiveFuns() {
    const active = [];
    
    for (const [threadId, fun] of this.activeFuns.entries()) {
      active.push({
        threadId,
        type: fun.type,
        runningFor: Math.round((Date.now() - fun.startTime) / 1000),
        messagesSent: fun.messageCount,
        userId: fun.userId
      });
    }
    
    return active;
  }
  
  async addFunLine(funType, line) {
    if (!this.funTemplates[funType]) {
      // Create new fun type
      this.funTemplates[funType] = [];
    }
    
    this.funTemplates[funType].push(line);
    
    // Save to file
    const filePath = path.join(__dirname, `../../data/fun-json/${funType}.json`);
    await fs.writeFile(filePath, JSON.stringify(this.funTemplates[funType], null, 2));
    
    logger.info('Fun line added', { funType, line: line.substring(0, 50) });
    
    return { success: true, totalLines: this.funTemplates[funType].length };
  }
  
  async removeFunLine(funType, index) {
    if (!this.funTemplates[funType]) {
      return { success: false, error: 'Fun type not found' };
    }
    
    if (index < 0 || index >= this.funTemplates[funType].length) {
      return { success: false, error: 'Invalid line index' };
    }
    
    const removedLine = this.funTemplates[funType].splice(index, 1)[0];
    
    // Save to file
    const filePath = path.join(__dirname, `../../data/fun-json/${funType}.json`);
    await fs.writeFile(filePath, JSON.stringify(this.funTemplates[funType], null, 2));
    
    logger.info('Fun line removed', { funType, index, line: removedLine.substring(0, 50) });
    
    return { success: true, removedLine, totalLines: this.funTemplates[funType].length };
  }
  
  getFunTypes() {
    return Object.keys(this.funTemplates);
  }
  
  getFunInfo(funType) {
    if (!this.funTemplates[funType]) {
      return null;
    }
    
    return {
      type: funType,
      lineCount: this.funTemplates[funType].length,
      sample: this.funTemplates[funType].slice(0, 3)
    };
  }
  
  getStats() {
    const active = this.getActiveFuns();
    
    return {
      activeFuns: active.length,
      availableTypes: this.getFunTypes().length,
      totalLines: Object.values(this.funTemplates).reduce((sum, lines) => sum + lines.length, 0),
      activeDetails: active
    };
  }
}

module.exports = new FunEngine();