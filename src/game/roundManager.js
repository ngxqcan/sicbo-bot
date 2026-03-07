'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { rollDice, resolveBets, formatDice, formatRoundResult, BET_TYPES, BET_LABELS, PAYOUTS } = require('./engine');
const { getPlayer, adjustBalance, updateStats, recordBets } = require('../utils/database');
const { v4: uuidv4 } = require('crypto').webcrypto ? { v4: () => require('crypto').randomUUID() } : { v4: () => require('crypto').randomUUID() };

const ROUND_DURATION = parseInt(process.env.ROUND_DURATION || '30000');
const MIN_BET = parseInt(process.env.MIN_BET || '10');
const MAX_BET = parseInt(process.env.MAX_BET || '5000');

class RoundManager {
  constructor() {
    // channelId -> round state
    this.rounds = new Map();
  }

  isActive(channelId) {
    return this.rounds.has(channelId);
  }

  getRound(channelId) {
    return this.rounds.get(channelId);
  }

  buildBettingEmbed(roundId, timeLeft, bets) {
    const betSummary = {};
    let totalBettors = new Set();

    for (const [key, bet] of Object.entries(bets)) {
      const type = bet.betType;
      if (!betSummary[type]) betSummary[type] = { count: 0, total: 0 };
      betSummary[type].count++;
      betSummary[type].total += bet.amount;
      totalBettors.add(bet.userId);
    }

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🎲 Sic Bo — Place Your Bets!')
      .setDescription(
        `**Round:** \`${roundId.slice(0, 8)}\`\n` +
        `**Time Remaining:** ⏱️ ${Math.ceil(timeLeft / 1000)}s\n\n` +
        `Click a button below to place your bet!`
      )
      .addFields(
        {
          name: '📋 Bet Types & Payouts',
          value: [
            `🔴 **Tài (Big)** — Total 11–17 · Pays **1:1**`,
            `🔵 **Xỉu (Small)** — Total 4–10 · Pays **1:1**`,
            `⭐ **Any Triple** — All dice same · Pays **24:1**`,
            `⚠️ Triples → House wins all Tài/Xỉu bets!`,
          ].join('\n'),
          inline: false,
        },
        {
          name: '📊 Current Bets',
          value: Object.keys(BET_TYPES).length === 0 || Object.keys(betSummary).length === 0
            ? '*No bets yet — be the first!*'
            : Object.entries(betSummary).map(([type, info]) =>
              `${BET_LABELS[type]}: **${info.count}** bet(s) · 💰 ${info.total.toLocaleString()} coins`
            ).join('\n'),
          inline: false,
        }
      )
      .setFooter({ text: `Min bet: ${MIN_BET} | Max bet: ${MAX_BET} | ${totalBettors.size} player(s) betting` })
      .setTimestamp();

    return embed;
  }

  buildButtons(disabled = false) {
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('bet_TAI_10')
        .setLabel('Tài · 10')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔴')
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId('bet_TAI_50')
        .setLabel('Tài · 50')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔴')
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId('bet_TAI_200')
        .setLabel('Tài · 200')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔴')
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId('bet_TAI_500')
        .setLabel('Tài · 500')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔴')
        .setDisabled(disabled),
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('bet_XIU_10')
        .setLabel('Xỉu · 10')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔵')
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId('bet_XIU_50')
        .setLabel('Xỉu · 50')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔵')
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId('bet_XIU_200')
        .setLabel('Xỉu · 200')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔵')
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId('bet_XIU_500')
        .setLabel('Xỉu · 500')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔵')
        .setDisabled(disabled),
    );

    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('bet_TRIPLE_10')
        .setLabel('Triple · 10')
        .setStyle(ButtonStyle.Success)
        .setEmoji('⭐')
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId('bet_TRIPLE_50')
        .setLabel('Triple · 50')
        .setStyle(ButtonStyle.Success)
        .setEmoji('⭐')
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId('bet_TRIPLE_200')
        .setLabel('Triple · 200')
        .setStyle(ButtonStyle.Success)
        .setEmoji('⭐')
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId('bet_TRIPLE_500')
        .setLabel('Triple · 500')
        .setStyle(ButtonStyle.Success)
        .setEmoji('⭐')
        .setDisabled(disabled),
    );

    return [row1, row2, row3];
  }

  async startRound(channel, autoRestart = false) {
    if (this.rounds.has(channel.id)) {
      return { error: 'A round is already active in this channel!' };
    }

    const roundId = require('crypto').randomUUID();
    const startTime = Date.now();
    const bets = {}; // key: `${userId}_${betType}` -> bet object

    const embed = this.buildBettingEmbed(roundId, ROUND_DURATION, bets);
    const buttons = this.buildButtons(false);

    let message;
    try {
      message = await channel.send({ embeds: [embed], components: buttons });
    } catch (err) {
      return { error: `Failed to send message: ${err.message}` };
    }

    // Update embed every 5 seconds
    const updateInterval = setInterval(async () => {
      const round = this.rounds.get(channel.id);
      if (!round) { clearInterval(updateInterval); return; }
      const timeLeft = ROUND_DURATION - (Date.now() - startTime);
      if (timeLeft <= 0) { clearInterval(updateInterval); return; }
      try {
        const updatedEmbed = this.buildBettingEmbed(roundId, timeLeft, round.bets);
        await message.edit({ embeds: [updatedEmbed], components: this.buildButtons(false) });
      } catch { clearInterval(updateInterval); }
    }, 5000);

    const round = { roundId, startTime, bets, message, channelId: channel.id, updateInterval };
    this.rounds.set(channel.id, round);

    // End round after ROUND_DURATION
    const roundTimeout = setTimeout(async () => {
      clearInterval(updateInterval);
      await this.endRound(channel, autoRestart);
    }, ROUND_DURATION);

    round.roundTimeout = roundTimeout;
    return { success: true, roundId };
  }

  async placeBet(interaction, betType, amount) {
    const channelId = interaction.channelId;
    const round = this.rounds.get(channelId);

    if (!round) {
      return interaction.reply({ content: '❌ No active round in this channel. Use `/sicbo start` to begin!', ephemeral: true });
    }

    const userId = interaction.user.id;
    const username = interaction.user.username;
    const player = getPlayer(userId, username);

    if (player.balance < amount) {
      return interaction.reply({
        content: `❌ Insufficient funds! You have **${player.balance.toLocaleString()}** coins but tried to bet **${amount.toLocaleString()}**.`,
        ephemeral: true,
      });
    }

    const betKey = `${userId}_${betType}`;

    // If player already has a bet of this type, refund it first
    if (round.bets[betKey]) {
      const oldBet = round.bets[betKey];
      adjustBalance(userId, oldBet.amount); // refund
    }

    // Deduct bet
    adjustBalance(userId, -amount);
    round.bets[betKey] = { userId, username, betType, amount };

    const newBalance = getPlayer(userId, username).balance;
    await interaction.reply({
      content: `✅ Bet placed! **${BET_LABELS[betType]}** — 💰 **${amount.toLocaleString()}** coins\n💳 Remaining balance: **${newBalance.toLocaleString()}** coins`,
      ephemeral: true,
    });
  }

  async endRound(channel, autoRestart = false) {
    const round = this.rounds.get(channel.id);
    if (!round) return;

    // Clean up
    if (round.updateInterval) clearInterval(round.updateInterval);
    if (round.roundTimeout) clearTimeout(round.roundTimeout);
    this.rounds.delete(channel.id);

    const dice = rollDice();
    const betsArray = Object.values(round.bets);
    const { results, rollResult } = resolveBets(betsArray, dice);

    // Process payouts
    const winnerLines = [];
    const loserLines = [];
    const dbBets = [];

    for (const bet of betsArray) {
      const key = `${bet.userId}_${bet.betType}`;
      const res = results[key];

      if (res.won) {
        adjustBalance(bet.userId, res.payout);
        updateStats(bet.userId, res.payout - bet.amount, 0);
        winnerLines.push(`<@${bet.userId}> +**${(res.payout - bet.amount).toLocaleString()}** (${BET_LABELS[bet.betType]} · ${bet.amount})`);
      } else {
        updateStats(bet.userId, 0, bet.amount);
        loserLines.push(`<@${bet.userId}> -**${bet.amount.toLocaleString()}** (${BET_LABELS[bet.betType]})`);
      }

      dbBets.push({ userId: bet.userId, betType: bet.betType, amount: bet.amount });
    }

    // Save to DB
    if (dbBets.length > 0) {
      try {
        const dbResults = {};
        for (const bet of betsArray) {
          const key = `${bet.userId}_${bet.betType}`;
          dbResults[bet.userId] = results[key];
        }
        recordBets(dbBets, round.roundId, dice, dbResults);
      } catch (e) { /* non-critical */ }
    }

    // Build result embed
    const resultEmbed = new EmbedBuilder()
      .setColor(rollResult.isTriple ? 0xFF00FF : rollResult.isTai ? 0xFF4444 : 0x4444FF)
      .setTitle('🎲 Round Results!')
      .setDescription(formatRoundResult(dice, rollResult))
      .addFields(
        {
          name: '🏆 Winners',
          value: winnerLines.length > 0 ? winnerLines.join('\n') : '*No winners this round.*',
          inline: false,
        },
        {
          name: '💸 Losers',
          value: loserLines.length > 0 ? loserLines.join('\n') : '*No losses this round.*',
          inline: false,
        }
      )
      .setFooter({ text: autoRestart ? 'Next round starting in 5 seconds...' : 'Use /sicbo start to play again!' })
      .setTimestamp();

    // Disable buttons on the betting message
    try {
      await round.message.edit({
        embeds: [this.buildBettingEmbed(round.roundId, 0, round.bets)],
        components: this.buildButtons(true),
      });
    } catch { /* message may have been deleted */ }

    await channel.send({ embeds: [resultEmbed] });

    // Auto-restart
    if (autoRestart) {
      setTimeout(() => this.startRound(channel, true), 5000);
    }
  }
}

module.exports = new RoundManager();
