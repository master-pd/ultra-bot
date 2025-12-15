const config = require('../../config/config.json');
const { verifyOwner } = require('./verifyOwner');

const guard = {
  isOwner: (userId) => {
    return verifyOwner(userId);
  },

  isAdmin: (userId) => {
    return config.admins.includes(userId.toString());
  },

  isUser: (userId) => {
    return !guard.isOwner(userId) && !guard.isAdmin(userId);
  },

  requireOwner: (userId) => {
    if (!guard.isOwner(userId)) {
      throw new Error('Owner access required.');
    }
  },

  requireAdmin: (userId) => {
    if (!guard.isAdmin(userId) && !guard.isOwner(userId)) {
      throw new Error('Admin access required.');
    }
  }
};

module.exports = guard;