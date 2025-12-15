const guard = require('../secure/guard');
const logger = require('../utils/logger');
const rateLimiter = require('../utils/rateLimiter');
const validator = require('../utils/validator');
const cache = require('../utils/cache');

class CommandProcessor {
  constructor() {
    this.middlewares = [
      this.validateInput.bind(this),
      this.checkRateLimit.bind(this),
      this.checkPermissions.bind(this),
      this.logCommand.bind(this),
      this.executeCommand.bind(this)
    ];
  }
  
  async process(api, event, command, args) {
    const context = {
      api,
      event,
      command,
      args,
      userId: event.senderID,
      threadId: event.threadID,
      startTime: Date.now(),
      shouldContinue: true,
      response: null,
      error: null
    };
    
    try {
      // Run through middleware chain
      for (const middleware of this.middlewares) {
        if (!context.shouldContinue) break;
        await middleware(context);
      }
      
      return context.response;
    } catch (error) {
      logger.error('Command processing error:', error);
      context.error = error;
      return this.handleError(context);
    }
  }
  
  // Middleware 1: Validate input
  async validateInput(context) {
    const { command, args, event } = context;
    
    // Validate command name
    if (!validator.isValidCommandInput(command, 1, 50)) {
      context.shouldContinue = false;
      context.response = '❌ Invalid command name';
      return;
    }
    
    // Validate arguments
    for (const arg of args) {
      if (!validator.isValidCommandInput(arg, 0, 500)) {
        context.shouldContinue = false;
        context.response = '❌ Invalid command arguments';
        return;
      }
    }
    
    // Validate message context
    if (!event.threadID || !event.senderID) {
      context.shouldContinue = false;
      context.response = '❌ Invalid message context';
      return;
    }
  }
  
  // Middleware 2: Check rate limits
  async checkRateLimit(context) {
    const { userId, threadId, command } = context;
    
    // Check user command rate limit
    if (!rateLimiter.checkUserCommand(userId)) {
      context.shouldContinue = false;
      context.response = '⚠️ Rate limit exceeded. Please wait a moment.';
      return;
    }
    
    // Check thread message rate limit
    if (!rateLimiter.checkThreadMessage(threadId)) {
      context.shouldContinue = false;
      context.response = '⚠️ Too many messages in this thread. Please slow down.';
      return;
    }
    
    // Special rate limits for specific commands
    if (command.startsWith('startfun')) {
      const funType = context.args[0];
      if (!rateLimiter.checkFunCommand(userId, funType)) {
        context.shouldContinue = false;
        context.response = '⚠️ Too many fun commands. Please wait before starting another.';
        return;
      }
    }
    
    if (guard.isAdmin(userId) && !guard.isOwner(userId)) {
      if (!rateLimiter.checkAdminAction(userId)) {
        context.shouldContinue = false;
        context.response = '⚠️ Admin action rate limit exceeded.';
        return;
      }
    }
  }
  
  // Middleware 3: Check permissions
  async checkPermissions(context) {
    const { userId, command } = context;
    
    // Get command category
    const commandCategory = this.getCommandCategory(command);
    
    // Check permissions based on category
    switch (commandCategory) {
      case 'owner':
        if (!guard.isOwner(userId)) {
          context.shouldContinue = false;
          context.response = '❌ Owner access required for this command.';
          return;
        }
        break;
        
      case 'admin':
        if (!guard.isAdmin(userId) && !guard.isOwner(userId)) {
          context.shouldContinue = false;
          context.response = '❌ Admin access required for this command.';
          return;
        }
        break;
        
      case 'fun':
        if (!guard.isAdmin(userId) && !guard.isOwner(userId)) {
          context.shouldContinue = false;
          context.response = '❌ Admin/Owner access required for fun commands.';
          return;
        }
        break;
        
      case 'user':
        // All users can access
        break;
        
      default:
        context.shouldContinue = false;
        context.response = '❌ Unknown command category.';
        return;
    }
  }
  
  // Middleware 4: Log command
  async logCommand(context) {
    const { userId, threadId, command, args, startTime } = context;
    
    logger.command('Command execution', {
      userId,
      threadId,
      command,
      args: args.join(' '),
      timestamp: new Date().toISOString()
    });
    
    // Update statistics
    const stats = require('../utils/stats');
    stats.recordCommand(command, userId, threadId);
    
    if (command.includes('fun')) {
      const funType = args[0];
      if (funType) stats.recordFunUsage(funType, userId);
    }
  }
  
  // Middleware 5: Execute command
  async executeCommand(context) {
    const { api, event, command, args } = context;
    
    // Get command handler
    const handler = this.getCommandHandler(command);
    if (!handler) {
      context.shouldContinue = false;
      context.response = `❌ Command "${command}" not found. Use !help for available commands.`;
      return;
    }
    
    // Check cache for command result
    const cacheKey = `cmd_result:${command}:${JSON.stringify(args)}:${event.senderID}`;
    const cachedResult = cache.get(cacheKey);
    
    if (cachedResult && !this.shouldSkipCache(command)) {
      context.response = cachedResult;
      context.cached = true;
      return;
    }
    
    // Execute command
    try {
      const result = await handler(api, event, args);
      
      // Cache result if appropriate
      if (result && this.shouldCacheCommand(command)) {
        cache.set(cacheKey, result, 60); // Cache for 1 minute
      }
      
      context.response = result;
      context.executionTime = Date.now() - context.startTime;
      
      logger.debug('Command executed successfully', {
        command,
        executionTime: context.executionTime,
        cached: context.cached
      });
      
    } catch (error) {
      context.error = error;
      context.shouldContinue = false;
      throw error;
    }
  }
  
  // Helper methods
  getCommandCategory(command) {
    const ownerCommands = ['emergencystop', 'shutdown', 'addadmin', 'removeadmin', 'diagnostics', 'reloadconfig', 'execute', 'backup', 'cleanup'];
    const adminCommands = ['startfun', 'stopfun', 'managegroups', 'editadminphoto', 'updatefun'];
    const funCommands = ['startfun', 'stopfun'];
    const userCommands = ['help', 'info', 'stats'];
    
    if (ownerCommands.includes(command)) return 'owner';
    if (adminCommands.includes(command)) return 'admin';
    if (funCommands.includes(command)) return 'fun';
    if (userCommands.includes(command)) return 'user';
    
    return 'unknown';
  }
  
  getCommandHandler(command) {
    try {
      // Try to load from different command directories
      const commandDirs = ['normal', 'admin', 'owner', 'fun'];
      
      for (const dir of commandDirs) {
        try {
          const handlerPath = require.resolve(`../commands/${dir}/${command}`);
          delete require.cache[handlerPath];
          return require(handlerPath);
        } catch (error) {
          // Continue to next directory
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Error loading command handler:', error);
      return null;
    }
  }
  
  shouldCacheCommand(command) {
    // Commands that should be cached
    const cacheableCommands = ['help', 'info', 'stats'];
    return cacheableCommands.includes(command);
  }
  
  shouldSkipCache(command) {
    // Commands that should never be cached
    const nonCacheableCommands = ['startfun', 'stopfun', 'execute', 'emergencystop'];
    return nonCacheableCommands.includes(command);
  }
  
  handleError(context) {
    const { error, userId, command } = context;
    
    // Log the error
    logger.error('Command execution error:', {
      userId,
      command,
      error: error.message,
      stack: error.stack
    });
    
    // User-friendly error message
    let errorMessage = '❌ An error occurred while processing your command.';
    
    if (guard.isAdmin(userId) || guard.isOwner(userId)) {
      errorMessage += `\n\nDebug: ${error.message}`;
    }
    
    return errorMessage;
  }
  
  // Utility method to process all commands
  async processMessage(api, event) {
    const message = event.body?.trim() || '';
    const prefix = require('../../config/config.json').prefix;
    
    if (!message.startsWith(prefix)) {
      return null; // Not a command
    }
    
    const withoutPrefix = message.slice(prefix.length);
    const parts = withoutPrefix.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    return await this.process(api, event, command, args);
  }
}

module.exports = new CommandProcessor();