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

  // /admin — quản lý người dùng, ẩn với người thường
  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('🔐 Lệnh quản trị (chỉ dành cho admin)')
    .setDefaultMemberPermissions(0)
    .addSubcommand(sub =>
      sub.setName('addcoins')
        .setDescription('Thêm coins cho người dùng')
        .addUserOption(opt => opt.setName('user').setDescription('Người dùng').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Số coins cần thêm').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sub =>
      sub.setName('removecoins')
        .setDescription('Xoá coins của người dùng')
        .addUserOption(opt => opt.setName('user').setDescription('Người dùng').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Số coins cần xoá').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sub =>
      sub.setName('setcoins')
        .setDescription('Đặt số coins cho người dùng')
        .addUserOption(opt => opt.setName('user').setDescription('Người dùng').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Số coins mới').setRequired(true).setMinValue(0))
    )
    .addSubcommand(sub =>
      sub.setName('resetbalance')
        .setDescription('Reset số dư về mặc định')
        .addUserOption(opt => opt.setName('user').setDescription('Người dùng').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('checkuser')
        .setDescription('Xem thông tin chi tiết người dùng')
        .addUserOption(opt => opt.setName('user').setDescription('Người dùng').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('resetdaily')
        .setDescription('Reset daily reward để người dùng nhận lại ngay')
        .addUserOption(opt => opt.setName('user').setDescription('Người dùng').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('setresult')
        .setDescription('Can thiệp kết quả ván tiếp theo')
        .addStringOption(opt =>
          opt.setName('result')
            .setDescription('Kết quả muốn đặt')
            .setRequired(true)
            .addChoices(
              { name: '🔴 Tài', value: 'TAI' },
              { name: '🔵 Xỉu', value: 'XIU' },
              { name: '⭐ Triple', value: 'TRIPLE' },
              { name: '🎲 Ngẫu nhiên (bỏ can thiệp)', value: 'RANDOM' },
            )
        )
    ),
].map(cmd => cmd.toJSON());