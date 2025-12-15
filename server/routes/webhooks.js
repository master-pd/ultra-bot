const express = require('express');
const crypto = require('crypto');
const logger = require('../../src/utils/logger');

class WebhookManager {
  constructor(botInstance) {
    this.router = express.Router();
    this.bot = botInstance;
    this.webhooks = new Map(); // webhookId -> {secret, events, callback}
    
    this.setupRoutes();
    this.setupBuiltinWebhooks();
  }

  setupRoutes() {
    // Register new webhook
    this.router.post('/register', this.registerWebhook.bind(this));
    
    // List webhooks
    this.router.get('/', this.listWebhooks.bind(this));
    
    // Delete webhook
    this.router.delete('/:id', this.deleteWebhook.bind(this));
    
    // Webhook endpoint (receives events)
    this.router.post('/receive/:id', this.receiveWebhook.bind(this));
    
    // Test webhook
    this.router.post('/test/:id', this.testWebhook.bind(this));
  }

  setupBuiltinWebhooks() {
    // Built-in webhooks for common services
    
    // Discord webhook
    this.registerBuiltinWebhook('discord', {
      events: ['message_sent', 'fun_started', 'fun_stopped', 'error_occurred'],
      url: process.env.DISCORD_WEBHOOK_URL,
      secret: process.env.DISCORD_WEBHOOK_SECRET
    });
    
    // Slack webhook
    this.registerBuiltinWebhook('slack', {
      events: ['bot_status_change', 'admin_action'],
      url: process.env.SLACK_WEBHOOK_URL,
      secret: process.env.SLACK_WEBHOOK_SECRET
    });
    
    // Custom API webhook
    if (process.env.CUSTOM_WEBHOOK_URL) {
      this.registerBuiltinWebhook('custom', {
        events: ['all'],
        url: process.env.CUSTOM_WEBHOOK_URL,
        secret: process.env.CUSTOM_WEBHOOK_SECRET
      });
    }
  }

  registerBuiltinWebhook(name, config) {
    if (!config.url) return;
    
    const webhookId = `builtin_${name}`;
    
    this.webhooks.set(webhookId, {
      id: webhookId,
      name,
      type: 'builtin',
      url: config.url,
      secret: config.secret,
      events: config.events,
      active: true,
      createdAt: new Date().toISOString()
    });
    
    logger.info(`Registered built-in webhook: ${name}`);
  }

  async registerWebhook(req, res) {
    const { url, events, secret, name } = req.body;
    
    if (!url || !events || !Array.isArray(events)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Validate URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    
    // Generate webhook ID
    const webhookId = `wh_${crypto.randomBytes(16).toString('hex')}`;
    
    // Store webhook
    this.webhooks.set(webhookId, {
      id: webhookId,
      name: name || 'Unnamed Webhook',
      type: 'custom',
      url,
      secret: secret || crypto.randomBytes(32).toString('hex'),
      events,
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: req.user?.uid || 'system'
    });
    
    logger.info('Webhook registered', {
      webhookId,
      name,
      url,
      events: events.length
    });
    
    res.json({
      success: true,
      webhookId,
      secret: this.webhooks.get(webhookId).secret,
      message: 'Webhook registered successfully'
    });
  }

  listWebhooks(req, res) {
    const webhooks = Array.from(this.webhooks.values()).map(wh => ({
      id: wh.id,
      name: wh.name,
      type: wh.type,
      url: wh.url,
      events: wh.events,
      active: wh.active,
      createdAt: wh.createdAt,
      lastTriggered: wh.lastTriggered
    }));
    
    res.json({
      success: true,
      webhooks,
      total: webhooks.length
    });
  }

  deleteWebhook(req, res) {
    const { id } = req.params;
    
    if (!this.webhooks.has(id)) {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    
    const webhook = this.webhooks.get(id);
    
    // Check permissions for custom webhooks
    if (webhook.type === 'custom' && webhook.createdBy !== req.user?.uid && !req.user?.isOwner) {
      return res.status(403).json({ error: 'Cannot delete webhook created by another user' });
    }
    
    this.webhooks.delete(id);
    
    logger.info('Webhook deleted', { webhookId: id, deletedBy: req.user?.uid });
    
    res.json({
      success: true,
      message: 'Webhook deleted successfully'
    });
  }

  async receiveWebhook(req, res) {
    const { id } = req.params;
    
    if (!this.webhooks.has(id)) {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    
    const webhook = this.webhooks.get(id);
    
    // Verify signature if secret is set
    if (webhook.secret) {
      const signature = req.headers['x-webhook-signature'];
      const payload = JSON.stringify(req.body);
      
      const expectedSignature = crypto
        .createHmac('sha256', webhook.secret)
        .update(payload)
        .digest('hex');
      
      if (signature !== expectedSignature) {
        logger.warn('Invalid webhook signature', { webhookId: id });
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }
    
    // Process webhook event
    const event = req.body;
    
    try {
      await this.processWebhookEvent(webhook, event);
      
      // Update last triggered
      webhook.lastTriggered = new Date().toISOString();
      
      res.json({ success: true, message: 'Webhook processed' });
      
    } catch (error) {
      logger.error('Error processing webhook:', error);
      res.status(500).json({ error: 'Failed to process webhook' });
    }
  }

  async processWebhookEvent(webhook, event) {
    // This is where external services send events TO our bot
    // For example, another service might trigger a bot command
    
    const { type, data } = event;
    
    switch (type) {
      case 'execute_command':
        await this.executeCommandFromWebhook(webhook, data);
        break;
        
      case 'send_message':
        await this.sendMessageFromWebhook(webhook, data);
        break;
        
      case 'update_status':
        await this.updateStatusFromWebhook(webhook, data);
        break;
        
      default:
        logger.warn('Unknown webhook event type:', type);
    }
  }

  async executeCommandFromWebhook(webhook, data) {
    const { command, args, threadId } = data;
    
    if (!command || !threadId) {
      throw new Error('Missing command or threadId');
    }
    
    // Verify webhook has permission for this command
    if (!this.checkWebhookPermission(webhook, command)) {
      throw new Error('Webhook not authorized for this command');
    }
    
    // Execute command
    const event = {
      senderID: `webhook:${webhook.id}`,
      threadID: threadId,
      body: `!${command} ${args.join(' ')}`.trim(),
      type: 'message'
    };
    
    const commandProcessor = require('../../src/middleware/commandProcessor');
    await commandProcessor.process(this.bot.api, event, command, args);
    
    logger.info('Command executed from webhook', {
      webhookId: webhook.id,
      command,
      threadId
    });
  }

  async sendMessageFromWebhook(webhook, data) {
    const { threadId, message } = data;
    
    if (!threadId || !message) {
      throw new Error('Missing threadId or message');
    }
    
    await this.bot.api.sendMessage(message, threadId);
    
    logger.info('Message sent from webhook', {
      webhookId: webhook.id,
      threadId,
      messageLength: message.length
    });
  }

  async updateStatusFromWebhook(webhook, data) {
    // Update bot status based on webhook
    // For example, maintenance mode, etc.
    
    logger.info('Status updated from webhook', {
      webhookId: webhook.id,
      data
    });
  }

  checkWebhookPermission(webhook, command) {
    // Define which commands webhooks can execute
    const allowedCommands = [
      'help',
      'info',
      'stats',
      'startfun',
      'stopfun'
    ];
    
    return allowedCommands.includes(command);
  }

  async testWebhook(req, res) {
    const { id } = req.params;
    
    if (!this.webhooks.has(id)) {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    
    const webhook = this.webhooks.get(id);
    
    // Send test event
    const testEvent = {
      type: 'test',
      data: {
        message: 'Test webhook from Ultra Professional Bot',
        timestamp: new Date().toISOString(),
        botVersion: require('../../package.json').version
      }
    };
    
    try {
      await this.triggerWebhook(webhook, testEvent);
      res.json({ success: true, message: 'Test webhook sent' });
    } catch (error) {
      logger.error('Test webhook failed:', error);
      res.status(500).json({ error: 'Failed to send test webhook' });
    }
  }

  // Trigger webhook for internal events
  async triggerWebhookForEvent(eventType, eventData) {
    const relevantWebhooks = Array.from(this.webhooks.values()).filter(wh => 
      wh.active && (wh.events.includes('all') || wh.events.includes(eventType))
    );
    
    const event = {
      type: eventType,
      data: eventData,
      timestamp: new Date().toISOString(),
      source: 'ultra_professional_bot'
    };
    
    // Trigger all relevant webhooks in parallel
    const promises = relevantWebhooks.map(webhook => 
      this.triggerWebhook(webhook, event).catch(error => {
        logger.error('Failed to trigger webhook:', { webhookId: webhook.id, error });
      })
    );
    
    await Promise.allSettled(promises);
  }

  async triggerWebhook(webhook, event) {
    const payload = JSON.stringify(event);
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Ultra-Professional-Bot/1.0'
    };
    
    // Add signature if secret is set
    if (webhook.secret) {
      const signature = crypto
        .createHmac('sha256', webhook.secret)
        .update(payload)
        .digest('hex');
      
      headers['X-Webhook-Signature'] = signature;
    }
    
    // Add webhook ID for identification
    headers['X-Webhook-ID'] = webhook.id;
    
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: payload,
      timeout: 10000 // 10 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`Webhook responded with ${response.status}`);
    }
    
    // Update last triggered
    webhook.lastTriggered = new Date().toISOString();
    webhook.lastResponse = {
      status: response.status,
      timestamp: new Date().toISOString()
    };
    
    logger.debug('Webhook triggered successfully', {
      webhookId: webhook.id,
      eventType: event.type,
      responseStatus: response.status
    });
    
    return response;
  }

  // Event handlers for bot events
  onMessageSent(message) {
    this.triggerWebhookForEvent('message_sent', {
      threadId: message.threadID,
      senderId: message.senderID,
      message: message.body?.substring(0, 200),
      timestamp: new Date().toISOString()
    });
  }

  onFunStarted(funInfo) {
    this.triggerWebhookForEvent('fun_started', funInfo);
  }

  onFunStopped(funInfo) {
    this.triggerWebhookForEvent('fun_stopped', funInfo);
  }

  onBotStatusChanged(status) {
    this.triggerWebhookForEvent('bot_status_change', {
      status,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  }

  onErrorOccurred(error) {
    this.triggerWebhookForEvent('error_occurred', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }

  onAdminAction(action, userId) {
    this.triggerWebhookForEvent('admin_action', {
      action,
      userId,
      timestamp: new Date().toISOString()
    });
  }

  // Get webhook statistics
  getStats() {
    const webhooks = Array.from(this.webhooks.values());
    
    return {
      total: webhooks.length,
      active: webhooks.filter(wh => wh.active).length,
      byType: {
        builtin: webhooks.filter(wh => wh.type === 'builtin').length,
        custom: webhooks.filter(wh => wh.type === 'custom').length
      },
      last24Hours: webhooks.filter(wh => 
        wh.lastTriggered && 
        new Date(wh.lastTriggered) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      ).length
    };
  }
}

module.exports = WebhookManager;