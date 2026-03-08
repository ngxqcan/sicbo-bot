'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const roundManager = require('../game/roundManager');
const { getPlayer, claimDaily, getLeaderboard, adjustBalance, db } = require('../utils/database');

// Track auto-restart channels
const autoChannels = new Set();

// ─── Admin check ────────────────────────────────────────────────────────────
// Admin được xác định bằng username Discord (không phải display name)
// Set ADMIN_USERNAME=nugen.x trong .env
function isAdmin(interaction) {
  const adminId = process.env.ADMIN_ID || '706473658641678346';
  return interaction.user.id === adminId;
}

async function handleSicboStart(interaction) {
  const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
  
  if (roundManager.isActive(interaction.channelId)) {
    return interaction.reply({ content: '❌ A round is already running here! Wait for it to finish.', flags: 64 });
  }

  await interaction.reply({ content: '🎲 Starting a new round...', flags: 64 });

  const auto = autoChannels.has(interaction.channelId);
  const result = await roundManager.startRound(interaction.channel, auto);
  
  if (result?.error) {
    await interaction.followUp({ content: `❌ ${result.error}`, flags: 64 });
  }
}

async function handleSicboStop(interaction) {
  const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
  if (!isAdmin) {
    return interaction.reply({ content: '❌ You need **Manage Server** permission to stop rounds.', flags: 64 });
  }

  if (!roundManager.isActive(interaction.channelId)) {
    return interaction.reply({ content: '❌ No active round in this channel.', flags: 64 });
  }

  autoChannels.delete(interaction.channelId);
  await interaction.reply({ content: '⏹️ Stopping current round...', flags: 64 });
  await roundManager.endRound(interaction.channel, false);
}

async function handleSicboAutostart(interaction) {
  const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
  if (!isAdmin) {
    return interaction.reply({ content: '❌ You need **Manage Server** permission to toggle auto-start.', flags: 64 });
  }

  const channelId = interaction.channelId;
  if (autoChannels.has(channelId)) {
    autoChannels.delete(channelId);
    return interaction.reply({ content: '🔴 Auto-restart **disabled** for this channel.', flags: 64 });
  } else {
    autoChannels.add(channelId);
    await interaction.reply({ content: '🟢 Auto-restart **enabled**! Starting first round...', flags: 64 });
    if (!roundManager.isActive(channelId)) {
      await roundManager.startRound(interaction.channel, true);
    }
  }
}

async function handleBalance(interaction) {
  const player = getPlayer(interaction.user.id, interaction.user.username);
  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('💰 Your Balance')
    .setDescription(`<@${interaction.user.id}>`)
    .addFields(
      { name: '💳 Balance', value: `**${player.balance.toLocaleString()}** coins`, inline: true },
      { name: '🎮 Games Played', value: `${player.games_played.toLocaleString()}`, inline: true },
    )
    .setThumbnail(interaction.user.displayAvatarURL())
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleDaily(interaction) {
  getPlayer(interaction.user.id, interaction.user.username); // ensure exists
  const result = claimDaily(interaction.user.id);
  
  if (result.success) {
    const player = getPlayer(interaction.user.id, interaction.user.username);
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('🎁 Daily Reward Claimed!')
      .setDescription(`You received **${result.reward.toLocaleString()}** coins!`)
      .addFields({ name: '💳 New Balance', value: `**${player.balance.toLocaleString()}** coins`, inline: true })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  } else if (result.remaining) {
    const hours = Math.floor(result.remaining / 3600);
    const minutes = Math.floor((result.remaining % 3600) / 60);
    await interaction.reply({
      content: `⏰ You already claimed your daily reward! Come back in **${hours}h ${minutes}m**.`,
      flags: 64,
    });
  } else {
    await interaction.reply({ content: `❌ ${result.reason}`, flags: 64 });
  }
}

async function handleLeaderboard(interaction) {
  const players = getLeaderboard();
  const medals = ['🥇', '🥈', '🥉'];
  
  const lines = players.map((p, i) => {
    const medal = medals[i] || `**${i + 1}.**`;
    return `${medal} <@${p.user_id}> — 💰 **${p.balance.toLocaleString()}** coins · ${p.games_played} games`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🏆 Sic Bo Leaderboard')
    .setDescription(lines.length > 0 ? lines.join('\n') : '*No players yet!*')
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
}

async function handleStats(interaction) {
  const player = getPlayer(interaction.user.id, interaction.user.username);
  const winRate = player.games_played > 0
    ? ((player.total_won / (player.total_won + player.total_lost)) * 100).toFixed(1)
    : '0.0';
  const net = player.total_won - player.total_lost;
  
  const embed = new EmbedBuilder()
    .setColor(net >= 0 ? 0x00FF00 : 0xFF4444)
    .setTitle('📊 Your Statistics')
    .setDescription(`<@${interaction.user.id}>`)
    .addFields(
      { name: '💳 Balance', value: `${player.balance.toLocaleString()} coins`, inline: true },
      { name: '🎮 Games Played', value: `${player.games_played.toLocaleString()}`, inline: true },
      { name: '📈 Win Rate', value: `${winRate}%`, inline: true },
      { name: '✅ Total Won', value: `${player.total_won.toLocaleString()} coins`, inline: true },
      { name: '❌ Total Lost', value: `${player.total_lost.toLocaleString()} coins`, inline: true },
      { name: `${net >= 0 ? '🟢' : '🔴'} Net P&L`, value: `${net >= 0 ? '+' : ''}${net.toLocaleString()} coins`, inline: true },
    )
    .setThumbnail(interaction.user.displayAvatarURL())
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleGive(interaction) {
  const target = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');
  
  if (target.id === interaction.user.id) {
    return interaction.reply({ content: '❌ You cannot give coins to yourself!', flags: 64 });
  }
  if (target.bot) {
    return interaction.reply({ content: '❌ You cannot give coins to bots!', flags: 64 });
  }

  const sender = getPlayer(interaction.user.id, interaction.user.username);
  if (sender.balance < amount) {
    return interaction.reply({
      content: `❌ Insufficient funds! You have **${sender.balance.toLocaleString()}** coins.`,
      flags: 64,
    });
  }

  const { adjustBalance } = require('../utils/database');
  adjustBalance(interaction.user.id, -amount);
  getPlayer(target.id, target.username); // ensure target exists
  adjustBalance(target.id, amount);

  const newBalance = getPlayer(interaction.user.id, interaction.user.username).balance;
  await interaction.reply({
    content: `✅ Sent **${amount.toLocaleString()}** coins to <@${target.id}>!\n💳 Your new balance: **${newBalance.toLocaleString()}** coins`,
  });
}

// ─── ADMIN COMMANDS ──────────────────────────────────────────────────────────
async function handleAdmin(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({
      content: '🔐 **Bạn không có quyền dùng lệnh admin!**',
      flags: 64,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🔐 Admin · Danh Sách Lệnh')
    .setDescription([
      '`!addcoins @user <số>` — Thêm coins',
      '`!removecoins @user <số>` — Xoá coins',
      '`!setcoins @user <số>` — Đặt số coins cụ thể',
      '`!resetbalance @user` — Reset về mặc định',
      '`!checkuser @user` — Xem thông tin người dùng',
      '`!resetdaily @user` — Reset daily reward',
      '`!setresult tai|xiu|triple|random` — Can thiệp kết quả',
      '`!settle <matchId> <homeScore> <awayScore>` — Settle kết quả bóng đá',
    ].join('\n'))
    .setFooter({ text: 'Dùng prefix ! — không hiển thị trong autocomplete với người thường' })
    .setTimestamp();
  return interaction.reply({ embeds: [embed], flags: 64 });
}

// ── FOOTBALL HANDLERS ────────────────────────────────────────────────────────
async function handleFootball(interaction) {
  const sub = interaction.options.getSubcommand();
  const { getUpcomingMatches } = require('../utils/footballApi');
  const fm = require('../game/footballManager');

  if (sub === 'matches') {
    await interaction.deferReply();
    let rawMatches;
    try {
      rawMatches = await getUpcomingMatches();
    } catch (e) {
      return interaction.editReply({ content: `❌ Không lấy được lịch thi đấu: ${e.message}` });
    }

    if (!rawMatches.length) {
      return interaction.editReply({ content: '📭 Không có trận EPL nào sắp diễn ra trong 7 ngày tới.' });
    }

    // Lưu tất cả trận vào DB, lấy object từ DB
    const matches = rawMatches.map(m => fm.openMatch(m));

    // 1 embed duy nhất + buttons theo số thứ tự
    const embed   = fm.buildListEmbed(matches);
    const buttons = fm.buildListButtons(matches);
    return interaction.editReply({ embeds: [embed], components: buttons });
  }

  if (sub === 'mybets') {
    const bets = db.prepare(`
      SELECT fb.*, fm.home_team, fm.away_team, fm.match_date, fm.status, fm.home_score, fm.away_score
      FROM football_bets fb
      JOIN football_matches fm ON fb.match_id = fm.match_id
      WHERE fb.user_id = ?
      ORDER BY fb.created_at DESC
      LIMIT 10
    `).all(interaction.user.id);

    if (!bets.length) {
      return interaction.reply({ content: '📭 Bạn chưa có cược bóng đá nào.', ephemeral: true });
    }

    const { BET_LABEL } = fm;
    const lines = bets.map(b => {
      const date = new Date(b.match_date * 1000).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
      if (b.settled) {
        const icon   = b.won ? '✅' : '❌';
        const result = b.won ? `+${(b.payout - b.amount).toLocaleString()}` : `-${b.amount.toLocaleString()}`;
        return `${icon} **${b.home_team} vs ${b.away_team}** (${date})\n　${BET_LABEL[b.pick]} · ${b.amount.toLocaleString()} coins → **${result}**`;
      } else {
        return `⏳ **${b.home_team} vs ${b.away_team}** (${date})\n　${BET_LABEL[b.pick]} · ${b.amount.toLocaleString()} coins · x${b.odds}`;
      }
    }).join('\n\n');

    const embed = new EmbedBuilder()
      .setColor(0x3a7d44)
      .setTitle('⚽ Cược Bóng Đá Của Bạn')
      .setDescription(lines)
      .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

// ── PREFIX COMMANDS (!lệnh) — chỉ admin thấy và dùng ──────────────────────
async function handlePrefixAdmin(message) {
  const args = message.content.slice(1).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();

  const { adjustBalance, getPlayer, db } = require('../utils/database');
  const { EmbedBuilder } = require('discord.js');

  // Helper lấy user từ mention hoặc ID
  async function resolveUser(arg) {
    if (!arg) return null;
    const id = arg.replace(/[<@!>]/g, '');
    try { return await message.client.users.fetch(id); } catch { return null; }
  }

  if (cmd === 'addcoins') {
    const target = await resolveUser(args[1]);
    const amount = parseInt(args[2]);
    if (!target || isNaN(amount) || amount <= 0)
      return message.reply('❌ Dùng: `!addcoins @user <số coins>`');
    getPlayer(target.id, target.username);
    adjustBalance(target.id, amount);
    const after = getPlayer(target.id, target.username);
    return message.reply(`✅ Đã thêm **+${amount.toLocaleString()}** coins cho <@${target.id}>
💳 Số dư mới: **${after.balance.toLocaleString()}** coins`);
  }

  if (cmd === 'removecoins') {
    const target = await resolveUser(args[1]);
    const amount = parseInt(args[2]);
    if (!target || isNaN(amount) || amount <= 0)
      return message.reply('❌ Dùng: `!removecoins @user <số coins>`');
    getPlayer(target.id, target.username);
    const deduct = Math.min(amount, getPlayer(target.id, target.username).balance);
    adjustBalance(target.id, -deduct);
    const after = getPlayer(target.id, target.username);
    return message.reply(`✅ Đã trừ **-${deduct.toLocaleString()}** coins của <@${target.id}>
💳 Số dư mới: **${after.balance.toLocaleString()}** coins`);
  }

  if (cmd === 'setcoins') {
    const target = await resolveUser(args[1]);
    const amount = parseInt(args[2]);
    if (!target || isNaN(amount) || amount < 0)
      return message.reply('❌ Dùng: `!setcoins @user <số coins>`');
    getPlayer(target.id, target.username);
    db.prepare('UPDATE players SET balance = ? WHERE user_id = ?').run(amount, target.id);
    return message.reply(`✅ Đã set số dư <@${target.id}> thành **${amount.toLocaleString()}** coins`);
  }

  if (cmd === 'resetbalance') {
    const target = await resolveUser(args[1]);
    if (!target) return message.reply('❌ Dùng: `!resetbalance @user`');
    const startBalance = parseInt(process.env.STARTING_BALANCE || '1000');
    getPlayer(target.id, target.username);
    db.prepare('UPDATE players SET balance = ? WHERE user_id = ?').run(startBalance, target.id);
    return message.reply(`✅ Đã reset số dư <@${target.id}> về **${startBalance.toLocaleString()}** coins`);
  }

  if (cmd === 'checkuser') {
    const target = await resolveUser(args[1]);
    if (!target) return message.reply('❌ Dùng: `!checkuser @user`');
    const player = getPlayer(target.id, target.username);
    if (!player) return message.reply('❌ Người dùng chưa chơi bao giờ.');
    const net = player.total_won - player.total_lost;
    const winRate = player.games_played > 0
      ? ((player.total_won / (player.total_won + player.total_lost)) * 100).toFixed(1) : '0.0';
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`🔍 Thông Tin: ${target.username}`)
      .addFields(
        { name: '💳 Số dư', value: `${player.balance.toLocaleString()} coins`, inline: true },
        { name: '🎮 Số ván', value: `${player.games_played}`, inline: true },
        { name: '📈 Win Rate', value: `${winRate}%`, inline: true },
        { name: '✅ Tổng thắng', value: `${player.total_won.toLocaleString()}`, inline: true },
        { name: '❌ Tổng thua', value: `${player.total_lost.toLocaleString()}`, inline: true },
        { name: `${net >= 0 ? '🟢' : '🔴'} Net`, value: `${net >= 0 ? '+' : ''}${net.toLocaleString()}`, inline: true },
      )
      .setFooter({ text: `ID: ${target.id}` });
    return message.reply({ embeds: [embed] });
  }

  if (cmd === 'resetdaily') {
    const target = await resolveUser(args[1]);
    if (!target) return message.reply('❌ Dùng: `!resetdaily @user`');
    getPlayer(target.id, target.username);
    db.prepare('UPDATE players SET last_daily = NULL WHERE user_id = ?').run(target.id);
    return message.reply(`✅ Đã reset daily cho <@${target.id}>`);
  }

  if (cmd === 'setresult') {
    const val = (args[1] || '').toUpperCase();
    const valid = ['TAI', 'XIU', 'TRIPLE', 'RANDOM'];
    if (!valid.includes(val))
      return message.reply('❌ Dùng: `!setresult tai | xiu | triple | random`');
    if (val === 'RANDOM') {
      roundManager.forceResult = null;
      return message.reply('🎲 Đã bỏ can thiệp — ván tiếp theo ngẫu nhiên');
    }
    roundManager.forceResult = val;
    const names = { TAI: '🔴 Tài', XIU: '🔵 Xỉu', TRIPLE: '⭐ Triple' };
    return message.reply(`🎯 Ván tiếp theo sẽ ra: **${names[val]}**`);
  }

  // !settle <matchId> <homeScore> <awayScore>
  if (cmd === 'settle') {
    const matchId   = args[1];
    const homeScore = parseInt(args[2]);
    const awayScore = parseInt(args[3]);
    if (!matchId || isNaN(homeScore) || isNaN(awayScore))
      return message.reply('❌ Dùng: `!settle <matchId> <homeScore> <awayScore>`\nVD: `!settle 12345 2 1`');
    const { settleMatch } = require('../game/footballManager');
    const result = await settleMatch(matchId, homeScore, awayScore, message.channel);
    if (result.error) return message.reply(`❌ ${result.error}`);
    return message.reply(`✅ Đã settle trận \`${matchId}\` — ${homeScore}:${awayScore} · ${result.totalBets} cược được xử lý`);
  }
}

module.exports = {
  handleSicboStart,
  handleSicboStop,
  handleSicboAutostart,
  handleBalance,
  handleDaily,
  handleLeaderboard,
  handleStats,
  handleGive,
  handleAdmin,
  handleFootball,
  handlePrefixAdmin,
  autoChannels,
};
