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

  // /admin — chỉ hiện danh sách lệnh prefix, ẩn với người thường
  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('🔐 Xem danh sách lệnh admin')
    .setDefaultMemberPermissions(0),
].map(cmd => cmd.toJSON());