# 🎲 Discord Sic Bo Bot

A fully-featured Sic Bo dice game bot for Discord with virtual currency, button-based betting, and automatic round management.

---

## 🚀 Setup

### 1. Prerequisites
- **Node.js** v18+ ([nodejs.org](https://nodejs.org))
- A **Discord Bot** with the following permissions:
  - Send Messages
  - Embed Links
  - Use Application Commands
  - Read Message History

### 2. Create Your Bot
1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** → name it → go to **Bot**
3. Click **Reset Token** and copy your token
4. Under **Privileged Gateway Intents**, enable **Server Members Intent** (optional but useful)
5. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Permissions: `Send Messages`, `Embed Links`, `Read Message History`
6. Use the generated URL to invite the bot to your server

### 3. Configure Environment
```bash
cp .env.example .env
```

Edit `.env`:
```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_id_here   # From "General Information" page
GUILD_ID=your_server_id_here         # Optional: for instant command registration during dev
```

### 4. Install & Run
```bash
npm install

# Register slash commands (run once, or when commands change)
npm run register

# Start the bot
npm start
```

---

## 🎮 Game Commands

| Command | Description |
|---------|-------------|
| `/sicbo start` | Start a new 30-second betting round |
| `/sicbo stop` | Stop current round (requires Manage Server) |
| `/sicbo autostart` | Toggle auto-restart rounds (requires Manage Server) |
| `/balance` | Check your coin balance |
| `/daily` | Claim daily 500-coin reward |
| `/stats` | View your win/loss statistics |
| `/leaderboard` | Top 10 players by balance |
| `/give @user amount` | Send coins to another player |

---

## 🎲 Sic Bo Rules

Three dice are rolled at the end of each 30-second round.

| Bet | Condition | Payout |
|-----|-----------|--------|
| 🔴 **Tài (Big)** | Total 11–17 (no triple) | 1:1 |
| 🔵 **Xỉu (Small)** | Total 4–10 (no triple) | 1:1 |
| ⭐ **Any Triple** | All three dice match | 24:1 |

> ⚠️ **Triples** cause **all Tài/Xỉu bets to lose** — the house takes all!

### Bet Sizes
Players choose from 4 bet sizes per type: **10 · 50 · 200 · 500** coins.
- Placing a new bet of the same type **replaces** your previous bet (old amount refunded).

---

## 💰 Economy

- **Starting balance:** 1,000 coins
- **Daily reward:** 500 coins (24-hour cooldown)
- **Min bet:** 10 coins | **Max bet:** 5,000 coins

---

## ⚙️ Configuration

All settings in `.env`:

```env
ROUND_DURATION=30000      # ms (default: 30 seconds)
STARTING_BALANCE=1000     # New player starting coins
DAILY_REWARD=500          # Daily reward amount
MIN_BET=10                # Minimum bet
MAX_BET=5000              # Maximum bet
PAYOUT_TAI=2              # 2x = 1:1 payout (returns bet + profit)
PAYOUT_XIU=2              # 2x = 1:1 payout
PAYOUT_TRIPLE=25          # 25x = 24:1 payout
```

---

## 📁 Project Structure

```
sicbo-bot/
├── src/
│   ├── index.js                # Bot entry point & event handling
│   ├── deploy-commands.js      # Slash command registration
│   ├── commands/
│   │   ├── definitions.js      # Slash command schemas
│   │   └── handlers.js         # Command logic
│   ├── game/
│   │   ├── engine.js           # Dice rolling & bet resolution
│   │   └── roundManager.js     # Round lifecycle management
│   └── utils/
│       └── database.js         # SQLite database layer
├── data/
│   └── sicbo.db                # Auto-created SQLite database
├── .env                        # Your config (not committed)
├── .env.example                # Config template
└── package.json
```

---

## 🛡️ Permissions

- `/sicbo stop` and `/sicbo autostart` require **Manage Server** permission
- All other commands are available to everyone

---

## 🔧 Development Tips

- Use `GUILD_ID` in `.env` during development — guild commands register instantly vs. up to 1 hour for global commands
- The SQLite database (`data/sicbo.db`) is auto-created on first run
- Re-run `npm run register` any time you add or change commands
