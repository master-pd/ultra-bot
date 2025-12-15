const fs = require('fs');
const path = require('path');
const guard = require('../secure/guard');

const ownerPhotos = require('../../assets/owner-photos/ownerPhotos.json');

function getPhotoForUser(userId) {
  if (guard.isOwner(userId)) {
    // Random owner photo from 10–12 URLs
    const randomIndex = Math.floor(Math.random() * ownerPhotos.length);
    return ownerPhotos[randomIndex];
  }

  if (guard.isAdmin(userId)) {
    // Random admin photo from 3 local files
    const adminPhotos = ['admin1.png', 'admin2.png', 'admin3.png'];
    const randomAdmin = adminPhotos[Math.floor(Math.random() * adminPhotos.length)];
    return path.join(__dirname, '../../data/admin-photos/', randomAdmin);
  }

  // For normal users, return null (FB API will fetch live)
  return null;
}

module.exports = { getPhotoForUser };