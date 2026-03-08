'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getMatch } = require('../utils/footballApi');
const { getPlayer, adjustBalance, updateStats, db } = require('../utils/database');

// Odds cố định
const ODDS = { HOME: 1.9, DRAW: 3.0, AWAY: 1.9 };
const BET_LABEL = { HOME: '🏠 Thắng (Nhà)', DRAW: '🤝 Hòa', AWAY: '✈️ Thắng (Khách)' };

// Tạo bảng football_bets nếu chưa có
db.exec(`
  CREATE TABLE IF NOT EXISTS football_bets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    pick       TEXT NOT NULL,
    amount     INTEGER NOT NULL,
    odds       REAL NOT NULL,
    settled    INTEGER NOT NULL DEFAULT 0,
    won        INTEGER,
    payout     INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_fb_match ON football_bets(match_id, settled);
  CREATE INDEX IF NOT EXISTS idx_fb_user  ON football_bets(user_id);

  CREATE TABLE IF NOT EXISTS football_matches (
    match_id    TEXT PRIMARY KEY,
    home_team   TEXT NOT NULL,
    away_team   TEXT NOT NULL,
    match_date  INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'OPEN',
    home_score  INTEGER,
    away_score  INTEGER,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// ── Prepared statements ──────────────────────────────────────────────────────
const stmts = {
  upsertMatch: db.prepare(`
    INSERT INTO football_matches (match_id, home_team, away_team, match_date, status)
    VALUES (@match_id, @home_team, @away_team, @match_date, 'OPEN')
    ON CONFLICT(match_id) DO NOTHING
  `),
  getMatch: db.prepare('SELECT * FROM football_matches WHERE match_id = ?'),
  updateMatchStatus: db.prepare('UPDATE football_matches SET status = @status, home_score = @home_score, away_score = @away_score WHERE match_id = @match_id'),
  insertBet: db.prepare(`
    INSERT INTO football_bets (match_id, user_id, pick, amount, odds)
    VALUES (@match_id, @user_id, @pick, @amount, @odds)
  `),
  getUserBet: db.prepare('SELECT * FROM football_bets WHERE match_id = ? AND user_id = ? AND settled = 0 LIMIT 1'),
  getMatchBets: db.prepare('SELECT * FROM football_bets WHERE match_id = ? AND settled = 0'),
  settleBet: db.prepare('UPDATE football_bets SET settled = 1, won = @won, payout = @payout WHERE id = @id'),
  getOpenMatches: db.prepare(`SELECT * FROM football_matches WHERE status = 'OPEN' ORDER BY match_date ASC`),
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false,
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getBetsMap(matchId) {
  const bets = stmts.getMatchBets.all(matchId);
  const map = { HOME: 0, DRAW: 0, AWAY: 0 };
  for (const b of bets) map[b.pick] = (map[b.pick] || 0) + b.amount;
  return map;
}

// ── Embed: danh sách trận (1 embed duy nhất) ─────────────────────────────────
function buildListEmbed(matches) {
  const lines = matches.map((m, i) => {
    const date = formatDate(m.match_date);
    return `**${i + 1}.** 🏴󠁧󠁢󠁥󠁮󠁧󠁿 **${m.home_team}** vs **${m.away_team}**\n　　📅 ${date}`;
  });

  return new EmbedBuilder()
    .setColor(0x3a7d44)
    .setTitle('⚽ EPL — Lịch Thi Đấu Sắp Tới')
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: 'Bấm nút bên dưới để xem kèo và đặt cược' })
    .setTimestamp();
}

// Buttons hàng ngang: "Trận 1", "Trận 2", ... (tối đa 5 nút/hàng, 5 hàng = 25 nút)
function buildListButtons(matches) {
  const rows = [];
  for (let i = 0; i < matches.length; i += 5) {
    const chunk = matches.slice(i, i + 5);
    rows.push(new ActionRowBuilder().addComponents(
      chunk.map((m, j) =>
        new ButtonBuilder()
          .setCustomId(`fb_view_${m.match_id}`)
          .setLabel(`Trận ${i + j + 1}`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⚽')
      )
    ));
  }
  return rows;
}

// ── Embed: chi tiết 1 trận (hiện ephemeral khi bấm nút) ─────────────────────
function buildDetailEmbed(match, betsMap = {}) {
  const totalHome = betsMap.HOME || 0;
  const totalDraw = betsMap.DRAW || 0;
  const totalAway = betsMap.AWAY || 0;
  const totalPool = totalHome + totalDraw + totalAway;

  return new EmbedBuilder()
    .setColor(0x3a7d44)
    .setTitle(`⚽ ${match.home_team} vs ${match.away_team}`)
    .setDescription(`📅 **${formatDate(match.match_date)}**\n\nChọn kèo bên dưới để đặt cược:`)
    .addFields(
      { name: '🏠 Thắng Nhà',    value: `Tỉ lệ **x${ODDS.HOME}**\n💰 ${totalHome.toLocaleString()} coins`, inline: true },
      { name: '🤝 Hòa',          value: `Tỉ lệ **x${ODDS.DRAW}**\n💰 ${totalDraw.toLocaleString()} coins`, inline: true },
      { name: '✈️ Thắng Khách',  value: `Tỉ lệ **x${ODDS.AWAY}**\n💰 ${totalAway.toLocaleString()} coins`, inline: true },
      { name: '🏦 Tổng Pool',    value: `**${totalPool.toLocaleString()}** coins`, inline: false },
    )
    .setFooter({ text: `Match ID: ${match.match_id}` })
    .setTimestamp();
}

function buildBetButtons(matchId, disabled = false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fb_bet_${matchId}_HOME`).setLabel('Thắng Nhà').setEmoji('🏠').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`fb_bet_${matchId}_DRAW`).setLabel('Hòa').setEmoji('🤝').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`fb_bet_${matchId}_AWAY`).setLabel('Thắng Khách').setEmoji('✈️').setStyle(ButtonStyle.Primary).setDisabled(disabled),
  )];
}

// ── Public API ────────────────────────────────────────────────────────────────

// Lưu trận vào DB và trả về object match
function openMatch(matchData) {
  stmts.upsertMatch.run({
    match_id:   String(matchData.id),
    home_team:  matchData.homeTeam.shortName || matchData.homeTeam.name,
    away_team:  matchData.awayTeam.shortName || matchData.awayTeam.name,
    match_date: Math.floor(new Date(matchData.utcDate).getTime() / 1000),
  });
  return stmts.getMatch.get(String(matchData.id));
}

// Bấm nút "Trận X" → hiện ephemeral chi tiết kèo
async function viewMatch(interaction, matchId) {
  const match = stmts.getMatch.get(matchId);
  if (!match) return interaction.reply({ content: '❌ Không tìm thấy trận.', ephemeral: true });

  const betsMap  = getBetsMap(matchId);
  const embed    = buildDetailEmbed(match, betsMap);
  const buttons  = buildBetButtons(matchId, match.status !== 'OPEN');
  const existing = stmts.getUserBet.get(matchId, interaction.user.id);

  let content = undefined;
  if (existing) {
    content = `ℹ️ Bạn đã cược **${BET_LABEL[existing.pick]}** — **${existing.amount.toLocaleString()}** coins cho trận này rồi.`;
  }

  await interaction.reply({ content, embeds: [embed], components: buttons, ephemeral: true });
}

// Bấm nút Thắng/Hòa/Thua → modal nhập tiền
async function placeBet(interaction, matchId, pick) {
  const match = stmts.getMatch.get(matchId);
  if (!match || match.status !== 'OPEN') {
    return interaction.reply({ content: '❌ Trận này không còn nhận cược!', ephemeral: true });
  }

  const existing = stmts.getUserBet.get(matchId, interaction.user.id);
  if (existing) {
    return interaction.reply({
      content: `❌ Bạn đã cược **${BET_LABEL[existing.pick]}** — **${existing.amount.toLocaleString()}** coins cho trận này rồi!`,
      ephemeral: true,
    });
  }

  const MIN_BET = parseInt(process.env.MIN_BET || '10');
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
  const modal = new ModalBuilder()
    .setCustomId(`fb_submit_${matchId}_${pick}`)
    .setTitle(`⚽ ${match.home_team} vs ${match.away_team}`);
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('fb_amount')
      .setLabel(`${BET_LABEL[pick]} · x${ODDS[pick]} | min ${MIN_BET.toLocaleString()}`)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('VD: 500 hoặc "max" để all-in')
      .setMinLength(1).setMaxLength(20).setRequired(true)
  ));
  await interaction.showModal(modal);
}

// Modal submit → trừ tiền và lưu cược
async function submitBet(interaction, matchId, pick) {
  const match = stmts.getMatch.get(matchId);
  if (!match || match.status !== 'OPEN') {
    return interaction.reply({ content: '❌ Trận này không còn nhận cược!', ephemeral: true });
  }

  const MIN_BET = parseInt(process.env.MIN_BET || '10');
  const player  = getPlayer(interaction.user.id, interaction.user.username);
  const raw     = interaction.fields.getTextInputValue('fb_amount').trim().toLowerCase();

  let amount;
  if (raw === 'max' || raw === 'allin' || raw === 'all') amount = player.balance;
  else if (raw === 'min') amount = MIN_BET;
  else amount = parseInt(raw.replace(/[,. ]/g, ''));

  if (isNaN(amount) || amount < MIN_BET) {
    return interaction.reply({ content: `❌ Tối thiểu **${MIN_BET.toLocaleString()}** coins!`, ephemeral: true });
  }
  if (player.balance < amount) {
    return interaction.reply({ content: `❌ Không đủ coins! Số dư: **${player.balance.toLocaleString()}**`, ephemeral: true });
  }

  const odds   = ODDS[pick];
  const payout = Math.floor(amount * odds);

  adjustBalance(interaction.user.id, -amount);
  stmts.insertBet.run({ match_id: matchId, user_id: interaction.user.id, pick, amount, odds });

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x00cc66)
      .setTitle('✅ Đặt Cược Thành Công')
      .setDescription(`**${match.home_team}** vs **${match.away_team}**`)
      .addFields(
        { name: 'Kèo',        value: BET_LABEL[pick],                    inline: true },
        { name: 'Số tiền',    value: `${amount.toLocaleString()} coins`,  inline: true },
        { name: 'Nếu thắng',  value: `**+${(payout - amount).toLocaleString()}** coins`, inline: true },
      )
      .setTimestamp()
    ],
    ephemeral: true,
  });
}

// Settle trận — gọi khi có kết quả thực tế
async function settleMatch(matchId, homeScore, awayScore, channel) {
  const match = stmts.getMatch.get(matchId);
  if (!match) return { error: 'Không tìm thấy trận.' };
  if (match.status === 'SETTLED') return { error: 'Trận đã được settle rồi.' };

  let winner;
  if (homeScore > awayScore)      winner = 'HOME';
  else if (homeScore < awayScore) winner = 'AWAY';
  else                             winner = 'DRAW';

  stmts.updateMatchStatus.run({ match_id: matchId, status: 'SETTLED', home_score: homeScore, away_score: awayScore });

  const bets = stmts.getMatchBets.all(matchId);
  const winnerLines = [];
  const loserLines  = [];

  const settle = db.transaction(() => {
    for (const bet of bets) {
      const won    = bet.pick === winner;
      const payout = won ? Math.floor(bet.amount * bet.odds) : 0;
      stmts.settleBet.run({ id: bet.id, won: won ? 1 : 0, payout });
      if (won) {
        adjustBalance(bet.user_id, payout);
        updateStats(bet.user_id, payout - bet.amount, 0);
        winnerLines.push(`<@${bet.user_id}> **+${(payout - bet.amount).toLocaleString()}** (${BET_LABEL[bet.pick]} · ${bet.amount.toLocaleString()})`);
      } else {
        updateStats(bet.user_id, 0, bet.amount);
        loserLines.push(`<@${bet.user_id}> **-${bet.amount.toLocaleString()}** (${BET_LABEL[bet.pick]})`);
      }
    }
  });
  settle();

  const colorMap = { HOME: 0x00cc66, DRAW: 0xffcc00, AWAY: 0x3399ff };
  const embed = new EmbedBuilder()
    .setColor(colorMap[winner])
    .setTitle(`⚽ Kết Quả: ${match.home_team} vs ${match.away_team}`)
    .setDescription(`**${match.home_team} ${homeScore} – ${awayScore} ${match.away_team}**\n🏆 ${BET_LABEL[winner]}`)
    .addFields(
      { name: '🏆 Thắng', value: winnerLines.length ? winnerLines.join('\n') : '*Không có ai cược đúng.*', inline: false },
      { name: '💸 Thua',  value: loserLines.length  ? loserLines.join('\n')  : '*Không có ai thua.*',      inline: false },
    )
    .setTimestamp();

  if (channel) await channel.send({ embeds: [embed] });
  return { success: true, winner, totalBets: bets.length };
}

// Tự động kiểm tra kết quả các trận đang OPEN
async function autoCheckResults(client) {
  const openMatches = stmts.getOpenMatches.all();
  if (!openMatches.length) return;
  for (const match of openMatches) {
    try {
      const data = await getMatch(match.match_id);
      if (data.status !== 'FINISHED') continue;
      const homeScore = data.score?.fullTime?.home ?? null;
      const awayScore = data.score?.fullTime?.away ?? null;
      if (homeScore === null || awayScore === null) continue;
      await settleMatch(match.match_id, homeScore, awayScore, null);
      console.log(`✅ Auto-settled match ${match.match_id}: ${homeScore}-${awayScore}`);
    } catch (e) {
      console.error(`❌ Auto-check error for match ${match.match_id}:`, e.message);
    }
  }
}

module.exports = {
  openMatch, viewMatch, placeBet, submitBet, settleMatch, autoCheckResults,
  buildListEmbed, buildListButtons, buildDetailEmbed, buildBetButtons, getBetsMap,
  stmts, ODDS, BET_LABEL,
};


// Tạo bảng football_bets nếu chưa có
db.exec(`
  CREATE TABLE IF NOT EXISTS football_bets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    pick       TEXT NOT NULL,
    amount     INTEGER NOT NULL,
    odds       REAL NOT NULL,
    settled    INTEGER NOT NULL DEFAULT 0,
    won        INTEGER,
    payout     INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_fb_match ON football_bets(match_id, settled);
  CREATE INDEX IF NOT EXISTS idx_fb_user  ON football_bets(user_id);

  CREATE TABLE IF NOT EXISTS football_matches (
    match_id    TEXT PRIMARY KEY,
    home_team   TEXT NOT NULL,
    away_team   TEXT NOT NULL,
    match_date  INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'OPEN',
    home_score  INTEGER,
    away_score  INTEGER,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// ── Prepared statements ──────────────────────────────────────────────────────
const stmts = {
  upsertMatch: db.prepare(`
    INSERT INTO football_matches (match_id, home_team, away_team, match_date, status)
    VALUES (@match_id, @home_team, @away_team, @match_date, 'OPEN')
    ON CONFLICT(match_id) DO NOTHING
  `),
  getMatch: db.prepare('SELECT * FROM football_matches WHERE match_id = ?'),
  updateMatchStatus: db.prepare('UPDATE football_matches SET status = @status, home_score = @home_score, away_score = @away_score WHERE match_id = @match_id'),
  insertBet: db.prepare(`
    INSERT INTO football_bets (match_id, user_id, pick, amount, odds)
    VALUES (@match_id, @user_id, @pick, @amount, @odds)
  `),
  getUserBet: db.prepare('SELECT * FROM football_bets WHERE match_id = ? AND user_id = ? AND settled = 0 LIMIT 1'),
  getMatchBets: db.prepare('SELECT * FROM football_bets WHERE match_id = ? AND settled = 0'),
  settleBet: db.prepare('UPDATE football_bets SET settled = 1, won = @won, payout = @payout WHERE id = @id'),
  getOpenMatches: db.prepare(`SELECT * FROM football_matches WHERE status = 'OPEN' ORDER BY match_date ASC`),
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false,
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function buildMatchEmbed(match, betsMap = {}) {
  const totalHome  = betsMap.HOME  || 0;
  const totalDraw  = betsMap.DRAW  || 0;
  const totalAway  = betsMap.AWAY  || 0;
  const totalPool  = totalHome + totalDraw + totalAway;

  return new EmbedBuilder()
    .setColor(0x3a7d44)
    .setTitle(`⚽ EPL Cược Bóng Đá`)
    .setDescription(`**${match.home_team}** vs **${match.away_team}**\n📅 ${formatDate(match.match_date)}`)
    .addFields(
      { name: '🏠 Thắng (Nhà)', value: `Tỉ lệ **x${ODDS.HOME}**\n💰 ${totalHome.toLocaleString()} coins`, inline: true },
      { name: '🤝 Hòa',         value: `Tỉ lệ **x${ODDS.DRAW}**\n💰 ${totalDraw.toLocaleString()} coins`, inline: true },
      { name: '✈️ Thắng (Khách)',value: `Tỉ lệ **x${ODDS.AWAY}**\n💰 ${totalAway.toLocaleString()} coins`, inline: true },
      { name: '🏦 Tổng Pool', value: `**${totalPool.toLocaleString()}** coins`, inline: false },
    )
    .setFooter({ text: `Match ID: ${match.match_id} | Bấm nút để cược` })
    .setTimestamp();
}

function buildBetButtons(matchId, disabled = false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fb_bet_${matchId}_HOME`).setLabel('Thắng Nhà').setEmoji('🏠').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`fb_bet_${matchId}_DRAW`).setLabel('Hòa').setEmoji('🤝').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`fb_bet_${matchId}_AWAY`).setLabel('Thắng Khách').setEmoji('✈️').setStyle(ButtonStyle.Primary).setDisabled(disabled),
  )];
}

function getBetsMap(matchId) {
  const bets = stmts.getMatchBets.all(matchId);
  const map = { HOME: 0, DRAW: 0, AWAY: 0 };
  for (const b of bets) map[b.pick] = (map[b.pick] || 0) + b.amount;
  return map;
}

// ── Public API ────────────────────────────────────────────────────────────────

// Mở cược cho 1 trận — trả về { embed, buttons }
function openMatch(matchData) {
  stmts.upsertMatch.run({
    match_id:   String(matchData.id),
    home_team:  matchData.homeTeam.shortName || matchData.homeTeam.name,
    away_team:  matchData.awayTeam.shortName || matchData.awayTeam.name,
    match_date: Math.floor(new Date(matchData.utcDate).getTime() / 1000),
  });
  const match = stmts.getMatch.get(String(matchData.id));
  return { embed: buildMatchEmbed(match, {}), buttons: buildBetButtons(match.match_id) };
}

// Đặt cược
async function placeBet(interaction, matchId, pick) {
  const match = stmts.getMatch.get(matchId);
  if (!match || match.status !== 'OPEN') {
    return interaction.reply({ content: '❌ Trận này không còn nhận cược!', ephemeral: true });
  }

  const existing = stmts.getUserBet.get(matchId, interaction.user.id);
  if (existing) {
    return interaction.reply({
      content: `❌ Bạn đã cược **${BET_LABEL[existing.pick]}** — **${existing.amount.toLocaleString()}** coins cho trận này rồi!`,
      ephemeral: true,
    });
  }

  const MIN_BET = parseInt(process.env.MIN_BET || '10');
  const player  = getPlayer(interaction.user.id, interaction.user.username);

  // Hiện modal nhập số tiền
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
  const modal = new ModalBuilder()
    .setCustomId(`fb_submit_${matchId}_${pick}`)
    .setTitle(`⚽ Cược — ${BET_LABEL[pick]}`);
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('fb_amount')
      .setLabel(`Số coins (min ${MIN_BET.toLocaleString()} | "max" = all-in)`)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('VD: 500 hoặc max')
      .setMinLength(1).setMaxLength(20).setRequired(true)
  ));
  await interaction.showModal(modal);
}

// Xử lý sau khi nhập số tiền từ modal
async function submitBet(interaction, matchId, pick) {
  const match = stmts.getMatch.get(matchId);
  if (!match || match.status !== 'OPEN') {
    return interaction.reply({ content: '❌ Trận này không còn nhận cược!', ephemeral: true });
  }

  const MIN_BET = parseInt(process.env.MIN_BET || '10');
  const player  = getPlayer(interaction.user.id, interaction.user.username);
  const raw     = interaction.fields.getTextInputValue('fb_amount').trim().toLowerCase();

  let amount;
  if (raw === 'max' || raw === 'allin' || raw === 'all') amount = player.balance;
  else if (raw === 'min') amount = MIN_BET;
  else amount = parseInt(raw.replace(/[,. ]/g, ''));

  if (isNaN(amount) || amount < MIN_BET) {
    return interaction.reply({ content: `❌ Tối thiểu **${MIN_BET.toLocaleString()}** coins!`, ephemeral: true });
  }
  if (player.balance < amount) {
    return interaction.reply({ content: `❌ Không đủ coins! Số dư: **${player.balance.toLocaleString()}**`, ephemeral: true });
  }

  const odds   = ODDS[pick];
  const payout = Math.floor(amount * odds);

  adjustBalance(interaction.user.id, -amount);
  stmts.insertBet.run({ match_id: matchId, user_id: interaction.user.id, pick, amount, odds });

  await interaction.reply({
    content: `✅ Đã cược **${BET_LABEL[pick]}** — 💰 **${amount.toLocaleString()}** coins\n🎯 Nếu thắng nhận: **${payout.toLocaleString()}** coins`,
    ephemeral: true,
  });
}

// Settle trận — gọi khi có kết quả thực tế
async function settleMatch(matchId, homeScore, awayScore, channel) {
  const match = stmts.getMatch.get(matchId);
  if (!match) return { error: 'Không tìm thấy trận.' };
  if (match.status === 'SETTLED') return { error: 'Trận đã được settle rồi.' };

  // Xác định winner
  let winner;
  if (homeScore > awayScore)       winner = 'HOME';
  else if (homeScore < awayScore)  winner = 'AWAY';
  else                              winner = 'DRAW';

  stmts.updateMatchStatus.run({ match_id: matchId, status: 'SETTLED', home_score: homeScore, away_score: awayScore });

  const bets = stmts.getMatchBets.all(matchId);
  const winnerLines = [];
  const loserLines  = [];

  const settle = db.transaction(() => {
    for (const bet of bets) {
      const won    = bet.pick === winner;
      const payout = won ? Math.floor(bet.amount * bet.odds) : 0;
      stmts.settleBet.run({ id: bet.id, won: won ? 1 : 0, payout });
      if (won) {
        adjustBalance(bet.user_id, payout);
        updateStats(bet.user_id, payout - bet.amount, 0);
        winnerLines.push(`<@${bet.user_id}> **+${(payout - bet.amount).toLocaleString()}** (${BET_LABEL[bet.pick]} · ${bet.amount.toLocaleString()})`);
      } else {
        updateStats(bet.user_id, 0, bet.amount);
        loserLines.push(`<@${bet.user_id}> **-${bet.amount.toLocaleString()}** (${BET_LABEL[bet.pick]})`);
      }
    }
  });
  settle();

  const colorMap = { HOME: 0x00cc66, DRAW: 0xffcc00, AWAY: 0x3399ff };
  const embed = new EmbedBuilder()
    .setColor(colorMap[winner])
    .setTitle(`⚽ Kết Quả: ${match.home_team} vs ${match.away_team}`)
    .setDescription(`**${match.home_team} ${homeScore} – ${awayScore} ${match.away_team}**\n🏆 ${BET_LABEL[winner]}`)
    .addFields(
      { name: '🏆 Thắng', value: winnerLines.length ? winnerLines.join('\n') : '*Không có ai cược đúng.*', inline: false },
      { name: '💸 Thua',  value: loserLines.length  ? loserLines.join('\n')  : '*Không có ai thua.*',      inline: false },
    )
    .setTimestamp();

  if (channel) await channel.send({ embeds: [embed] });
  return { success: true, winner, totalBets: bets.length };
}

// Tự động kiểm tra kết quả các trận đang OPEN
async function autoCheckResults(client) {
  const openMatches = stmts.getOpenMatches.all();
  if (!openMatches.length) return;

  for (const match of openMatches) {
    try {
      const data = await getMatch(match.match_id);
      const st   = data.status;
      // Chỉ settle khi trận đã kết thúc
      if (st !== 'FINISHED') continue;

      const homeScore = data.score?.fullTime?.home ?? null;
      const awayScore = data.score?.fullTime?.away ?? null;
      if (homeScore === null || awayScore === null) continue;

      // Tìm channel đầu tiên đã từng post trận này để announce
      await settleMatch(match.match_id, homeScore, awayScore, null);
      console.log(`✅ Auto-settled match ${match.match_id}: ${homeScore}-${awayScore}`);
    } catch (e) {
      console.error(`❌ Auto-check error for match ${match.match_id}:`, e.message);
    }
  }
}

module.exports = {
  openMatch, placeBet, submitBet, settleMatch, autoCheckResults,
  buildMatchEmbed, buildBetButtons, getBetsMap,
  stmts, ODDS, BET_LABEL,
};
