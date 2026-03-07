'use strict';

require('dotenv').config();

const { REST, Routes } = require('discord.js');
const commands = require('./commands/definitions');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  console.error('❌ DISCORD_TOKEN and CLIENT_ID must be set in .env');
  process.exit(1);
}

const rest = new REST().setToken(token);

(async () => {
  try {
    // Bước 1: Xoá sạch global commands cũ (tránh cache Discord)
    console.log('🗑️  Clearing old global commands...');
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    console.log('✅ Cleared global commands');

    // Bước 2: Nếu có GUILD_ID, xoá luôn guild commands cũ
    if (guildId) {
      console.log('🗑️  Clearing old guild commands...');
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
      console.log('✅ Cleared guild commands');
    }

    // Bước 3: Register lại commands mới
    console.log(`📤 Registering ${commands.length} slash command(s)...`);
    let data;
    if (guildId) {
      // Guild commands: cập nhật ngay lập tức (khuyên dùng khi test)
      data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`✅ Registered ${data.length} guild command(s) to guild ${guildId}`);
    } else {
      // Global commands: mất tối đa 1 tiếng để Discord propagate
      data = await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log(`✅ Registered ${data.length} global command(s)`);
      console.log('⏳ Lưu ý: Global commands mất tối đa 1 tiếng để hiển thị trên Discord.');
      console.log('💡 Tip: Thêm GUILD_ID vào .env để cập nhật ngay lập tức khi test.');
    }
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
    process.exit(1);
  }
})();
