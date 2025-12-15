# ‎𝗬𝗢𝗨𝗥 𝗖𝗥𝗨𝗦𝗛 ⟵𝗼_𝟬 MESSENGER BOT

A highly structured, secure, and role-based Facebook Messenger Bot.

## Features:
- Three-tier role system (User, Admin, Owner)
- Owner-hidden & immutable security
- Fun command system (Admin/Owner only)
- Dynamic photo management
- GitHub-fork safe design
- Fast execution with human-like delays

## Setup:
1. Clone repo
2. `npm install`
3. Edit `config/config.json`
4. Run `npm run setup` to set owner
5. `npm start`

## Security:
- Owner UID stored hashed in `owner.lock`
- Admin editable via config
- No auto-join, manual start only

## License:
Private (for team use)