'use strict';

require('dotenv').config();

const { Client, GatewayIntentBits, Events } = require('discord.js');
const roundManager = require('./game/roundManager');
const {
  handleSicboStart, handleSicboStop, handleSicboAutostart,
  handleBalance, handleDaily, handleLeaderboard, handleStats, handleGive, handleAdmin,
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
  ],
});

client.once(Events.ClientReady, () => {
  roundManager.setClient(client); // truyền client để lấy avatar bot
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🎲 Sic Bo Bot is ready! Serving ${client.guilds.cache.size} guild(s).`);
  client.user.setActivity('🎲 Tài Xỉu | /sicbo start');
});

client.on(Events.InteractionCreate, async (interaction) => {

  // ── Nút bấm → hiện modal nhập tiền ─────────────────────────────────────
  if (interaction.isButton()) {
    const parts = interaction.customId.split('_');
    if (parts[0] !== 'betmodal') return;
    const betType = parts[1]; // TAI | XIU | TRIPLE
    await roundManager.showBetModal(interaction, betType);
    return;
  }

  // ── Modal submit → đặt cược ─────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    const parts = interaction.customId.split('_');
    if (parts[0] !== 'betsubmit') return;
    const betType = parts[1];
    const raw = interaction.fields.getTextInputValue('bet_amount').replace(/[,. ]/g, '');
    const amount = parseInt(raw);
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

client.on('error', (err) => console.error('Discord client error:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('SIGINT', () => { client.destroy(); process.exit(0); });
process.on('SIGTERM', () => { client.destroy(); process.exit(0); });

client.login(process.env.DISCORD_TOKEN);
