'use strict';

require('dotenv').config();

const { Client, GatewayIntentBits, Events } = require('discord.js');
const roundManager = require('./game/roundManager');
const {
  handleSicboStart, handleSicboStop, handleSicboAutostart,
  handleBalance, handleDaily, handleLeaderboard, handleStats, handleGive, handleAdmin,
  handleFootball,
} = require('./commands/handlers');

const REQUIRED = ['DISCORD_TOKEN', 'CLIENT_ID'];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  makeCache: require('discord.js').Options.cacheWithLimits({
    ...require('discord.js').Options.DefaultMakeCacheSettings,
    MessageManager: 50,   // giữ tối đa 50 tin nhắn/kênh thay vì không giới hạn
    UserManager: 200,     // giữ tối đa 200 users
  }),
});

client.once(Events.ClientReady, () => {
  roundManager.setClient(client);
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🎲 Sic Bo Bot is ready! Serving ${client.guilds.cache.size} guild(s).`);
  client.user.setActivity('🎲 Tài Xỉu | /sicbo start');

  // Tự động kiểm tra kết quả bóng đá mỗi 5 phút
  const { autoCheckResults } = require('./game/footballManager');
  setInterval(() => autoCheckResults(client), 5 * 60 * 1000).unref();
});

client.on(Events.InteractionCreate, async (interaction) => {

  // ── Nút bấm ────────────────────────────────────────────────────────────────
  if (interaction.isButton()) {
    // Nút Soi Cầu
    if (interaction.customId === 'soicau') {
      const { getRecentRounds } = require('./utils/database');
      const rounds = getRecentRounds(10);

      const ICONS = { TAI: '🔴', XIU: '🔵', TRIPLE: '⭐' };
      const NAMES = { TAI: 'Tài', XIU: 'Xỉu', TRIPLE: 'Triple' };

      let historyText = '';
      if (rounds.length === 0) {
        historyText = '*Chưa có lịch sử ván nào.*';
      } else {
        const counts = { TAI: 0, XIU: 0, TRIPLE: 0 };
        rounds.forEach(r => counts[r.result]++);
        const row = rounds.map(r => ICONS[r.result]).join(' ');
        historyText = `**Dãy kết quả (mới → cũ):**\n${row}\n\n` +
          `🔴 Tài: **${counts.TAI}** lần  🔵 Xỉu: **${counts.XIU}** lần  ⭐ Triple: **${counts.TRIPLE}** lần`;
        const details = rounds.map((r, i) => {
          const d = `${r.dice1}-${r.dice2}-${r.dice3}`;
          return `\`${i+1}.\` ${ICONS[r.result]} **${NAMES[r.result]}** · ${d} (${r.total})`;
        }).join('\n');
        historyText += `\n\n**Chi tiết:**\n${details}`;
      }

      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('🔮 Soi Cầu — 10 Ván Gần Nhất')
        .setDescription(historyText)
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── Football: xem chi tiết trận (Trận 1, Trận 2...) ──────────────────
    if (interaction.customId.startsWith('fb_view_')) {
      const matchId = interaction.customId.slice('fb_view_'.length);
      const fm = require('./game/footballManager');
      await fm.viewMatch(interaction, matchId);
      return;
    }

    // ── Football: chọn kèo (Thắng Nhà / Hòa / Thắng Khách) ──────────────
    if (interaction.customId.startsWith('fb_bet_')) {
      const parts   = interaction.customId.split('_'); // fb_bet_matchId_PICK
      const pick    = parts[parts.length - 1];
      const matchId = parts.slice(2, parts.length - 1).join('_');
      const fm = require('./game/footballManager');
      await fm.placeBet(interaction, matchId, pick);
      return;
    }

    // Nút cược Tài Xỉu → hiện modal
    const parts = interaction.customId.split('_');
    if (parts[0] !== 'betmodal') return;
    const betType = parts[1];
    await roundManager.showBetModal(interaction, betType);
    return;
  }

  // ── Football bet modal submit ───────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId.startsWith('fb_submit_')) {
    const parts   = interaction.customId.split('_'); // fb_submit_matchId_PICK
    const pick    = parts[parts.length - 1];
    const matchId = parts.slice(2, parts.length - 1).join('_');
    const fm = require('./game/footballManager');
    await fm.submitBet(interaction, matchId, pick);
    return;
  }
  if (interaction.isModalSubmit()) {
    const parts = interaction.customId.split('_');
    if (parts[0] !== 'betsubmit') return;
    const betType = parts[1];
    const raw = interaction.fields.getTextInputValue('bet_amount').trim().toLowerCase();

    const { getPlayer } = require('./utils/database');
    const MIN_BET = parseInt(process.env.MIN_BET || '10');
    const player = getPlayer(interaction.user.id, interaction.user.username);

    let amount;
    if (raw === 'max' || raw === 'allin' || raw === 'all') {
      amount = player.balance; // all-in
    } else if (raw === 'min') {
      amount = MIN_BET;
    } else {
      amount = parseInt(raw.replace(/[,. ]/g, ''));
    }

    await roundManager.placeBet(interaction, betType, amount);
    return;
  }

  // ── Slash commands ──────────────────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;

  try {
    switch (interaction.commandName) {
      case 'sicbo': {
        const sub = interaction.options.getSubcommand();
        if (sub === 'start')     await handleSicboStart(interaction);
        else if (sub === 'stop') await handleSicboStop(interaction);
        else if (sub === 'autostart') await handleSicboAutostart(interaction);
        break;
      }
      case 'balance':     await handleBalance(interaction);     break;
      case 'daily':       await handleDaily(interaction);       break;
      case 'leaderboard': await handleLeaderboard(interaction); break;
      case 'stats':       await handleStats(interaction);       break;
      case 'give':        await handleGive(interaction);        break;
      case 'admin':       await handleAdmin(interaction);       break;
      case 'football':    await handleFootball(interaction);    break;
      default:
        await interaction.reply({ content: '❓ Lệnh không hợp lệ.', ephemeral: true });
    }
  } catch (err) {
    console.error(`Error handling command "${interaction.commandName}":`, err);
    const msg = { content: '❌ Có lỗi xảy ra. Vui lòng thử lại.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
});

// ── Prefix commands (! ) — chỉ admin mới dùng được ────────────────────────
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const adminId = process.env.ADMIN_ID || '885779352208437298';
  if (message.author.id !== adminId) return; // chặn người khác

  const { handlePrefixAdmin } = require('./commands/handlers');
  await handlePrefixAdmin(message);
});

client.on('error', (err) => console.error('Discord client error:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('SIGINT', () => { client.destroy(); process.exit(0); });
process.on('SIGTERM', () => { client.destroy(); process.exit(0); });

client.login(process.env.DISCORD_TOKEN);
