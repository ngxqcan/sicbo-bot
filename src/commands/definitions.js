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

  // /admin — chỉ hiển thị hướng dẫn dùng prefix commands, ẩn với người thường
  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('🔐 Admin panel')
    .setDefaultMemberPermissions(0),

  // /football — cược bóng đá EPL
  new SlashCommandBuilder()
    .setName('football')
    .setDescription('⚽ Cược bóng đá Premier League')
    .addSubcommand(sub =>
      sub.setName('matches')
        .setDescription('Xem các trận EPL sắp diễn ra và mở cược')
    )
    .addSubcommand(sub =>
      sub.setName('mybets')
        .setDescription('Xem các cược bóng đá của bạn đang chờ kết quả')
    ),
].map(cmd => cmd.toJSON());