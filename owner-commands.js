const guard = require('./src/secure/guard');
const config = require('./config/config.json');

module.exports = {
  emergencystop: (api, event) => {
    guard.requireOwner(event.senderID);
    
    // Stop all fun intervals
    if (global.funIntervals) {
      Object.values(global.funIntervals).forEach(interval => {
        clearInterval(interval);
      });
      global.funIntervals = {};
    }
    
    api.sendMessage('🚨 EMERGENCY STOP: All fun commands terminated.', event.threadID);
  },
  
  shutdown: (api, event) => {
    guard.requireOwner(event.senderID);
    
    api.sendMessage('🛑 SHUTDOWN INITIATED: Bot will stop in 3 seconds...', event.threadID);
    
    setTimeout(() => {
      process.exit(0);
    }, 3000);
  },
  
  addadmin: (api, event, args) => {
    guard.requireOwner(event.senderID);
    
    if (!args[0]) {
      api.sendMessage('Usage: !addadmin [userID]', event.threadID);
      return;
    }
    
    const newAdmin = args[0];
    
    if (!/^\d+$/.test(newAdmin)) {
      api.sendMessage('❌ Invalid user ID.', event.threadID);
      return;
    }
    
    if (config.admins.includes(newAdmin)) {
      api.sendMessage('⚠️ User is already an admin.', event.threadID);
      return;
    }
    
    config.admins.push(newAdmin);
    require('fs').writeFileSync(
      require('path').join(__dirname, './config/config.json'),
      JSON.stringify(config, null, 2)
    );
    
    api.sendMessage(`✅ Added ${newAdmin} as admin.`, event.threadID);
  },
  
  removeadmin: (api, event, args) => {
    guard.requireOwner(event.senderID);
    
    if (!args[0]) {
      api.sendMessage('Usage: !removeadmin [userID]', event.threadID);
      return;
    }
    
    const adminToRemove = args[0];
    const index = config.admins.indexOf(adminToRemove);
    
    if (index === -1) {
      api.sendMessage('❌ User is not an admin.', event.threadID);
      return;
    }
    
    config.admins.splice(index, 1);
    require('fs').writeFileSync(
      require('path').join(__dirname, './config/config.json'),
      JSON.stringify(config, null, 2)
    );
    
    api.sendMessage(`✅ Removed ${adminToRemove} from admins.`, event.threadID);
  }
};