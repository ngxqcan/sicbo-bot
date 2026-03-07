'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_PATH
  ? require('path').resolve(process.env.DATA_PATH)
  : path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'sicbo.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    user_id     TEXT PRIMARY KEY,
    username    TEXT NOT NULL,
    balance     INTEGER NOT NULL DEFAULT 1000,
    total_won   INTEGER NOT NULL DEFAULT 0,
    total_lost  INTEGER NOT NULL DEFAULT 0,
    games_played INTEGER NOT NULL DEFAULT 0,
    last_daily  INTEGER,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS bet_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL,
    round_id    TEXT NOT NULL,
    bet_type    TEXT NOT NULL,
    amount      INTEGER NOT NULL,
    dice1       INTEGER,
    dice2       INTEGER,
    dice3       INTEGER,
    won         INTEGER,
    payout      INTEGER,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY(user_id) REFERENCES players(user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_bet_history_user ON bet_history(user_id);
  CREATE INDEX IF NOT EXISTS idx_bet_history_round ON bet_history(round_id);

  CREATE TABLE IF NOT EXISTS round_history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id  TEXT NOT NULL UNIQUE,
    dice1     INTEGER NOT NULL,
    dice2     INTEGER NOT NULL,
    dice3     INTEGER NOT NULL,
    total     INTEGER NOT NULL,
    result    TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// Prepared statements
const stmts = {
  getPlayer: db.prepare('SELECT * FROM players WHERE user_id = ?'),
  upsertPlayer: db.prepare(`
    INSERT INTO players (user_id, username, balance)
    VALUES (@user_id, @username, @balance)
    ON CONFLICT(user_id) DO UPDATE SET username = @username
  `),
  updateBalance: db.prepare('UPDATE players SET balance = balance + @delta WHERE user_id = @user_id'),
  setBalance: db.prepare('UPDATE players SET balance = @balance WHERE user_id = @user_id'),
  updateStats: db.prepare(`
    UPDATE players SET
      total_won = total_won + @won,
      total_lost = total_lost + @lost,
      games_played = games_played + 1
    WHERE user_id = @user_id
  `),
  setLastDaily: db.prepare('UPDATE players SET last_daily = @ts WHERE user_id = @user_id'),
  insertBet: db.prepare(`
    INSERT INTO bet_history (user_id, round_id, bet_type, amount, dice1, dice2, dice3, won, payout)
    VALUES (@user_id, @round_id, @bet_type, @amount, @dice1, @dice2, @dice3, @won, @payout)
  `),
  getLeaderboard: db.prepare(`
    SELECT user_id, username, balance, games_played, total_won
    FROM players ORDER BY balance DESC LIMIT 10
  `),
};

function getPlayer(userId, username) {
  let player = stmts.getPlayer.get(userId);
  if (!player) {
    const startBalance = parseInt(process.env.STARTING_BALANCE || '1000');
    stmts.upsertPlayer.run({ user_id: userId, username, balance: startBalance });
    player = stmts.getPlayer.get(userId);
  } else if (username && player.username !== username) {
    stmts.upsertPlayer.run({ user_id: userId, username, balance: player.balance });
  }
  return player;
}

function adjustBalance(userId, delta) {
  stmts.updateBalance.run({ user_id: userId, delta });
  return stmts.getPlayer.get(userId);
}

function updateStats(userId, won, lost) {
  stmts.updateStats.run({ user_id: userId, won, lost });
}

function claimDaily(userId) {
  const player = stmts.getPlayer.get(userId);
  if (!player) return { success: false, reason: 'Player not found.' };

  const now = Math.floor(Date.now() / 1000);
  const cooldown = 24 * 60 * 60;

  if (player.last_daily && now - player.last_daily < cooldown) {
    const remaining = cooldown - (now - player.last_daily);
    return { success: false, remaining };
  }

  const reward = parseInt(process.env.DAILY_REWARD || '500');
  stmts.setLastDaily.run({ user_id: userId, ts: now });
  adjustBalance(userId, reward);
  return { success: true, reward };
}

function recordBets(bets, roundId, dice, results) {
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      stmts.insertBet.run(item);
    }
  });
  insertMany(bets.map(b => ({
    user_id: b.userId,
    round_id: roundId,
    bet_type: b.betType,
    amount: b.amount,
    dice1: dice[0],
    dice2: dice[1],
    dice3: dice[2],
    won: results[b.userId]?.won ? 1 : 0,
    payout: results[b.userId]?.payout || 0,
  })));
}

function getLeaderboard() {
  return stmts.getLeaderboard.all();
}

function saveRound(roundId, dice) {
  const [d1, d2, d3] = dice;
  const total = d1 + d2 + d3;
  const result = (d1 === d2 && d2 === d3) ? 'TRIPLE' : total >= 11 ? 'TAI' : 'XIU';
  try {
    db.prepare(`
      INSERT OR IGNORE INTO round_history (round_id, dice1, dice2, dice3, total, result)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(roundId, d1, d2, d3, total, result);
  } catch (e) { /* non-critical */ }
}

function getRecentRounds(limit = 10) {
  return db.prepare(`
    SELECT round_id, dice1, dice2, dice3, total, result
    FROM round_history
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
}

module.exports = { getPlayer, adjustBalance, updateStats, claimDaily, recordBets, getLeaderboard, getRecentRounds, saveRound, db };
