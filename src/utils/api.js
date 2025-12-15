const login = require('facebook-chat-api');

class MessengerAPI {
  constructor(appStatePath) {
    this.appStatePath = appStatePath;
    this.api = null;
    this.isLoggedIn = false;
  }
  
  async login() {
    return new Promise((resolve, reject) => {
      login({ appState: require(this.appStatePath) }, (err, api) => {
        if (err) {
          console.error('Login error:', err);
          reject(err);
          return;
        }
        
        this.api = api;
        this.isLoggedIn = true;
        
        // Set up auto-reconnect
        api.setOptions({ listenEvents: true, selfListen: true });
        
        console.log('✅ Logged in successfully');
        resolve(api);
      });
    });
  }
  
  async sendMessage(threadID, message, attachment = null) {
    if (!this.isLoggedIn) {
      throw new Error('API not logged in');
    }
    
    return new Promise((resolve, reject) => {
      const msg = { body: message };
      if (attachment) msg.attachment = attachment;
      
      this.api.sendMessage(msg, threadID, (err, info) => {
        if (err) {
          console.error('Send message error:', err);
          reject(err);
        } else {
          resolve(info);
        }
      });
    });
  }
  
  async getThreadInfo(threadID) {
    return new Promise((resolve, reject) => {
      this.api.getThreadInfo(threadID, (err, info) => {
        if (err) reject(err);
        else resolve(info);
      });
    });
  }
  
  async getUserInfo(userIDs) {
    return new Promise((resolve, reject) => {
      this.api.getUserInfo(userIDs, (err, info) => {
        if (err) reject(err);
        else resolve(info);
      });
    });
  }
  
  async markAsRead(threadID) {
    return new Promise((resolve, reject) => {
      this.api.markAsRead(threadID, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

module.exports = MessengerAPI;