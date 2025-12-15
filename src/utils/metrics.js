const client = require('prom-client');
const logger = require('./logger');

class MetricsCollector {
  constructor() {
    // Create Registry
    this.register = new client.Registry();
    
    // Add default metrics
    client.collectDefaultMetrics({ register: this.register });
    
    // Custom metrics
    this.metrics = {
      messagesProcessed: new client.Counter({
        name: 'bot_messages_processed_total',
        help: 'Total number of messages processed',
        labelNames: ['type']
      }),
      
      commandsExecuted: new client.Counter({
        name: 'bot_commands_executed_total',
        help: 'Total number of commands executed',
        labelNames: ['command', 'status']
      }),
      
      errorsTotal: new client.Counter({
        name: 'bot_errors_total',
        help: 'Total number of errors',
        labelNames: ['type']
      }),
      
      activeUsers: new client.Gauge({
        name: 'bot_active_users',
        help: 'Number of active users'
      }),
      
      activeThreads: new client.Gauge({
        name: 'bot_active_threads',
        help: 'Number of active threads'
      }),
      
      funLoopsActive: new client.Gauge({
        name: 'bot_fun_loops_active',
        help: 'Number of active fun loops'
      }),
      
      responseTime: new client.Histogram({
        name: 'bot_response_time_seconds',
        help: 'Response time for commands',
        buckets: [0.1, 0.5, 1, 2, 5]
      }),
      
      memoryUsage: new client.Gauge({
        name: 'bot_memory_usage_bytes',
        help: 'Memory usage in bytes',
        labelNames: ['type']
      }),
      
      uptime: new client.Gauge({
        name: 'bot_uptime_seconds',
        help: 'Bot uptime in seconds'
      })
    };
    
    // Register all metrics
    Object.values(this.metrics).forEach(metric => {
      this.register.registerMetric(metric);
    });
    
    logger.info('Metrics collector initialized');
  }
  
  recordMessage(type = 'message') {
    this.metrics.messagesProcessed.inc({ type });
  }
  
  recordCommand(command, status = 'success') {
    this.metrics.commandsExecuted.inc({ command, status });
  }
  
  recordError(type = 'unknown') {
    this.metrics.errorsTotal.inc({ type });
  }
  
  setActiveUsers(count) {
    this.metrics.activeUsers.set(count);
  }
  
  setActiveThreads(count) {
    this.metrics.activeThreads.set(count);
  }
  
  setFunLoopsActive(count) {
    this.metrics.funLoopsActive.set(count);
  }
  
  recordResponseTime(duration) {
    this.metrics.responseTime.observe(duration);
  }
  
  updateMemoryUsage() {
    const memory = process.memoryUsage();
    
    this.metrics.memoryUsage.set({ type: 'heapUsed' }, memory.heapUsed);
    this.metrics.memoryUsage.set({ type: 'heapTotal' }, memory.heapTotal);
    this.metrics.memoryUsage.set({ type: 'rss' }, memory.rss);
  }
  
  updateUptime() {
    this.metrics.uptime.set(process.uptime());
  }
  
  async getMetrics() {
    // Update dynamic metrics
    this.updateMemoryUsage();
    this.updateUptime();
    
    // Return metrics as string
    return await this.register.metrics();
  }
  
  startPeriodicUpdates() {
    // Update metrics every 30 seconds
    this.updateInterval = setInterval(() => {
      this.updateMemoryUsage();
      this.updateUptime();
      
      // Update active counts from global state
      if (global.activeThreads) {
        this.setActiveThreads(global.activeThreads);
      }
      
      if (global.funIntervals) {
        this.setFunLoopsActive(Object.keys(global.funIntervals).length);
      }
    }, 30000);
    
    logger.info('Periodic metrics updates started');
  }
  
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    logger.info('Metrics collector stopped');
  }
  
  // HTTP server for metrics endpoint (optional)
  createMetricsServer(port = 3000) {
    const http = require('http');
    
    const server = http.createServer(async (req, res) => {
      if (req.url === '/metrics') {
        try {
          const metrics = await this.getMetrics();
          res.writeHead(200, { 'Content-Type': this.register.contentType });
          res.end(metrics);
        } catch (error) {
          res.writeHead(500);
          res.end('Error collecting metrics');
        }
      } else if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'healthy',
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        }));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });
    
    server.listen(port, () => {
      logger.info(`Metrics server listening on port ${port}`);
    });
    
    return server;
  }
}

module.exports = new MetricsCollector();