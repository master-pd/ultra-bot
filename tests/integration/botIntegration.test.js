const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

describe('Bot Integration Tests', () => {
  let botProcess;
  const testDir = path.join(__dirname, '../test-run');
  
  before(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
    
    // Copy config files
    await fs.copyFile(
      path.join(__dirname, '../../config/config.example.json'),
      path.join(testDir, 'config.json')
    );
    
    // Create test owner lock
    const lockData = {
      ownerHash: 'testhash',
      ownerUid: '61578706761898',
      lockedAt: new Date().toISOString()
    };
    
    await fs.writeFile(
      path.join(testDir, 'owner.lock'),
      JSON.stringify(lockData, null, 2)
    );
  });
  
  after(async () => {
    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
  });
  
  it('should start bot without errors', (done) => {
    botProcess = spawn('node', ['main.js'], {
      cwd: path.join(__dirname, '../..'),
      env: { ...process.env, NODE_ENV: 'test' }
    });
    
    let output = '';
    
    botProcess.stdout.on('data', (data) => {
      output += data.toString();
      console.log(`Bot: ${data.toString().trim()}`);
    });
    
    botProcess.stderr.on('data', (data) => {
      console.error(`Bot Error: ${data.toString()}`);
    });
    
    // Check for successful startup
    const timeout = setTimeout(() => {
      botProcess.kill();
      done(new Error('Bot failed to start within timeout'));
    }, 10000);
    
    botProcess.stdout.on('data', (data) => {
      if (data.toString().includes('Bot is now running')) {
        clearTimeout(timeout);
        botProcess.kill();
        done();
      }
    });
    
    botProcess.on('error', (err) => {
      clearTimeout(timeout);
      done(err);
    });
  });
  
  it('should handle shutdown gracefully', (done) => {
    botProcess = spawn('node', ['main.js'], {
      cwd: path.join(__dirname, '../..'),
      env: { ...process.env, NODE_ENV: 'test' }
    });
    
    setTimeout(() => {
      botProcess.kill('SIGINT');
      
      botProcess.on('close', (code) => {
        if (code === 0 || code === null) {
          done();
        } else {
          done(new Error(`Bot exited with code ${code}`));
        }
      });
    }, 2000);
  });
});