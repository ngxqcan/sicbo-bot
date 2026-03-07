'use strict';

require('dotenv').config();

const { Client, GatewayIntentBits, Events } = require('discord.js');
const roundManager = require('./game/roundManager');
const {
  handleSicboStart, handleSicboStop, handleSicboAutostart,
  handleBalance, handleDaily, handleLeaderboard, handleStats, handleGive, handleAdmin,
} = require('./commands/handlers');

// Validate required env vars
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

// ─── Ready ───────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🎲 Sic Bo Bot is ready! Serving ${client.guilds.cache.size} guild(s).`);
  client.user.setActivity('🎲 Sic Bo | /sicbo start');
});

// ─── Slash Commands ───────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {

  // ── Button Interactions (bets) ──────────────────────────────────────────
  if (interaction.isButton()) {
    const [prefix, betType, amountStr] = interaction.customId.split('_');
    if (prefix !== 'bet') return;

    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount <= 0) return;

    await roundManager.placeBet(interaction, betType, amount);
    return;
  }

  // ── Slash Commands ──────────────────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;

  try {
    switch (interaction.commandName) {
      case 'sicbo': {
        const sub = interaction.options.getSubcommand();
        if (sub === 'start') await handleSicboStart(interaction);
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
        await interaction.reply({ content: '❓ Unknown command.', ephemeral: true });
    }
  } catch (err) {
    console.error(`Error handling command "${interaction.commandName}":`, err);
    const msg = { content: '❌ An error occurred. Please try again.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
});

// ─── Error handling ───────────────────────────────────────────────────────────
client.on('error', (err) => console.error('Discord client error:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('SIGINT', () => { client.destroy(); process.exit(0); });
process.on('SIGTERM', () => { client.destroy(); process.exit(0); });

client.login(process.env.DISCORD_TOKEN);
