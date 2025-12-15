const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ownerLockPath = path.join(__dirname, 'owner.lock');

function hashUid(uid) {
  return crypto.createHash('sha256').update(uid.toString()).digest('hex');
}

function verifyOwner(userId) {
  try {
    const lockData = JSON.parse(fs.readFileSync(ownerLockPath, 'utf8'));
    const hashedInput = hashUid(userId);
    return lockData.ownerHash === hashedInput;
  } catch (error) {
    console.error('Owner verification failed:', error);
    return false;
  }
}

module.exports = { verifyOwner, hashUid };