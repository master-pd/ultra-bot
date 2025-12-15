function getRandomDelay(min = 300, max = 600) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { getRandomDelay, delay };