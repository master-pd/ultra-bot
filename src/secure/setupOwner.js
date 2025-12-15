const fs = require('fs');
const path = require('path');
const { hashUid } = require('./verifyOwner');

const ownerUid = process.argv[2] || "61578706761898";
const hash = hashUid(ownerUid);

const lockData = {
  ownerHash: hash,
  ownerUid: ownerUid,
  lockedAt: new Date().toISOString()
};

fs.writeFileSync(
  path.join(__dirname, 'owner.lock'),
  JSON.stringify(lockData, null, 2)
);

console.log('✅ Owner locked successfully.');