#!/usr/bin/env node

const path = require('path');
const MessengerAPI = require('./src/utils/api');
const Logger = require('./src/utils/logger');
const Statistics = require('./src/utils/stats');
const BotHandler = require('./src/index');

// Configuration
const CONFIG = {
  appStatePath: path.join(__dirname, './src/secure/appstats.json'),
  autoReconnect: true,
  reconnectDelay: 5000,
  maxReconnectAttempts: 10
};

class UltraProfessionalBot {
  constructor() {
    this.api = new MessengerAPI(CONFIG.appStatePath);
    this.handler = BotHandler;
    this.isRunning = false;
    this.reconnectAttempts = 0;
  }
  
  async start() {
    try {
      Logger.info('🚀 Starting Ultra Professional Messenger Bot...');
      
      // Login to Facebook
      await this.api.login();
      
      // Set up event listeners
      this.setupEventListeners();
      
      this.isRunning = true;
      Logger.info('✅ Bot is now running and listening for messages');
      
      // Start uptime timer
      this.uptimeInterval = setInterval(() => {
        // Keep-alive
      }, 60000);
      
    } catch (error) {
      Logger.error('Failed to start bot:', error);
      
      if (CONFIG.autoReconnect && this.reconnectAttempts < CONFIG.maxReconnectAttempts) {
        this.reconnectAttempts++;
        Logger.warn(`Reconnection attempt ${this.reconnectAttempts} in ${CONFIG.reconnectDelay}ms`);
        
        setTimeout(() => this.start(), CONFIG.reconnectDelay);
      } else {
        Logger.error('Max reconnection attempts reached. Exiting.');
        process.exit(1);
      }
    }
  }
  
  setupEventListeners() {
    const api = this.api.api; // Get the actual facebook-chat-api instance
    
    api.listen((err, event) => {
      if (err) {
        Logger.error('Listen error:', err);
        return;
      }
      
      switch (event.type) {
        case 'message':
          this.handleMessage(event);
          break;
          
        case 'event':
          this.handleEvent(event);
          break;
          
        case 'message_reply':
          this.handleMessageReply(event);
          break;
      }
    });
  }
  
  handleMessage(event) {
    // Log message
    Logger.command('Message received', {
      threadID: event.threadID,
      senderID: event.senderID,
      message: event.body?.substring(0, 100) + '...'
    });
    
    // Mark as read
    this.api.markAsRead(event.threadID).catch(console.error);
    
    // Process command through handler
    try {
      const args = event.body ? event.body.trim().split(/\s+/) : [];
      this.handler(this.api.api, event, args);
      
      // Record statistics
      Statistics.recordCommand(args[0]?.replace('!', '') || 'unknown', event.senderID, event.threadID);
    } catch (error) {
      Logger.error('Handler error:', error);
      
      // Send error message to user
      this.api.sendMessage(event.threadID, '❌ An error occurred while processing your command.')
        .catch(console.error);
    }
  }
  
  handleEvent(event) {
    Logger.info('Event received:', { type: event.type });
    
    // Handle different event types
    switch (event.logMessageType) {
      case 'log:subscribe':
        this.handleJoin(event);
        break;
      case 'log:unsubscribe':
        this.handleLeave(event);
        break;
      case 'log:thread-name':
        this.handleThreadNameChange(event);
        break;
    }
  }
  
  handleJoin(event) {
    const addedParticipants = event.logMessageData.addedParticipants || [];
    
    addedParticipants.forEach(participant => {
      if (participant.userFbId === this.api.api.getCurrentUserID()) {
        Logger.info('Bot was added to a new thread', {
          threadID: event.threadID,
          adder: event.author
        });
        
        // Send welcome message
        const welcomeMsg = `🤖 Thank you for adding me!\n\nUse !help to see available commands.\nUse !info for bot information.`;
        this.api.sendMessage(event.threadID, welcomeMsg).catch(console.error);
      }
    });
  }
  
  handleLeave(event) {
    const leftParticipants = event.logMessageData.leftParticipants || [];
    
    leftParticipants.forEach(participant => {
      if (participant.userFbId === this.api.api.getCurrentUserID()) {
        Logger.info('Bot was removed from a thread', {
          threadID: event.threadID,
          remover: event.author
        });
      }
    });
  }
  
  handleThreadNameChange(event) {
    Logger.info('Thread name changed', {
      threadID: event.threadID,
      newName: event.logMessageData.name
    });
  }
  
  handleMessageReply(event) {
    // Handle message replies if needed
    Logger.info('Message reply received', {
      threadID: event.threadID,
      senderID: event.senderID
    });
  }
  
  async stop() {
    Logger.info('🛑 Stopping bot...');
    
    this.isRunning = false;
    
    if (this.uptimeInterval) {
      clearInterval(this.uptimeInterval);
    }
    
    // Clean up
    if (global.funIntervals) {
      Object.values(global.funIntervals).forEach(interval => {
        clearInterval(interval);
      });
      global.funIntervals = {};
    }
    
    Logger.info('✅ Bot stopped successfully');
    process.exit(0);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  bot.stop();
});

process.on('SIGTERM', () => {
  bot.stop();
});

// Start the bot
const bot = new UltraProfessionalBot();
bot.start();

// Export for testing
module.exports = UltraProfessionalBot;