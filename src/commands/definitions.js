'use strict';

const { SlashCommandBuilder } = require('discord.js');

module.exports = [
  new SlashCommandBuilder()
    .setName('sicbo')
    .setDescription('Sic Bo dice game commands')
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('Start a new Sic Bo round in this channel')
    )
    .addSubcommand(sub =>
      sub.setName('stop')
        .setDescription('Stop the current round (admin only)')
    )
    .addSubcommand(sub =>
      sub.setName('autostart')
        .setDescription('Toggle auto-restart rounds in this channel (admin only)')
    ),

  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your coin balance'),

  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily coin reward'),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View top players by balance'),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View your game statistics'),

  new SlashCommandBuilder()
    .setName('give')
    .setDescription('Give coins to another player')
    .addUserOption(opt =>
      opt.setName('user').setDescription('The user to give coins to').setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('amount').setDescription('Amount to give').setRequired(true).setMinValue(1)
    ),

  // ── ADMIN COMMANDS — ẩn với người dùng thường, chỉ ai có quyền Administrator mới thấy ──
  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('🔐 Admin commands (restricted)')
    .setDefaultMemberPermissions(0)
    .addSubcommand(sub =>
      sub.setName('addcoins')
        .setDescription('Thêm coins cho người dùng')
        .addUserOption(opt =>
          opt.setName('user').setDescription('Người nhận coins').setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('amount').setDescription('Số coins muốn thêm').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub.setName('removecoins')
        .setDescription('Xoá coins của người dùng')
        .addUserOption(opt =>
          opt.setName('user').setDescription('Người bị trừ coins').setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('amount').setDescription('Số coins muốn xoá').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub.setName('setcoins')
        .setDescription('Đặt số coins cụ thể cho người dùng')
        .addUserOption(opt =>
          opt.setName('user').setDescription('Người dùng cần chỉnh').setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('amount').setDescription('Số coins mới').setRequired(true).setMinValue(0)
        )
    )
    .addSubcommand(sub =>
      sub.setName('resetbalance')
        .setDescription('Reset số dư về mức mặc định ban đầu')
        .addUserOption(opt =>
          opt.setName('user').setDescription('Người dùng cần reset').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('checkuser')
        .setDescription('Xem thông tin chi tiết của người dùng')
        .addUserOption(opt =>
          opt.setName('user').setDescription('Người dùng cần xem').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('resetdaily')
        .setDescription('Reset cooldown daily reward cho người dùng')
        .addUserOption(opt =>
          opt.setName('user').setDescription('Người dùng cần reset daily').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('setresult')
        .setDescription('🎲 Cài kết quả cho ván tiếp theo')
        .addStringOption(opt =>
          opt.setName('result')
            .setDescription('Kết quả muốn set')
            .setRequired(true)
            .addChoices(
              { name: '🔴 Tài (Big)', value: 'TAI' },
              { name: '🔵 Xỉu (Small)', value: 'XIU' },
              { name: '⭐ Triple', value: 'TRIPLE' },
              { name: '🎲 Ngẫu nhiên (bỏ can thiệp)', value: 'RANDOM' },
            )
        )
    ),
].map(cmd => cmd.toJSON());
