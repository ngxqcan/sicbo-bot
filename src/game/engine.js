'use strict';

// Dice emoji for visual display
const DICE_EMOJI = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const BET_TYPES = { TAI: 'TAI', XIU: 'XIU', TRIPLE: 'TRIPLE' };
const BET_LABELS = { TAI: '🔴 Tài (Big)', XIU: '🔵 Xỉu (Small)', TRIPLE: '⭐ Any Triple' };

const PAYOUTS = {
  TAI: () => parseInt(process.env.PAYOUT_TAI || '2'),
  XIU: () => parseInt(process.env.PAYOUT_XIU || '2'),
  TRIPLE: () => parseInt(process.env.PAYOUT_TRIPLE || '25'),
};

function rollDice() {
  return [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
  ];
}

function evaluateRoll(dice) {
  const [d1, d2, d3] = dice;
  const total = d1 + d2 + d3;
  const isTriple = d1 === d2 && d2 === d3;

  // Triples are neither Tai nor Xiu (house wins)
  const isTai = !isTriple && total >= 11;  // 11-17
  const isXiu = !isTriple && total <= 10;  // 4-10

  return { total, isTriple, isTai, isXiu };
}

function resolveBets(bets, dice) {
  const result = evaluateRoll(dice);
  const results = {};

  for (const bet of bets) {
    let won = false;
    let payout = 0;

    if (bet.betType === BET_TYPES.TAI && result.isTai) {
      won = true;
      payout = bet.amount * PAYOUTS.TAI();
    } else if (bet.betType === BET_TYPES.XIU && result.isXiu) {
      won = true;
      payout = bet.amount * PAYOUTS.XIU();
    } else if (bet.betType === BET_TYPES.TRIPLE && result.isTriple) {
      won = true;
      payout = bet.amount * PAYOUTS.TRIPLE();
    }

    results[`${bet.userId}_${bet.betType}`] = { won, payout, net: won ? payout - bet.amount : -bet.amount };
  }

  return { results, rollResult: result };
}

function formatDice(dice) {
  return dice.map(d => DICE_EMOJI[d]).join(' ');
}

function formatRoundResult(dice, rollResult) {
  const lines = [
    `**Dice:** ${formatDice(dice)}  (**${rollResult.total}**)`,
    '',
  ];

  if (rollResult.isTriple) {
    lines.push(`🎲 **TRIPLE ${DICE_EMOJI[dice[0]]}${DICE_EMOJI[dice[0]]}${DICE_EMOJI[dice[0]]}!** House takes all Tài/Xỉu bets!`);
  } else if (rollResult.isTai) {
    lines.push(`🔴 **TÀI (BIG)** — Total ${rollResult.total} ≥ 11`);
  } else {
    lines.push(`🔵 **XỈU (SMALL)** — Total ${rollResult.total} ≤ 10`);
  }

  return lines.join('\n');
}

module.exports = {
  BET_TYPES,
  BET_LABELS,
  PAYOUTS,
  rollDice,
  evaluateRoll,
  resolveBets,
  formatDice,
  formatRoundResult,
  DICE_EMOJI,
};
