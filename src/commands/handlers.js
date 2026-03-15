'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const roundManager = require('../game/roundManager');
const { getPlayer, claimDaily, getLeaderboard, adjustBalance, db, addAutoChannel, removeAutoChannel } = require('../utils/database');

// Track auto-restart channels (in-memory mirror của DB)
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
  removeAutoChannel(interaction.channelId);
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
    removeAutoChannel(channelId);
    return interaction.reply({ content: '🔴 Auto-restart **disabled** for this channel.', flags: 64 });
  } else {
    autoChannels.add(channelId);
    addAutoChannel(channelId, interaction.guildId);
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
    .setTitle('🏆 LEADERBOARD')
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
      '`!bankinfo @user` — Xem số dư bank của người dùng',
    ].join('\n'))
    .setFooter({ text: 'Dùng prefix ! — không hiển thị trong autocomplete với người thường' })
    .setTimestamp();
  return interaction.reply({ embeds: [embed], flags: 64 });
}

// ── BANK HANDLER ─────────────────────────────────────────────────────────────
async function handleBank(interaction) {
  const sub = interaction.options.getSubcommand();
  const { getBank, bankDeposit, bankWithdraw, getPlayer, INTEREST_RATE } = require('../utils/database');
  const userId   = interaction.user.id;
  const username = interaction.user.username;
  const player   = getPlayer(userId, username);
  const acc      = getBank(userId);
  const rate     = (INTEREST_RATE * 100).toFixed(1);

  if (sub === 'balance') {
    const total = player.balance + acc.savings;
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🏦 Tài Khoản Ngân Hàng')
      .setDescription(`<@${userId}>`)
      .addFields(
        { name: '💳 Ví (Wallet)',     value: `**${player.balance.toLocaleString()}** coins`, inline: true },
        { name: '🏦 Tiết Kiệm (Bank)',value: `**${acc.savings.toLocaleString()}** coins`,   inline: true },
        { name: '💰 Tổng Tài Sản',    value: `**${total.toLocaleString()}** coins`,          inline: true },
        { name: '📈 Lãi Suất',        value: `**${rate}%** / giờ`,                           inline: true },
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: 'Lãi được tính và cộng tự động mỗi giờ' })
      .setTimestamp();
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  const raw = interaction.options.getString('amount').trim().toLowerCase();
  let amount;
  if (raw === 'max' || raw === 'all') {
    amount = sub === 'deposit' ? player.balance : acc.savings;
  } else {
    amount = parseInt(raw.replace(/[,. ]/g, ''));
  }

  if (isNaN(amount) || amount <= 0) {
    return interaction.reply({ content: '❌ Số tiền không hợp lệ!', flags: 64 });
  }

  if (sub === 'deposit') {
    if (player.balance < amount) {
      return interaction.reply({ content: `❌ Ví không đủ! Hiện có **${player.balance.toLocaleString()}** coins.`, flags: 64 });
    }
    const result = bankDeposit(userId, amount);
    if (result.error) return interaction.reply({ content: `❌ ${result.error}`, flags: 64 });

    const updated = getBank(userId);
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🏦 Gửi Tiền Thành Công')
      .addFields(
        { name: '➕ Đã gửi',         value: `**${amount.toLocaleString()}** coins`,           inline: true },
        { name: '🏦 Số dư Bank',     value: `**${updated.savings.toLocaleString()}** coins`,  inline: true },
        { name: '💳 Số dư Ví',       value: `**${(player.balance - amount).toLocaleString()}** coins`, inline: true },
        { name: '📈 Lãi Suất',       value: `**${rate}%** / giờ`,                             inline: true },
      )
      .setTimestamp();
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  if (sub === 'withdraw') {
    const result = bankWithdraw(userId, amount);
    if (result.error) return interaction.reply({ content: `❌ ${result.error}`, flags: 64 });

    const updatedAcc    = getBank(userId);
    const updatedPlayer = getPlayer(userId, username);
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('🏦 Rút Tiền Thành Công')
      .addFields(
        { name: '➖ Đã rút',     value: `**${amount.toLocaleString()}** coins`,              inline: true },
        { name: '🏦 Số dư Bank', value: `**${updatedAcc.savings.toLocaleString()}** coins`,  inline: true },
        { name: '💳 Số dư Ví',   value: `**${updatedPlayer.balance.toLocaleString()}** coins`, inline: true },
      )
      .setTimestamp();
    return interaction.reply({ embeds: [embed], flags: 64 });
  }
}


// ── PREFIX COMMANDS (!lệnh) — chỉ admin dùng được ──────────────────────────
async function handlePrefixAdmin(message) {
  const args = message.content.slice(1).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();

  async function resolveUser(arg) {
    if (!arg) return null;
    const id = arg.replace(/[<@!>]/g, '');
    try { return await message.client.users.fetch(id); } catch { return null; }
  }

  if (cmd === 'addcoins') {
    const target = await resolveUser(args[1]);
    const amount = parseInt(args[2]);
    if (!target || isNaN(amount) || amount <= 0)
      return message.reply('Dung: !addcoins @user <so coins>');
    getPlayer(target.id, target.username);
    adjustBalance(target.id, amount);
    const after = getPlayer(target.id, target.username);
    return message.reply(`Da them +${amount.toLocaleString()} coins cho <@${target.id}> - So du moi: ${after.balance.toLocaleString()} coins`);
  }

  if (cmd === 'removecoins') {
    const target = await resolveUser(args[1]);
    const amount = parseInt(args[2]);
    if (!target || isNaN(amount) || amount <= 0)
      return message.reply('Dung: !removecoins @user <so coins>');
    getPlayer(target.id, target.username);
    const deduct = Math.min(amount, getPlayer(target.id, target.username).balance);
    adjustBalance(target.id, -deduct);
    const after = getPlayer(target.id, target.username);
    return message.reply(`Da tru -${deduct.toLocaleString()} coins cua <@${target.id}> - So du moi: ${after.balance.toLocaleString()} coins`);
  }

  if (cmd === 'setcoins') {
    const target = await resolveUser(args[1]);
    const amount = parseInt(args[2]);
    if (!target || isNaN(amount) || amount < 0)
      return message.reply('Dung: !setcoins @user <so coins>');
    getPlayer(target.id, target.username);
    db.prepare('UPDATE players SET balance = ? WHERE user_id = ?').run(amount, target.id);
    return message.reply(`Da set so du <@${target.id}> thanh ${amount.toLocaleString()} coins`);
  }

  if (cmd === 'resetbalance') {
    const target = await resolveUser(args[1]);
    if (!target) return message.reply('Dung: !resetbalance @user');
    const startBalance = parseInt(process.env.STARTING_BALANCE || '1000');
    getPlayer(target.id, target.username);
    db.prepare('UPDATE players SET balance = ? WHERE user_id = ?').run(startBalance, target.id);
    return message.reply(`Da reset so du <@${target.id}> ve ${startBalance.toLocaleString()} coins`);
  }

  if (cmd === 'checkuser') {
    const target = await resolveUser(args[1]);
    if (!target) return message.reply('Dung: !checkuser @user');
    const player = getPlayer(target.id, target.username);
    if (!player) return message.reply('Nguoi dung chua choi bao gio.');
    const net = player.total_won - player.total_lost;
    const winRate = (player.total_won + player.total_lost) > 0
      ? ((player.total_won / (player.total_won + player.total_lost)) * 100).toFixed(1) : '0.0';
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('Thong Tin: ' + target.username)
      .addFields(
        { name: 'So du', value: player.balance.toLocaleString() + ' coins', inline: true },
        { name: 'So van', value: String(player.games_played), inline: true },
        { name: 'Win Rate', value: winRate + '%', inline: true },
        { name: 'Tong thang', value: player.total_won.toLocaleString(), inline: true },
        { name: 'Tong thua', value: player.total_lost.toLocaleString(), inline: true },
        { name: 'Net', value: (net >= 0 ? '+' : '') + net.toLocaleString(), inline: true },
      )
      .setFooter({ text: 'ID: ' + target.id });
    return message.reply({ embeds: [embed] });
  }

  if (cmd === 'resetdaily') {
    const target = await resolveUser(args[1]);
    if (!target) return message.reply('Dung: !resetdaily @user');
    getPlayer(target.id, target.username);
    db.prepare('UPDATE players SET last_daily = NULL WHERE user_id = ?').run(target.id);
    return message.reply('Da reset daily cho <@' + target.id + '>');
  }

  if (cmd === 'setresult') {
    const val = (args[1] || '').toUpperCase();
    if (!['TAI', 'XIU', 'TRIPLE', 'RANDOM'].includes(val))
      return message.reply('Dung: !setresult tai | xiu | triple | random');
    if (val === 'RANDOM') {
      roundManager.forceResult = null;
      return message.reply('Da bo can thiep - van tiep theo ngau nhien');
    }
    roundManager.forceResult = val;
    return message.reply('Van tiep theo se ra: ' + val);
  }
}

module.exports = {
  handleSicboStart, handleSicboStop, handleSicboAutostart,
  handleBalance, handleDaily, handleLeaderboard, handleStats, handleGive,
  handleAdmin, handleBank,
  handlePrefixAdmin, autoChannels,
};
