#!/usr/bin/env node

const path = require('path');
const MessengerAPI = require('../src/utils/api');
const Logger = require('../src/utils/logger');
const Statistics = require('../src/utils/stats');
const CommandProcessor = require('../src/middleware/commandProcessor');
const APIServer = require('./api');
const WebSocketServer = require('./websocket');
const HealthMonitor = require('../src/system/healthMonitor');
const MetricsCollector = require('../src/utils/metrics');

// Configuration
const CONFIG = {
  appStatePath: path.join(__dirname, '../src/secure/appstats.json'),
  apiPort: process.env.API_PORT || 3001,
  enableAPI: process.env.ENABLE_API !== 'false',
  enableWebSocket: process.env.ENABLE_WEBSOCKET !== 'false',
  enableMetrics: process.env.ENABLE_METRICS !== 'false'
};

class ExtendedBot {
  constructor() {
    this.api = new MessengerAPI(CONFIG.appStatePath);
    this.commandProcessor = CommandProcessor;
    this.isRunning = false;
    this.apiServer = null;
    this.wsServer = null;
    this.healthMonitor = HealthMonitor;
    this.metrics = MetricsCollector;
  }

  async start() {
    try {
      Logger.info('🚀 Starting Extended Ultra Professional Messenger Bot...');
      
      // Start metrics collector
      if (CONFIG.enableMetrics) {
        this.metrics.startPeriodicUpdates();
        Logger.info('✅ Metrics collector started');
      }
      
      // Start health monitoring
      this.healthMonitor.start();
      Logger.info('✅ Health monitoring started');
      
      // Login to Facebook
      await this.api.login();
      
      // Set up event listeners
      this.setupEventListeners();
      
      this.isRunning = true;
      Logger.info('✅ Bot is now running and listening for messages');
      
      // Start API server
      if (CONFIG.enableAPI) {
        this.startAPIServer();
      }
      
      // Initialize global state
      this.initializeGlobalState();
      
      // Start uptime timer
      this.startUptimeTimer();
      
    } catch (error) {
      Logger.error('Failed to start bot:', error);
      
      // Attempt restart after delay
      setTimeout(() => this.start(), 10000);
    }
  }

  startAPIServer() {
    try {
      this.apiServer = new APIServer(this);
      const server = this.apiServer.start();
      
      // Start WebSocket server
      if (CONFIG.enableWebSocket) {
        this.wsServer = new WebSocketServer(server, this);
        Logger.info('✅ WebSocket server started');
      }
      
      Logger.info(`✅ API Server running on port ${CONFIG.apiPort}`);
      
    } catch (error) {
      Logger.error('Failed to start API server:', error);
    }
  }

  initializeGlobalState() {
    global.activeThreads = 0;
    global.funIntervals = {};
    global.pendingOperations = [];
    global.commandHistory = [];
    global.userSessions = new Map();
    
    // Initialize cache manager
    const CacheManager = require('../src/utils/cache');
    global.cacheManager = CacheManager;
    
    Logger.info('✅ Global state initialized');
  }

  startUptimeTimer() {
    this.uptimeInterval = setInterval(() => {
      // Update metrics
      if (this.metrics && this.metrics.updateUptime) {
        this.metrics.updateUptime();
      }
      
      // Broadcast status via WebSocket
      if (this.wsServer) {
        this.wsServer.broadcastBotStatusChange(this.isRunning ? 'running' : 'stopped');
      }
      
    }, 60000); // Every minute
  }

  setupEventListeners() {
    const api = this.api.api;
    
    api.listen((err, event) => {
      if (err) {
        Logger.error('Listen error:', err);
        return;
      }
      
      this.handleEvent(event);
    });
  }

  async handleEvent(event) {
    // Record metrics
    if (this.metrics) {
      this.metrics.recordMessage();
    }
    
    switch (event.type) {
      case 'message':
        await this.handleMessage(event);
        break;
        
      case 'event':
        await this.handleSystemEvent(event);
        break;
        
      case 'message_reply':
        await this.handleMessageReply(event);
        break;
    }
    
    // Update health monitor
    this.healthMonitor.recordMessage();
  }

  async handleMessage(event) {
    // Mark as read
    await this.api.markAsRead(event.threadID).catch(console.error);
    
    // Process command if it's a command
    if (event.body?.startsWith('!')) {
      await this.commandProcessor.processMessage(this.api.api, event);
      
      // Broadcast via WebSocket if enabled
      if (this.wsServer) {
        this.wsServer.broadcastMessageSent(event);
      }
    }
    
    // Update active threads count
    this.updateActiveThreads(event.threadID);
  }

  updateActiveThreads(threadId) {
    if (!global.activeThreadsSet) {
      global.activeThreadsSet = new Set();
    }
    
    global.activeThreadsSet.add(threadId);
    global.activeThreads = global.activeThreadsSet.size;
    
    // Update metrics
    if (this.metrics) {
      this.metrics.setActiveThreads(global.activeThreads);
    }
  }

  async handleSystemEvent(event) {
    Logger.info('System event received:', { type: event.logMessageType });
    
    switch (event.logMessageType) {
      case 'log:subscribe':
        await this.handleJoinEvent(event);
        break;
        
      case 'log:unsubscribe':
        await this.handleLeaveEvent(event);
        break;
        
      case 'log:thread-name':
        await this.handleThreadNameChange(event);
        break;
        
      case 'log:thread-color':
        await this.handleThreadColorChange(event);
        break;
        
      case 'log:thread-icon':
        await this.handleThreadIconChange(event);
        break;
    }
  }

  async handleJoinEvent(event) {
    const addedParticipants = event.logMessageData.addedParticipants || [];
    
    for (const participant of addedParticipants) {
      if (participant.userFbId === this.api.api.getCurrentUserID()) {
        Logger.info('Bot was added to a new thread', {
          threadID: event.threadID,
          adder: event.author
        });
        
        // Send welcome message
        const welcomeMsg = `🤖 Thank you for adding me!\n\n` +
          `Use !help to see available commands.\n` +
          `Use !info for bot information.\n\n` +
          `🔧 This bot is powered by Ultra Professional Messenger Bot v${require('../package.json').version}`;
        
        await this.api.sendMessage(event.threadID, welcomeMsg).catch(console.error);
        
        // Broadcast via WebSocket
        if (this.wsServer) {
          this.wsServer.broadcastAdminAction('bot_added', event.author);
        }
      }
    }
  }

  async handleLeaveEvent(event) {
    const leftParticipants = event.logMessageData.leftParticipants || [];
    
    for (const participant of leftParticipants) {
      if (participant.userFbId === this.api.api.getCurrentUserID()) {
        Logger.info('Bot was removed from a thread', {
          threadID: event.threadID,
          remover: event.author
        });
        
        // Broadcast via WebSocket
        if (this.wsServer) {
          this.wsServer.broadcastAdminAction('bot_removed', event.author);
        }
        
        // Update active threads
        if (global.activeThreadsSet) {
          global.activeThreadsSet.delete(event.threadID);
          global.activeThreads = global.activeThreadsSet.size;
        }
      }
    }
  }

  async handleThreadNameChange(event) {
    Logger.info('Thread name changed', {
      threadID: event.threadID,
      newName: event.logMessageData.name
    });
  }

  async handleThreadColorChange(event) {
    Logger.info('Thread color changed', {
      threadID: event.threadID,
      color: event.logMessageData.color
    });
  }

  async handleThreadIconChange(event) {
    Logger.info('Thread icon changed', {
      threadID: event.threadID,
      emoji: event.logMessageData.emoji
    });
  }

  async handleMessageReply(event) {
    Logger.info('Message reply received', {
      threadID: event.threadID,
      senderID: event.senderID
    });
  }

  async stop() {
    Logger.info('🛑 Stopping Extended Bot...');
    
    this.isRunning = false;
    
    // Clear intervals
    if (this.uptimeInterval) {
      clearInterval(this.uptimeInterval);
    }
    
    // Stop health monitoring
    this.healthMonitor.stop();
    
    // Stop metrics
    if (this.metrics) {
      this.metrics.stop();
    }
    
    // Clean up fun intervals
    if (global.funIntervals) {
      Object.values(global.funIntervals).forEach(interval => {
        clearInterval(interval);
      });
      global.funIntervals = {};
    }
    
    // Clean up pending operations
    if (global.pendingOperations) {
      global.pendingOperations.forEach(op => clearTimeout(op));
      global.pendingOperations = [];
    }
    
    // Stop API server
    if (this.apiServer) {
      this.apiServer.stop();
    }
    
    // Stop WebSocket server
    if (this.wsServer) {
      this.wsServer.close();
    }
    
    Logger.info('✅ Extended Bot stopped successfully');
  }

  // Public methods for API access
  async getBotStatus() {
    return {
      running: this.isRunning,
      uptime: process.uptime(),
      version: require('../package.json').version,
      apiEnabled: CONFIG.enableAPI,
      wsEnabled: CONFIG.enableWebSocket,
      activeThreads: global.activeThreads || 0,
      activeFuns: global.funIntervals ? Object.keys(global.funIntervals).length : 0,
      memory: process.memoryUsage(),
      lastRestart: this.startTime || new Date().toISOString()
    };
  }

  async executeAdminCommand(command, args, threadId, userId) {
    // This method allows API to execute commands
    const event = {
      senderID: userId,
      threadID: threadId,
      body: `!${command} ${args.join(' ')}`.trim(),
      type: 'message'
    };
    
    return await this.commandProcessor.process(this.api.api, event, command, args);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  bot.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  bot.stop();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  Logger.error('Uncaught exception:', error);
  // Don't exit, attempt to recover
});

process.on('unhandledRejection', (reason, promise) => {
  Logger.error('Unhandled rejection:', reason);
});

// Start the bot
const bot = new ExtendedBot();
bot.start();

// Export for testing
module.exports = ExtendedBot;