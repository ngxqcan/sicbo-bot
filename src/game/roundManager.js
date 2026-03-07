'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { rollDice, resolveBets, formatDice, formatRoundResult, BET_TYPES, BET_LABELS, PAYOUTS } = require('./engine');
const { getPlayer, adjustBalance, updateStats, recordBets } = require('../utils/database');

const ROUND_DURATION = parseInt(process.env.ROUND_DURATION || '30000');
const MIN_BET = parseInt(process.env.MIN_BET || '10');
const MAX_BET = parseInt(process.env.MAX_BET || '36000');

class RoundManager {
  constructor() {
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
    const totalBettors = new Set();

    for (const bet of Object.values(bets)) {
      const type = bet.betType;
      if (!betSummary[type]) betSummary[type] = { count: 0, total: 0 };
      betSummary[type].count++;
      betSummary[type].total += bet.amount;
      totalBettors.add(bet.userId);
    }

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🎲 Tài Xỉu — Đặt Cược!')
      .setDescription(
        `**Ván:** \`${roundId.slice(0, 8)}\`\n` +
        `**Thời gian còn lại:** ⏱️ ${Math.ceil(timeLeft / 1000)}s\n\n` +
        `Bấm nút bên dưới để chọn loại cược và nhập số tiền!`
      )
      .addFields(
        {
          name: '📋 Loại Cược & Tỉ Lệ',
          value: [
            `🔴 **Tài (Big)** — Tổng 11–17 · Thắng **1:1**`,
            `🔵 **Xỉu (Small)** — Tổng 4–10 · Thắng **1:1**`,
            `⭐ **Triple** — 3 xúc xắc giống nhau · Thắng **24:1**`,
            `⚠️ Ra Triple → Tài/Xỉu thua hết!`,
          ].join('\n'),
          inline: false,
        },
        {
          name: '📊 Cược Hiện Tại',
          value: Object.keys(betSummary).length === 0
            ? '*Chưa có ai cược — hãy là người đầu tiên!*'
            : Object.entries(betSummary).map(([type, info]) =>
              `${BET_LABELS[type]}: **${info.count}** người · 💰 ${info.total.toLocaleString()} coins`
            ).join('\n'),
          inline: false,
        }
      )
      .setFooter({ text: `Min: ${MIN_BET.toLocaleString()} | Max: ${MAX_BET.toLocaleString()} coins | ${totalBettors.size} người đang cược` })
      .setTimestamp();

    return embed;
  }

  buildButtons(disabled = false) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('betmodal_TAI')
        .setLabel('Tài (Big)')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔴')
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId('betmodal_XIU')
        .setLabel('Xỉu (Small)')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔵')
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId('betmodal_TRIPLE')
        .setLabel('Triple')
        .setStyle(ButtonStyle.Success)
        .setEmoji('⭐')
        .setDisabled(disabled),
    );
    return [row];
  }

  // Hiện modal nhập số tiền khi bấm nút
  async showBetModal(interaction, betType) {
    if (!this.rounds.has(interaction.channelId)) {
      return interaction.reply({ content: '❌ Không có ván nào đang chạy!', ephemeral: true });
    }

    const labelMap = { TAI: 'Tài (Big)', XIU: 'Xỉu (Small)', TRIPLE: 'Triple' };

    const modal = new ModalBuilder()
      .setCustomId(`betsubmit_${betType}`)
      .setTitle(`🎲 Đặt cược — ${labelMap[betType]}`);

    const input = new TextInputBuilder()
      .setCustomId('bet_amount')
      .setLabel(`Nhập số coins muốn cược (${MIN_BET.toLocaleString()}–${MAX_BET.toLocaleString()})`)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(`VD: 1000`)
      .setMinLength(1)
      .setMaxLength(6)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }

  async placeBet(interaction, betType, amount) {
    const channelId = interaction.channelId;
    const round = this.rounds.get(channelId);

    if (!round) {
      return interaction.reply({ content: '❌ Không có ván nào đang chạy!', ephemeral: true });
    }

    // Validate amount
    if (isNaN(amount) || amount < MIN_BET) {
      return interaction.reply({ content: `❌ Số tiền tối thiểu là **${MIN_BET.toLocaleString()}** coins!`, ephemeral: true });
    }
    if (amount > MAX_BET) {
      return interaction.reply({ content: `❌ Số tiền tối đa là **${MAX_BET.toLocaleString()}** coins!`, ephemeral: true });
    }

    const userId = interaction.user.id;
    const username = interaction.user.username;
    const player = getPlayer(userId, username);

    if (player.balance < amount) {
      return interaction.reply({
        content: `❌ Không đủ coins! Bạn có **${player.balance.toLocaleString()}** coins nhưng cược **${amount.toLocaleString()}**.`,
        ephemeral: true,
      });
    }

    const betKey = `${userId}_${betType}`;

    // Hoàn tiền cược cũ nếu có
    if (round.bets[betKey]) {
      adjustBalance(userId, round.bets[betKey].amount);
    }

    adjustBalance(userId, -amount);
    round.bets[betKey] = { userId, username, betType, amount };

    const newBalance = getPlayer(userId, username).balance;
    await interaction.reply({
      content: `✅ Đã cược! **${BET_LABELS[betType]}** — 💰 **${amount.toLocaleString()}** coins\n💳 Số dư còn lại: **${newBalance.toLocaleString()}** coins`,
      ephemeral: true,
    });
  }

  async startRound(channel, autoRestart = false) {
    if (this.rounds.has(channel.id)) {
      return { error: 'Đang có ván chạy trong kênh này rồi!' };
    }

    const roundId = require('crypto').randomUUID();
    const startTime = Date.now();
    const bets = {};

    const embed = this.buildBettingEmbed(roundId, ROUND_DURATION, bets);
    const buttons = this.buildButtons(false);

    let message;
    try {
      message = await channel.send({ embeds: [embed], components: buttons });
    } catch (err) {
      return { error: `Không gửi được tin nhắn: ${err.message}` };
    }

    // Cập nhật embed mỗi 5 giây
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

    const roundTimeout = setTimeout(async () => {
      clearInterval(updateInterval);
      await this.endRound(channel, autoRestart);
    }, ROUND_DURATION);

    round.roundTimeout = roundTimeout;
    return { success: true, roundId };
  }

  async endRound(channel, autoRestart = false) {
    const round = this.rounds.get(channel.id);
    if (!round) return;

    if (round.updateInterval) clearInterval(round.updateInterval);
    if (round.roundTimeout) clearTimeout(round.roundTimeout);
    this.rounds.delete(channel.id);

    const dice = rollDice();
    const betsArray = Object.values(round.bets);
    const { results, rollResult } = resolveBets(betsArray, dice);

    const winnerLines = [];
    const loserLines = [];
    const dbBets = [];

    for (const bet of betsArray) {
      const key = `${bet.userId}_${bet.betType}`;
      const res = results[key];

      if (res.won) {
        adjustBalance(bet.userId, res.payout);
        updateStats(bet.userId, res.payout - bet.amount, 0);
        winnerLines.push(`<@${bet.userId}> +**${(res.payout - bet.amount).toLocaleString()}** (${BET_LABELS[bet.betType]} · ${bet.amount.toLocaleString()})`);
      } else {
        updateStats(bet.userId, 0, bet.amount);
        loserLines.push(`<@${bet.userId}> -**${bet.amount.toLocaleString()}** (${BET_LABELS[bet.betType]})`);
      }

      dbBets.push({ userId: bet.userId, betType: bet.betType, amount: bet.amount });
    }

    if (dbBets.length > 0) {
      try {
        const dbResults = {};
        for (const bet of betsArray) {
          dbResults[bet.userId] = results[`${bet.userId}_${bet.betType}`];
        }
        recordBets(dbBets, round.roundId, dice, dbResults);
      } catch (e) { /* non-critical */ }
    }

    const resultEmbed = new EmbedBuilder()
      .setColor(rollResult.isTriple ? 0xFF00FF : rollResult.isTai ? 0xFF4444 : 0x4444FF)
      .setTitle('🎲 Kết Quả!')
      .setDescription(formatRoundResult(dice, rollResult))
      .addFields(
        {
          name: '🏆 Thắng',
          value: winnerLines.length > 0 ? winnerLines.join('\n') : '*Không có người thắng.*',
          inline: false,
        },
        {
          name: '💸 Thua',
          value: loserLines.length > 0 ? loserLines.join('\n') : '*Không có người thua.*',
          inline: false,
        }
      )
      .setFooter({ text: autoRestart ? 'Ván mới bắt đầu sau 5 giây...' : 'Dùng /sicbo start để chơi lại!' })
      .setTimestamp();

    try {
      await round.message.edit({
        embeds: [this.buildBettingEmbed(round.roundId, 0, round.bets)],
        components: this.buildButtons(true),
      });
    } catch { /* tin nhắn có thể đã bị xoá */ }

    await channel.send({ embeds: [resultEmbed] });

    if (autoRestart) {
      setTimeout(() => this.startRound(channel, true), 5000);
    }
  }
}

module.exports = new RoundManager();
