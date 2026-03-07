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
  const adminUsername = process.env.ADMIN_USERNAME || 'nugen.x';
  return interaction.user.username === adminUsername;
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

  const sub = interaction.options.getSubcommand(false);

  if (!sub) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🔐 Admin · Danh Sách Lệnh')
      .setDescription([
        '`/admin addcoins` — Thêm coins cho người dùng',
        '`/admin removecoins` — Xoá coins của người dùng',
        '`/admin setcoins` — Đặt số coins cụ thể',
        '`/admin resetbalance` — Reset số dư về mặc định',
        '`/admin checkuser` — Xem thông tin chi tiết người dùng',
        '`/admin resetdaily` — Reset daily reward',
        '`/admin setresult` — Can thiệp kết quả ván tiếp theo',
      ].join('\n'))
      .setFooter({ text: 'Chỉ admin mới thấy và dùng được lệnh này' })
      .setTimestamp();
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  const target = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');

  switch (sub) {
    case 'addcoins': {
      getPlayer(target.id, target.username); // ensure exists
      adjustBalance(target.id, amount);
      const after = getPlayer(target.id, target.username);
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Admin · Thêm Coins')
        .addFields(
          { name: '👤 Người nhận', value: `<@${target.id}> (\`${target.username}\`)`, inline: true },
          { name: '➕ Thêm', value: `**+${amount.toLocaleString()}** coins`, inline: true },
          { name: '💳 Số dư mới', value: `**${after.balance.toLocaleString()}** coins`, inline: true },
        )
        .setFooter({ text: `Thực hiện bởi ${interaction.user.username}` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    case 'removecoins': {
      const player = getPlayer(target.id, target.username);
      const deduct = Math.min(amount, player.balance); // không trừ âm
      adjustBalance(target.id, -deduct);
      const after = getPlayer(target.id, target.username);
      const embed = new EmbedBuilder()
        .setColor(0xFF4444)
        .setTitle('✅ Admin · Xoá Coins')
        .addFields(
          { name: '👤 Người dùng', value: `<@${target.id}> (\`${target.username}\`)`, inline: true },
          { name: '➖ Trừ', value: `**-${deduct.toLocaleString()}** coins`, inline: true },
          { name: '💳 Số dư mới', value: `**${after.balance.toLocaleString()}** coins`, inline: true },
        )
        .setFooter({ text: `Thực hiện bởi ${interaction.user.username}` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    case 'setcoins': {
      getPlayer(target.id, target.username);
      db.prepare('UPDATE players SET balance = ? WHERE user_id = ?').run(amount, target.id);
      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('✅ Admin · Đặt Coins')
        .addFields(
          { name: '👤 Người dùng', value: `<@${target.id}> (\`${target.username}\`)`, inline: true },
          { name: '💳 Số dư mới', value: `**${amount.toLocaleString()}** coins`, inline: true },
        )
        .setFooter({ text: `Thực hiện bởi ${interaction.user.username}` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    case 'resetbalance': {
      const startBalance = parseInt(process.env.STARTING_BALANCE || '1000');
      getPlayer(target.id, target.username);
      db.prepare('UPDATE players SET balance = ? WHERE user_id = ?').run(startBalance, target.id);
      const embed = new EmbedBuilder()
        .setColor(0xFFAA00)
        .setTitle('✅ Admin · Reset Số Dư')
        .addFields(
          { name: '👤 Người dùng', value: `<@${target.id}> (\`${target.username}\`)`, inline: true },
          { name: '💳 Số dư reset', value: `**${startBalance.toLocaleString()}** coins`, inline: true },
        )
        .setFooter({ text: `Thực hiện bởi ${interaction.user.username}` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    case 'checkuser': {
      const player = getPlayer(target.id, target.username);
      if (!player) {
        return interaction.reply({ content: `❌ Người dùng <@${target.id}> chưa chơi bao giờ.`, flags: 64 });
      }
      const winRate = player.games_played > 0
        ? ((player.total_won / (player.total_won + player.total_lost)) * 100).toFixed(1)
        : '0.0';
      const net = player.total_won - player.total_lost;
      const lastDaily = player.last_daily
        ? `<t:${player.last_daily}:R>`
        : '*Chưa nhận*';
      const joined = `<t:${player.created_at}:D>`;

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🔍 Admin · Thông Tin Người Dùng`)
        .setDescription(`<@${target.id}> (\`${target.username}\`)`)
        .addFields(
          { name: '💳 Số dư', value: `${player.balance.toLocaleString()} coins`, inline: true },
          { name: '🎮 Số ván', value: `${player.games_played.toLocaleString()}`, inline: true },
          { name: '📈 Win Rate', value: `${winRate}%`, inline: true },
          { name: '✅ Tổng thắng', value: `${player.total_won.toLocaleString()} coins`, inline: true },
          { name: '❌ Tổng thua', value: `${player.total_lost.toLocaleString()} coins`, inline: true },
          { name: `${net >= 0 ? '🟢' : '🔴'} Net`, value: `${net >= 0 ? '+' : ''}${net.toLocaleString()} coins`, inline: true },
          { name: '🎁 Daily gần nhất', value: lastDaily, inline: true },
          { name: '📅 Tham gia', value: joined, inline: true },
        )
        .setThumbnail(target.displayAvatarURL())
        .setFooter({ text: `ID: ${target.id}` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    case 'resetdaily': {
      getPlayer(target.id, target.username);
      db.prepare('UPDATE players SET last_daily = NULL WHERE user_id = ?').run(target.id);
      const embed = new EmbedBuilder()
        .setColor(0x00FFAA)
        .setTitle('✅ Admin · Reset Daily')
        .setDescription(`<@${target.id}> có thể nhận daily reward ngay bây giờ!`)
        .setFooter({ text: `Thực hiện bởi ${interaction.user.username}` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    case 'setresult': {
      const result = interaction.options.getString('result');
      const roundManager = require('../game/roundManager');
      if (result === 'RANDOM') {
        roundManager.forceResult = null;
        const embed = new EmbedBuilder()
          .setColor(0x95a5a6)
          .setTitle('🎲 Admin · Bỏ Can Thiệp')
          .setDescription('Ván tiếp theo sẽ **ngẫu nhiên** bình thường.')
          .setFooter({ text: `Thực hiện bởi ${interaction.user.username}` })
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: 64 });
      }
      roundManager.forceResult = result;
      const labelMap = { TAI: '🔴 Tài', XIU: '🔵 Xỉu', TRIPLE: '⭐ Triple' };
      const colorMap = { TAI: 0xFF3333, XIU: 0x3399FF, TRIPLE: 0xAA00FF };
      const embed = new EmbedBuilder()
        .setColor(colorMap[result])
        .setTitle('🎯 Admin · Can Thiệp Kết Quả')
        .setDescription(`Ván **tiếp theo** sẽ ra: **${labelMap[result]}**

⚠️ Tự động reset sau 1 ván.`)
        .setFooter({ text: `Thực hiện bởi ${interaction.user.username}` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    default:
      return interaction.reply({ content: '❓ Subcommand không hợp lệ.', flags: 64 });
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
  autoChannels,
};
