# create-setup.sh
#!/bin/bash

echo "🚀 Creating Ultra Professional Messenger Bot..."

# Create directories
mkdir -p config data/{fun-json,admin-photos,logs,diagnostics} assets/{owner-photos,media} backups
mkdir -p src/{commands/{normal,fun,admin,owner},secure,utils,middleware,system}
mkdir -p server/{middleware,routes} public/dashboard scripts tests/{unit,integration}
mkdir -p monitoring .github/workflows

echo "✅ Directory structure created"

# Create package.json
cat > package.json << 'EOF'
{
  "name": "ultra-professional-messenger-bot",
  "version": "1.0.0",
  "description": "Advanced Facebook Messenger Bot",
  "main": "main.js",
  "scripts": {
    "start": "node main.js",
    "dev": "nodemon main.js",
    "api": "node server/main.js",
    "test": "jest",
    "init": "node scripts/init-db.js",
    "backup": "node scripts/backup-scheduler.js create manual",
    "deploy": "node deploy.js",
    "lint": "eslint src/ server/",
    "docker:build": "docker build -t ultra-bot .",
    "docker:run": "docker run -d --name ultra-bot ultra-bot"
  },
  "dependencies": {
    "facebook-chat-api": "github:Schmavery/facebook-chat-api",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "express-rate-limit": "^6.10.0",
    "morgan": "^1.10.0",
    "jsonwebtoken": "^9.0.0",
    "ws": "^8.14.0",
    "axios": "^1.6.0",
    "node-cache": "^5.1.2",
    "prom-client": "^14.2.0",
    "node-schedule": "^2.1.1",
    "extract-zip": "^2.0.1",
    "bcryptjs": "^2.4.3",
    "moment": "^2.29.4"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.7.0",
    "eslint": "^8.53.0"
  },
  "engines": {
    "node": ">=16.0.0"
  }
}
EOF

echo "✅ package.json created"

# Create README.md
cat > README.md << 'EOF'
# Ultra Professional Messenger Bot

Advanced Facebook Messenger Bot with web dashboard, API, and real-time monitoring.

## Features
- Three-tier role system (Owner/Admin/User)
- Web dashboard for management
- REST API and WebSocket support
- Real-time monitoring
- Auto-backup and recovery
- Docker support
- CI/CD pipeline

## Quick Start
1. Clone repository
2. Run `npm install`
3. Edit `config/config.json`
4. Run `npm run init`
5. Add Facebook session to `src/secure/appstats.json`
6. Run `npm start`

## Documentation
See docs/ folder for detailed documentation.
EOF

echo "✅ README.md created"

echo "📦 Installation complete!"
echo "Next steps:"
echo "1. Run: npm install"
echo "2. Run: npm run init"
echo "3. Configure config/config.json"
echo "4. Add Facebook session"
echo "5. Run: npm start"