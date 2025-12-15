const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../src/utils/logger');
const guard = require('../src/secure/guard');
const metrics = require('../src/utils/metrics');

class APIServer {
  constructor(botInstance) {
    this.app = express();
    this.bot = botInstance;
    this.port = process.env.API_PORT || 3001;
    this.jwtSecret = process.env.JWT_SECRET || 'ultra-professional-bot-secret-key-change-in-production';
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  setupMiddleware() {
    // Security headers
    this.app.use(helmet());
    
    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true
    }));
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // limit each IP to 100 requests per windowMs
    });
    this.app.use('/api/', limiter);
    
    // Logging
    this.app.use(morgan('combined', {
      stream: {
        write: (message) => logger.info(message.trim())
      }
    }));
    
    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Static files
    this.app.use('/dashboard', express.static(path.join(__dirname, '../public/dashboard')));
    
    // Error handling
    this.app.use((err, req, res, next) => {
      logger.error('API Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  setupRoutes() {
    // Public routes
    this.app.get('/api/health', this.healthCheck.bind(this));
    this.app.post('/api/auth/login', this.login.bind(this));
    
    // Protected routes
    const router = express.Router();
    
    // Auth middleware
    router.use(this.authenticate.bind(this));
    
    // Bot status
    router.get('/status', this.getStatus.bind(this));
    router.get('/stats', this.getStats.bind(this));
    router.get('/metrics', this.getMetrics.bind(this));
    
    // User management
    router.get('/users', this.getUsers.bind(this));
    router.get('/users/:id', this.getUser.bind(this));
    
    // Thread management
    router.get('/threads', this.getThreads.bind(this));
    router.get('/threads/:id', this.getThread.bind(this));
    router.delete('/threads/:id', this.leaveThread.bind(this));
    
    // Command execution
    router.post('/commands/execute', this.executeCommand.bind(this));
    router.get('/commands', this.getCommands.bind(this));
    
    // Fun system
    router.get('/fun/active', this.getActiveFuns.bind(this));
    router.post('/fun/start', this.startFun.bind(this));
    router.post('/fun/stop', this.stopFun.bind(this));
    router.get('/fun/types', this.getFunTypes.bind(this));
    
    // Admin management
    router.get('/admins', this.getAdmins.bind(this));
    router.post('/admins', this.addAdmin.bind(this));
    router.delete('/admins/:id', this.removeAdmin.bind(this));
    
    // System management
    router.get('/system/logs', this.getLogs.bind(this));
    router.post('/system/restart', this.restartBot.bind(this));
    router.post('/system/backup', this.createBackup.bind(this));
    router.get('/system/backups', this.listBackups.bind(this));
    
    // Owner only routes
    router.use('/owner', this.requireOwner.bind(this));
    router.post('/owner/shutdown', this.shutdownBot.bind(this));
    router.post('/owner/update', this.updateBot.bind(this));
    
    this.app.use('/api', router);
  }

  setupWebSocket() {
    const WebSocket = require('ws');
    this.wss = new WebSocket.Server({ noServer: true });
    
    this.wss.on('connection', (ws, req) => {
      logger.info('WebSocket client connected');
      
      // Authenticate WebSocket connection
      const token = req.headers['sec-websocket-protocol'];
      if (!this.verifyToken(token)) {
        ws.close(1008, 'Unauthorized');
        return;
      }
      
      // Send initial data
      this.sendInitialData(ws);
      
      // Handle messages
      ws.on('message', (message) => {
        this.handleWebSocketMessage(ws, message);
      });
      
      // Handle disconnect
      ws.on('close', () => {
        logger.info('WebSocket client disconnected');
      });
    });
  }

  // Authentication methods
  async login(req, res) {
    const { uid, password } = req.body;
    
    try {
      // Verify user is owner or admin
      const isOwner = guard.isOwner(uid);
      const isAdmin = guard.isAdmin(uid);
      
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      // Get user info from Facebook API
      let userInfo = {};
      try {
        const info = await this.bot.api.getUserInfo([uid]);
        userInfo = info[uid] || {};
      } catch (error) {
        logger.warn('Could not fetch user info:', error);
      }
      
      // Generate JWT token
      const token = jwt.sign(
        {
          uid,
          name: userInfo.name || 'Unknown',
          isOwner,
          isAdmin,
          permissions: isOwner ? ['owner', 'admin', 'user'] : ['admin', 'user']
        },
        this.jwtSecret,
        { expiresIn: '24h' }
      );
      
      logger.info('API login successful', { uid, isOwner, isAdmin });
      
      res.json({
        token,
        user: {
          uid,
          name: userInfo.name,
          profilePic: userInfo.thumbSrc,
          isOwner,
          isAdmin
        }
      });
      
    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }

  authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  requireOwner(req, res, next) {
    if (!req.user.isOwner) {
      return res.status(403).json({ error: 'Owner access required' });
    }
    next();
  }

  verifyToken(token) {
    try {
      jwt.verify(token, this.jwtSecret);
      return true;
    } catch {
      return false;
    }
  }

  // API Route Handlers
  async healthCheck(req, res) {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      bot: this.bot.isRunning ? 'running' : 'stopped',
      version: require('../package.json').version
    };
    
    res.json(health);
  }

  async getStatus(req, res) {
    const status = {
      bot: {
        running: this.bot.isRunning,
        uptime: process.uptime(),
        version: require('../package.json').version,
        memory: process.memoryUsage()
      },
      system: {
        platform: process.platform,
        node: process.version,
        pid: process.pid
      },
      connections: {
        activeThreads: global.activeThreads || 0,
        activeFuns: global.funIntervals ? Object.keys(global.funIntervals).length : 0,
        wsClients: this.wss.clients.size
      }
    };
    
    res.json(status);
  }

  async getStats(req, res) {
    try {
      const statsModule = require('../src/utils/stats');
      const stats = statsModule.getSummary();
      
      const rateLimiter = require('../src/utils/rateLimiter');
      const rateStats = rateLimiter.getStats();
      
      const cache = require('../src/utils/cache');
      const cacheStats = cache.getStats();
      
      res.json({
        commands: stats,
        rateLimits: rateStats,
        cache: cacheStats,
        metrics: await metrics.getMetrics()
      });
      
    } catch (error) {
      logger.error('Error getting stats:', error);
      res.status(500).json({ error: 'Failed to get statistics' });
    }
  }

  async getMetrics(req, res) {
    try {
      const metricsData = await metrics.getMetrics();
      res.set('Content-Type', metrics.register.contentType);
      res.send(metricsData);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  }

  async getUsers(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      
      const statsModule = require('../src/utils/stats');
      const stats = statsModule.getStats();
      
      // Get unique users from stats
      const users = Object.entries(stats.users || {}).map(([uid, data]) => ({
        uid,
        commands: data.commands || 0,
        lastSeen: data.lastSeen,
        isAdmin: guard.isAdmin(uid),
        isOwner: guard.isOwner(uid)
      }));
      
      // Sort by last seen (newest first)
      users.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
      
      // Paginate
      const paginatedUsers = users.slice(offset, offset + limit);
      
      res.json({
        users: paginatedUsers,
        total: users.length,
        limit,
        offset
      });
      
    } catch (error) {
      logger.error('Error getting users:', error);
      res.status(500).json({ error: 'Failed to get users' });
    }
  }

  async getUser(req, res) {
    const { id } = req.params;
    
    try {
      // Get user info from Facebook
      const userInfo = await this.bot.api.getUserInfo([id]);
      const user = userInfo[id];
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Get user stats
      const statsModule = require('../src/utils/stats');
      const stats = statsModule.getStats();
      const userStats = stats.users?.[id] || {};
      
      res.json({
        uid: id,
        name: user.name,
        profilePic: user.thumbSrc,
        gender: user.gender,
        isFriend: user.isFriend,
        isAdmin: guard.isAdmin(id),
        isOwner: guard.isOwner(id),
        stats: {
          commands: userStats.commands || 0,
          lastSeen: userStats.lastSeen
        }
      });
      
    } catch (error) {
      logger.error('Error getting user:', error);
      res.status(500).json({ error: 'Failed to get user info' });
    }
  }

  async getThreads(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const threadList = await this.bot.api.getThreadList(limit, null, ['INBOX']);
      
      const threads = await Promise.all(
        threadList.map(async (thread) => {
          const participantInfo = await this.bot.api.getUserInfo(thread.participantIDs.slice(0, 10));
          
          return {
            id: thread.threadID,
            name: thread.name || 'Unnamed',
            type: thread.isGroup ? 'group' : 'personal',
            participantCount: thread.participantIDs.length,
            adminCount: thread.adminIDs?.length || 0,
            participants: Object.values(participantInfo).map(p => ({
              id: p.id,
              name: p.name,
              profilePic: p.thumbSrc
            })),
            lastActivity: new Date(thread.timestamp).toISOString(),
            isArchived: thread.isArchived,
            unreadCount: thread.unreadCount
          };
        })
      );
      
      res.json({
        threads,
        total: threadList.length
      });
      
    } catch (error) {
      logger.error('Error getting threads:', error);
      res.status(500).json({ error: 'Failed to get threads' });
    }
  }

  async getThread(req, res) {
    const { id } = req.params;
    
    try {
      const threadInfo = await this.bot.api.getThreadInfo(id);
      const participantInfo = await this.bot.api.getUserInfo(threadInfo.participantIDs);
      
      const thread = {
        id: threadInfo.threadID,
        name: threadInfo.name || 'Unnamed',
        type: threadInfo.isGroup ? 'group' : 'personal',
        participants: Object.values(participantInfo).map(p => ({
          id: p.id,
          name: p.name,
          profilePic: p.thumbSrc,
          isAdmin: threadInfo.adminIDs?.includes(p.id) || false
        })),
        participantCount: threadInfo.participantIDs.length,
        adminCount: threadInfo.adminIDs?.length || 0,
        created: new Date(threadInfo.timestamp).toISOString(),
        emoji: threadInfo.emoji,
        color: threadInfo.color,
        nicknames: threadInfo.nicknames,
        settings: threadInfo.settings,
        isSubscribed: threadInfo.isSubscribed
      };
      
      res.json(thread);
      
    } catch (error) {
      logger.error('Error getting thread:', error);
      res.status(500).json({ error: 'Failed to get thread info' });
    }
  }

  async leaveThread(req, res) {
    const { id } = req.params;
    
    if (!req.user.isOwner && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
      await this.bot.api.removeUserFromGroup(this.bot.api.getCurrentUserID(), id);
      
      logger.info('Bot left thread via API', {
        threadId: id,
        userId: req.user.uid
      });
      
      res.json({ success: true, message: 'Left thread successfully' });
      
    } catch (error) {
      logger.error('Error leaving thread:', error);
      res.status(500).json({ error: 'Failed to leave thread' });
    }
  }

  async executeCommand(req, res) {
    const { command, threadId, args = [] } = req.body;
    
    if (!req.user.isOwner && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
      // Create mock event
      const event = {
        senderID: req.user.uid,
        threadID: threadId,
        body: `!${command} ${args.join(' ')}`.trim(),
        type: 'message'
      };
      
      // Process command
      const commandProcessor = require('../src/middleware/commandProcessor');
      const result = await commandProcessor.process(
        this.bot.api,
        event,
        command,
        args
      );
      
      res.json({
        success: true,
        command,
        args,
        threadId,
        result,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Error executing command:', error);
      res.status(500).json({ error: 'Command execution failed' });
    }
  }

  async getCommands(req, res) {
    const commands = {
      user: ['help', 'info', 'stats'],
      admin: ['startfun', 'stopfun', 'managegroups', 'editadminphoto', 'updatefun'],
      owner: ['emergencystop', 'shutdown', 'addadmin', 'removeadmin', 'diagnostics', 'reloadconfig', 'execute', 'backup', 'cleanup']
    };
    
    res.json(commands);
  }

  async getActiveFuns(req, res) {
    try {
      const funEngine = require('../src/utils/funEngine');
      const activeFuns = funEngine.getActiveFuns();
      
      res.json({
        active: activeFuns,
        total: activeFuns.length
      });
      
    } catch (error) {
      logger.error('Error getting active funs:', error);
      res.status(500).json({ error: 'Failed to get active funs' });
    }
  }

  async startFun(req, res) {
    const { type, threadId } = req.body;
    
    if (!req.user.isOwner && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
      const funEngine = require('../src/utils/funEngine');
      const result = await funEngine.startFun(
        this.bot.api,
        threadId,
        type,
        req.user.uid
      );
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
      
    } catch (error) {
      logger.error('Error starting fun:', error);
      res.status(500).json({ error: 'Failed to start fun' });
    }
  }

  async stopFun(req, res) {
    const { threadId } = req.body;
    
    if (!req.user.isOwner && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
      const funEngine = require('../src/utils/funEngine');
      const result = await funEngine.stopFun(threadId);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
      
    } catch (error) {
      logger.error('Error stopping fun:', error);
      res.status(500).json({ error: 'Failed to stop fun' });
    }
  }

  async getFunTypes(req, res) {
    try {
      const funEngine = require('../src/utils/funEngine');
      const types = funEngine.getFunTypes();
      const funInfo = types.map(type => funEngine.getFunInfo(type));
      
      res.json({
        types,
        details: funInfo.filter(info => info !== null)
      });
      
    } catch (error) {
      logger.error('Error getting fun types:', error);
      res.status(500).json({ error: 'Failed to get fun types' });
    }
  }

  async getAdmins(req, res) {
    if (!req.user.isOwner) {
      return res.status(403).json({ error: 'Owner access required' });
    }
    
    try {
      const config = require('../config/config.json');
      const adminIds = config.admins || [];
      
      // Get admin info
      const adminInfo = await Promise.all(
        adminIds.map(async (uid) => {
          try {
            const info = await this.bot.api.getUserInfo([uid]);
            return {
              uid,
              name: info[uid]?.name || 'Unknown',
              profilePic: info[uid]?.thumbSrc,
              added: 'Unknown' // You might want to track when admins were added
            };
          } catch (error) {
            return {
              uid,
              name: 'Unknown (could not fetch)',
              profilePic: null,
              added: 'Unknown'
            };
          }
        })
      );
      
      res.json({
        admins: adminInfo,
        total: adminInfo.length,
        maxAdminPhotos: config.maxAdminPhotos || 3
      });
      
    } catch (error) {
      logger.error('Error getting admins:', error);
      res.status(500).json({ error: 'Failed to get admins' });
    }
  }

  async addAdmin(req, res) {
    if (!req.user.isOwner) {
      return res.status(403).json({ error: 'Owner access required' });
    }
    
    const { uid } = req.body;
    
    if (!uid) {
      return res.status(400).json({ error: 'User ID required' });
    }
    
    try {
      const configPath = path.join(__dirname, '../config/config.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      
      if (config.admins.includes(uid)) {
        return res.status(400).json({ error: 'User is already an admin' });
      }
      
      config.admins.push(uid);
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      
      logger.info('Admin added via API', {
        addedBy: req.user.uid,
        newAdmin: uid
      });
      
      res.json({
        success: true,
        message: 'Admin added successfully',
        uid,
        totalAdmins: config.admins.length
      });
      
    } catch (error) {
      logger.error('Error adding admin:', error);
      res.status(500).json({ error: 'Failed to add admin' });
    }
  }

  async removeAdmin(req, res) {
    if (!req.user.isOwner) {
      return res.status(403).json({ error: 'Owner access required' });
    }
    
    const { id } = req.params;
    
    try {
      const configPath = path.join(__dirname, '../config/config.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      
      const index = config.admins.indexOf(id);
      if (index === -1) {
        return res.status(404).json({ error: 'User is not an admin' });
      }
      
      config.admins.splice(index, 1);
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      
      logger.info('Admin removed via API', {
        removedBy: req.user.uid,
        removedAdmin: id
      });
      
      res.json({
        success: true,
        message: 'Admin removed successfully',
        uid: id,
        totalAdmins: config.admins.length
      });
      
    } catch (error) {
      logger.error('Error removing admin:', error);
      res.status(500).json({ error: 'Failed to remove admin' });
    }
  }

  async getLogs(req, res) {
    if (!req.user.isOwner && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
      const logDir = path.join(__dirname, '../data/logs');
      const date = req.query.date || new Date().toISOString().split('T')[0];
      const logFile = path.join(logDir, `${date}.log`);
      
      let logs = [];
      if (await fs.access(logFile).then(() => true).catch(() => false)) {
        const content = await fs.readFile(logFile, 'utf8');
        logs = content.split('\n').filter(line => line.trim());
      }
      
      // Filter by level if specified
      const level = req.query.level;
      if (level) {
        logs = logs.filter(line => line.includes(`[${level.toUpperCase()}]`));
      }
      
      // Paginate
      const limit = parseInt(req.query.limit) || 100;
      const page = parseInt(req.query.page) || 1;
      const offset = (page - 1) * limit;
      
      const paginatedLogs = logs.slice(offset, offset + limit);
      
      res.json({
        date,
        logs: paginatedLogs,
        total: logs.length,
        page,
        limit,
        hasMore: offset + limit < logs.length
      });
      
    } catch (error) {
      logger.error('Error getting logs:', error);
      res.status(500).json({ error: 'Failed to get logs' });
    }
  }

  async restartBot(req, res) {
    if (!req.user.isOwner && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
      logger.info('Bot restart requested via API', { userId: req.user.uid });
      
      // Schedule restart in 5 seconds
      setTimeout(() => {
        process.exit(0);
      }, 5000);
      
      res.json({
        success: true,
        message: 'Bot will restart in 5 seconds',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Error restarting bot:', error);
      res.status(500).json({ error: 'Failed to restart bot' });
    }
  }

  async createBackup(req, res) {
    if (!req.user.isOwner && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
      const backupScheduler = require('../scripts/backup-scheduler');
      const backupPath = await backupScheduler.createBackup('manual-api');
      
      res.json({
        success: true,
        message: 'Backup created successfully',
        path: backupPath,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Error creating backup:', error);
      res.status(500).json({ error: 'Failed to create backup' });
    }
  }

  async listBackups(req, res) {
    if (!req.user.isOwner && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
      const backupScheduler = require('../scripts/backup-scheduler');
      const backups = await backupScheduler.listBackups();
      
      res.json({
        success: true,
        backups,
        total: backups.length
      });
      
    } catch (error) {
      logger.error('Error listing backups:', error);
      res.status(500).json({ error: 'Failed to list backups' });
    }
  }

  async shutdownBot(req, res) {
    // Owner only
    try {
      logger.info('Bot shutdown requested via API', { userId: req.user.uid });
      
      // Schedule shutdown in 10 seconds
      setTimeout(() => {
        process.exit(0);
      }, 10000);
      
      res.json({
        success: true,
        message: 'Bot will shutdown in 10 seconds',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Error shutting down bot:', error);
      res.status(500).json({ error: 'Failed to shutdown bot' });
    }
  }

  async updateBot(req, res) {
    // Owner only
    try {
      const autoUpdater = require('../src/system/autoUpdater');
      const updateInfo = await autoUpdater.checkForUpdates();
      
      if (!updateInfo) {
        return res.json({
          success: false,
          message: 'No updates available',
          currentVersion: autoUpdater.currentVersion
        });
      }
      
      // Start update in background
      autoUpdater.performUpdate(updateInfo).catch(error => {
        logger.error('Auto-update failed:', error);
      });
      
      res.json({
        success: true,
        message: 'Update started in background',
        updateInfo,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Error updating bot:', error);
      res.status(500).json({ error: 'Failed to update bot' });
    }
  }

  // WebSocket methods
  sendInitialData(ws) {
    const initialData = {
      type: 'initial',
      data: {
        status: this.bot.isRunning ? 'running' : 'stopped',
        uptime: process.uptime(),
        activeThreads: global.activeThreads || 0,
        timestamp: new Date().toISOString()
      }
    };
    
    ws.send(JSON.stringify(initialData));
  }

  handleWebSocketMessage(ws, message) {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'subscribe':
          this.handleSubscription(ws, data);
          break;
          
        case 'unsubscribe':
          this.handleUnsubscription(ws, data);
          break;
          
        case 'command':
          this.handleWebSocketCommand(ws, data);
          break;
          
        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Unknown message type'
          }));
      }
    } catch (error) {
      logger.error('WebSocket message error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  }

  handleSubscription(ws, data) {
    const { channel } = data;
    
    // Store subscription
    ws.subscriptions = ws.subscriptions || new Set();
    ws.subscriptions.add(channel);
    
    logger.debug('WebSocket subscription', {
      channel,
      clientId: ws._socket.remoteAddress
    });
    
    ws.send(JSON.stringify({
      type: 'subscribed',
      channel,
      timestamp: new Date().toISOString()
    }));
  }

  handleUnsubscription(ws, data) {
    const { channel } = data;
    
    if (ws.subscriptions) {
      ws.subscriptions.delete(channel);
    }
    
    ws.send(JSON.stringify({
      type: 'unsubscribed',
      channel,
      timestamp: new Date().toISOString()
    }));
  }

  handleWebSocketCommand(ws, data) {
    const { command, args } = data;
    
    // Check permissions via JWT in WebSocket protocol
    // For now, just log
    logger.info('WebSocket command received', {
      command,
      args,
      clientId: ws._socket.remoteAddress
    });
    
    ws.send(JSON.stringify({
      type: 'command_result',
      command,
      result: 'Command received (not implemented in WebSocket)',
      timestamp: new Date().toISOString()
    }));
  }

  // Broadcast to all connected WebSocket clients
  broadcast(data) {
    const message = JSON.stringify(data);
    
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // Broadcast specific events
  broadcastMessageSent(message) {
    this.broadcast({
      type: 'message_sent',
      data: {
        threadId: message.threadID,
        senderId: message.senderID,
        message: message.body?.substring(0, 100),
        timestamp: new Date().toISOString()
      }
    });
  }

  broadcastFunStarted(funInfo) {
    this.broadcast({
      type: 'fun_started',
      data: funInfo
    });
  }

  broadcastFunStopped(funInfo) {
    this.broadcast({
      type: 'fun_stopped',
      data: funInfo
    });
  }

  broadcastBotStatus(status) {
    this.broadcast({
      type: 'bot_status',
      data: {
        status,
        timestamp: new Date().toISOString()
      }
    });
  }

  start() {
    const server = this.app.listen(this.port, () => {
      logger.info(`API Server running on port ${this.port}`);
      logger.info(`Dashboard available at http://localhost:${this.port}/dashboard`);
    });
    
    // Attach WebSocket server to HTTP server
    server.on('upgrade', (request, socket, head) => {
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit('connection', ws, request);
      });
    });
    
    return server;
  }

  stop() {
    if (this.server) {
      this.server.close();
      logger.info('API Server stopped');
    }
    
    if (this.wss) {
      this.wss.close();
      logger.info('WebSocket server stopped');
    }
  }
}

module.exports = APIServer;