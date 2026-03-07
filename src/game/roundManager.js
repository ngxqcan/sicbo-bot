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
    this.client = null; // set từ index.js sau khi bot ready
    this.forceResult = null; // null = random, 'TAI'/'XIU'/'TRIPLE' = can thiệp
  }

  setClient(client) {
    this.client = client;
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
    }, 1000);

    const round = { roundId, startTime, bets, message, channelId: channel.id, updateInterval };
    this.rounds.set(channel.id, round);

    const roundTimeout = setTimeout(async () => {
      clearInterval(updateInterval);
      await this.endRound(channel, autoRestart);
    }, ROUND_DURATION);

    round.roundTimeout = roundTimeout;
    return { success: true, roundId };
  }

  _getForcedDice(type) {
    if (type === 'TAI') {
      // Tổng >= 11, không phải triple
      const options = [[3,4,5],[4,4,4],[2,5,6],[4,5,6],[5,5,5],[3,5,6],[4,4,6],[5,6,6]];
      // Lấy kết quả Tài thật sự (không triple)
      const taiOptions = [[2,4,5],[3,4,5],[2,5,6],[4,5,6],[3,5,6],[4,4,6],[3,4,6],[2,5,5],[1,5,6],[2,4,6],[1,4,6],[3,3,6],[2,3,6],[1,3,6],[4,4,5],[3,4,4],[2,4,4],[1,5,5],[2,5,4],[3,5,4]].filter(d => {
        const t = d[0]+d[1]+d[2]; return t >= 11 && !(d[0]===d[1]&&d[1]===d[2]);
      });
      // Sinh ngẫu nhiên tổng Tài
      let d;
      do { d = [Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1]; }
      while (!(d[0]+d[1]+d[2] >= 11 && !(d[0]===d[1]&&d[1]===d[2])));
      return d;
    }
    if (type === 'XIU') {
      let d;
      do { d = [Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1]; }
      while (!(d[0]+d[1]+d[2] <= 10 && !(d[0]===d[1]&&d[1]===d[2])));
      return d;
    }
    if (type === 'TRIPLE') {
      const v = Math.floor(Math.random()*6)+1;
      return [v, v, v];
    }
    return rollDice();
  }

  async endRound(channel, autoRestart = false) {
    const round = this.rounds.get(channel.id);
    if (!round) return;

    if (round.updateInterval) clearInterval(round.updateInterval);
    if (round.roundTimeout) clearTimeout(round.roundTimeout);
    this.rounds.delete(channel.id);

    // Tung xúc xắc — có thể bị can thiệp bởi admin
    let dice;
    if (this.forceResult) {
      dice = this._getForcedDice(this.forceResult);
      this.forceResult = null; // dùng 1 lần rồi reset
    } else {
      dice = rollDice();
    }
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

    // Màu embed theo kết quả
    const embedColor = rollResult.isTriple ? 0xAA00FF : rollResult.isTai ? 0xFF3333 : 0x3399FF;

    // Tiêu đề kết quả
    let resultTitle = '';
    let resultDesc = '';
    if (rollResult.isTriple) {
      resultTitle = `⭐ TRIPLE ${dice[0]}-${dice[0]}-${dice[0]}! ⭐`;
      resultDesc = `✨ Ba xúc xắc giống nhau! Tất cả Tài/Xỉu đều thua!
**Tổng: ${rollResult.total}**`;
    } else if (rollResult.isTai) {
      resultTitle = `🔴 TÀI (BIG) — Tổng ${rollResult.total}`;
      resultDesc = `Tổng **${rollResult.total}** ≥ 11 → **TÀI thắng!**`;
    } else {
      resultTitle = `🔵 XỈU (SMALL) — Tổng ${rollResult.total}`;
      resultDesc = `Tổng **${rollResult.total}** ≤ 10 → **XỈU thắng!**`;
    }

    const resultEmbed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(`🎲 ${resultTitle}`)
      .setDescription(resultDesc)
      .setThumbnail(this.client?.user?.displayAvatarURL() ?? null)
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
