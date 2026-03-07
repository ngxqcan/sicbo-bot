'use strict';

require('dotenv').config();

const { REST, Routes } = require('discord.js');
const commands = require('./commands/definitions');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; // Optional: deploy to specific guild (instant) vs global (up to 1hr)

if (!token || !clientId) {
  console.error('❌ DISCORD_TOKEN and CLIENT_ID must be set in .env');
  process.exit(1);
}

const rest = new REST().setToken(token);

(async () => {
  try {
    console.log(`📤 Registering ${commands.length} slash command(s)...`);

    let data;
    if (guildId) {
      // Guild commands: instant update (great for testing)
      data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`✅ Registered ${data.length} guild command(s) to guild ${guildId}`);
    } else {
      // Global commands: up to 1 hour to propagate
      data = await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log(`✅ Registered ${data.length} global command(s)`);
    }
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
    process.exit(1);
  }
})();
