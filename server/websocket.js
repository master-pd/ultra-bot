const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const logger = require('../src/utils/logger');

class WebSocketServer {
  constructor(server, botInstance) {
    this.wss = new WebSocket.Server({ server });
    this.bot = botInstance;
    this.clients = new Map(); // clientId -> {ws, subscriptions, userData}
    this.jwtSecret = process.env.JWT_SECRET || 'ultra-professional-bot-secret-key-change-in-production';
    
    this.setupEventHandlers();
    this.startBroadcastInterval();
  }

  setupEventHandlers() {
    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('close', () => {
      logger.info('WebSocket server closed');
    });

    this.wss.on('error', (error) => {
      logger.error('WebSocket server error:', error);
    });
  }

  async handleConnection(ws, req) {
    const clientId = this.generateClientId(req);
    
    try {
      // Extract and verify token
      const token = this.extractToken(req);
      if (!token) {
        ws.close(1008, 'No authentication token');
        return;
      }

      const userData = jwt.verify(token, this.jwtSecret);
      
      // Store client
      this.clients.set(clientId, {
        ws,
        subscriptions: new Set(),
        userData,
        connectedAt: new Date(),
        lastActivity: new Date()
      });

      logger.info('WebSocket client connected', {
        clientId,
        userId: userData.uid,
        role: userData.isOwner ? 'owner' : 'admin'
      });

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'welcome',
        data: {
          clientId,
          user: userData,
          serverTime: new Date().toISOString(),
          botStatus: this.bot.isRunning ? 'running' : 'stopped'
        }
      });

      // Set up message handler
      ws.on('message', (message) => {
        this.handleMessage(clientId, message);
      });

      // Set up close handler
      ws.on('close', () => {
        this.handleDisconnection(clientId);
      });

      // Set up error handler
      ws.on('error', (error) => {
        logger.error('WebSocket client error:', { clientId, error });
        this.handleDisconnection(clientId);
      });

      // Send initial data
      this.sendInitialData(clientId);

    } catch (error) {
      logger.error('WebSocket connection error:', error);
      ws.close(1008, 'Authentication failed');
    }
  }

  generateClientId(req) {
    const ip = req.socket.remoteAddress;
    const port = req.socket.remotePort;
    const timestamp = Date.now();
    return `${ip}:${port}:${timestamp}`;
  }

  extractToken(req) {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.split(' ')[1];
    }

    // Check WebSocket protocol
    if (req.headers['sec-websocket-protocol']) {
      return req.headers['sec-websocket-protocol'];
    }

    // Check query parameter
    const url = new URL(req.url, `http://${req.headers.host}`);
    return url.searchParams.get('token');
  }

  async handleMessage(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastActivity = new Date();

    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'subscribe':
          this.handleSubscribe(clientId, data);
          break;
          
        case 'unsubscribe':
          this.handleUnsubscribe(clientId, data);
          break;
          
        case 'ping':
          this.sendToClient(clientId, { type: 'pong', timestamp: new Date().toISOString() });
          break;
          
        case 'command':
          this.handleCommand(clientId, data);
          break;
          
        case 'get_status':
          this.sendStatusUpdate(clientId);
          break;
          
        default:
          logger.warn('Unknown WebSocket message type:', { clientId, type: data.type });
          this.sendToClient(clientId, {
            type: 'error',
            message: 'Unknown message type',
            originalType: data.type
          });
      }
    } catch (error) {
      logger.error('Error handling WebSocket message:', { clientId, error });
      this.sendToClient(clientId, {
        type: 'error',
        message: 'Invalid message format'
      });
    }
  }

  handleSubscribe(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { channels } = data;
    
    if (!channels || !Array.isArray(channels)) {
      this.sendToClient(clientId, {
        type: 'error',
        message: 'Invalid subscription request'
      });
      return;
    }

    // Check permissions for each channel
    const allowedChannels = channels.filter(channel => {
      return this.checkChannelPermission(client.userData, channel);
    });

    // Add subscriptions
    allowedChannels.forEach(channel => {
      client.subscriptions.add(channel);
    });

    logger.debug('Client subscribed to channels', {
      clientId,
      userId: client.userData.uid,
      channels: allowedChannels
    });

    this.sendToClient(clientId, {
      type: 'subscribed',
      channels: allowedChannels,
      timestamp: new Date().toISOString()
    });
  }

  handleUnsubscribe(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { channels } = data;
    
    if (channels && Array.isArray(channels)) {
      channels.forEach(channel => {
        client.subscriptions.delete(channel);
      });
    } else {
      // Unsubscribe from all
      client.subscriptions.clear();
    }

    this.sendToClient(clientId, {
      type: 'unsubscribed',
      channels: channels || 'all',
      timestamp: new Date().toISOString()
    });
  }

  checkChannelPermission(userData, channel) {
    // Define channel permissions
    const channelPermissions = {
      'bot_status': ['admin', 'owner'],
      'message_updates': ['admin', 'owner'],
      'fun_updates': ['admin', 'owner'],
      'user_activity': ['admin', 'owner'],
      'system_logs': ['owner'],
      'admin_actions': ['owner'],
      'command_execution': ['admin', 'owner']
    };

    const requiredRole = channelPermissions[channel];
    if (!requiredRole) return false;

    if (requiredRole.includes('owner') && userData.isOwner) return true;
    if (requiredRole.includes('admin') && (userData.isAdmin || userData.isOwner)) return true;

    return false;
  }

  async handleCommand(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { command, args, threadId } = data;
    
    // Check if user can execute commands via WebSocket
    if (!client.userData.isAdmin && !client.userData.isOwner) {
      this.sendToClient(clientId, {
        type: 'command_result',
        success: false,
        error: 'Insufficient permissions'
      });
      return;
    }

    try {
      // Execute command through bot
      const result = await this.executeBotCommand(command, args, threadId, client.userData.uid);
      
      this.sendToClient(clientId, {
        type: 'command_result',
        success: true,
        command,
        result,
        timestamp: new Date().toISOString()
      });

      // Broadcast to other subscribed clients
      this.broadcastToSubscribed('command_execution', {
        userId: client.userData.uid,
        command,
        threadId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Error executing WebSocket command:', error);
      
      this.sendToClient(clientId, {
        type: 'command_result',
        success: false,
        command,
        error: error.message
      });
    }
  }

  async executeBotCommand(command, args, threadId, userId) {
    // Create mock event
    const event = {
      senderID: userId,
      threadID: threadId,
      body: `!${command} ${args.join(' ')}`.trim(),
      type: 'message'
    };

    // Use command processor
    const commandProcessor = require('../src/middleware/commandProcessor');
    return await commandProcessor.process(
      this.bot.api,
      event,
      command,
      args
    );
  }

  sendInitialData(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Send current bot status
    this.sendStatusUpdate(clientId);

    // Send active fun loops
    this.sendActiveFuns(clientId);

    // Send recent activity
    this.sendRecentActivity(clientId);
  }

  sendStatusUpdate(clientId) {
    const client = this.clients.get(clientId);
    if (!client || !client.subscriptions.has('bot_status')) return;

    const status = {
      running: this.bot.isRunning,
      uptime: process.uptime(),
      activeThreads: global.activeThreads || 0,
      activeFuns: global.funIntervals ? Object.keys(global.funIntervals).length : 0,
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };

    this.sendToClient(clientId, {
      type: 'bot_status',
      data: status
    });
  }

  sendActiveFuns(clientId) {
    const client = this.clients.get(clientId);
    if (!client || !client.subscriptions.has('fun_updates')) return;

    try {
      const funEngine = require('../src/utils/funEngine');
      const activeFuns = funEngine.getActiveFuns();

      this.sendToClient(clientId, {
        type: 'active_funs',
        data: activeFuns
      });
    } catch (error) {
      logger.error('Error sending active funs:', error);
    }
  }

  sendRecentActivity(clientId) {
    const client = this.clients.get(clientId);
    if (!client || !client.subscriptions.has('user_activity')) return;

    // This would fetch recent activity from logs
    // For now, send empty array
    this.sendToClient(clientId, {
      type: 'recent_activity',
      data: []
    });
  }

  handleDisconnection(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    logger.info('WebSocket client disconnected', {
      clientId,
      userId: client.userData.uid,
      duration: new Date() - client.connectedAt
    });

    this.clients.delete(clientId);
  }

  sendToClient(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;

    try {
      client.ws.send(JSON.stringify(data));
    } catch (error) {
      logger.error('Error sending WebSocket message:', error);
    }
  }

  broadcastToSubscribed(channel, data) {
    const message = {
      type: channel,
      data,
      timestamp: new Date().toISOString()
    };

    const messageStr = JSON.stringify(message);

    this.clients.forEach((client, clientId) => {
      if (client.subscriptions.has(channel) && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(messageStr);
        } catch (error) {
          logger.error('Error broadcasting to client:', { clientId, error });
        }
      }
    });
  }

  // Event broadcasting methods
  broadcastMessageSent(message) {
    this.broadcastToSubscribed('message_sent', {
      threadId: message.threadID,
      senderId: message.senderID,
      message: message.body?.substring(0, 100),
      timestamp: new Date().toISOString()
    });
  }

  broadcastFunStarted(funInfo) {
    this.broadcastToSubscribed('fun_started', funInfo);
  }

  broadcastFunStopped(funInfo) {
    this.broadcastToSubscribed('fun_stopped', funInfo);
  }

  broadcastBotStatusChange(status) {
    this.broadcastToSubscribed('bot_status_change', {
      status,
      timestamp: new Date().toISOString()
    });
  }

  broadcastAdminAction(action, userId) {
    this.broadcastToSubscribed('admin_actions', {
      action,
      userId,
      timestamp: new Date().toISOString()
    });
  }

  // Periodic updates
  startBroadcastInterval() {
    // Send periodic status updates
    setInterval(() => {
      this.clients.forEach((client, clientId) => {
        if (client.subscriptions.has('bot_status')) {
          this.sendStatusUpdate(clientId);
        }
      });
    }, 30000); // Every 30 seconds

    // Clean up inactive clients
    setInterval(() => {
      this.cleanupInactiveClients();
    }, 60000); // Every minute
  }

  cleanupInactiveClients() {
    const now = new Date();
    const inactiveThreshold = 5 * 60 * 1000; // 5 minutes

    this.clients.forEach((client, clientId) => {
      if (now - client.lastActivity > inactiveThreshold) {
        logger.info('Closing inactive WebSocket client', { clientId });
        client.ws.close(1000, 'Inactive');
        this.clients.delete(clientId);
      }
    });
  }

  getClientStats() {
    return {
      totalClients: this.clients.size,
      clientsByRole: {
        owner: Array.from(this.clients.values()).filter(c => c.userData.isOwner).length,
        admin: Array.from(this.clients.values()).filter(c => c.userData.isAdmin && !c.userData.isOwner).length
      },
      subscriptions: {
        bot_status: Array.from(this.clients.values()).filter(c => c.subscriptions.has('bot_status')).length,
        fun_updates: Array.from(this.clients.values()).filter(c => c.subscriptions.has('fun_updates')).length,
        message_updates: Array.from(this.clients.values()).filter(c => c.subscriptions.has('message_updates')).length
      }
    };
  }

  close() {
    this.wss.close();
    this.clients.clear();
    logger.info('WebSocket server closed');
  }
}

module.exports = WebSocketServer;