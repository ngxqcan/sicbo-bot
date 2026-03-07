'use strict';

/**
 * Vẽ 3 xúc xắc bằng SVG thuần — không cần thư viện ngoài.
 * Trả về Buffer SVG để gắn vào Discord attachment.
 */

// Vị trí các chấm trên mặt xúc xắc (tỉ lệ 0-1)
const DOT_POSITIONS = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
  6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]],
};

// Màu xúc xắc theo vị trí (đỏ, cam, vàng)
const DICE_COLORS = [
  { base: '#c0392b', light: '#e74c3c', shine: '#ff6b6b' },
  { base: '#d35400', light: '#e67e22', shine: '#ffaa55' },
  { base: '#b7950b', light: '#d4ac0d', shine: '#f4d03f' },
];

function drawDiceSVG(values, isTriple = false) {
  const SIZE = 130;       // kích thước mỗi con xúc xắc
  const GAP = 28;         // khoảng cách giữa các con
  const PADDING = 40;
  const RADIUS = 22;      // bo góc
  const DOT_R = 10;       // bán kính chấm

  const TOTAL_W = PADDING * 2 + values.length * SIZE + (values.length - 1) * GAP;
  const TOTAL_H = SIZE + PADDING * 2;

  let defs = `
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="4" dy="6" stdDeviation="5" flood-color="rgba(0,0,0,0.5)"/>
    </filter>
    <filter id="dotshadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="1" dy="1" stdDeviation="1.5" flood-color="rgba(0,0,0,0.5)"/>
    </filter>
    <filter id="glow">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  `;

  // Gradient cho từng con xúc xắc
  values.forEach((_, i) => {
    const c = isTriple ? { base: '#6c3483', light: '#9b59b6', shine: '#c39bd3' } : DICE_COLORS[i];
    defs += `
      <linearGradient id="grad${i}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c.shine}"/>
        <stop offset="45%" stop-color="${c.light}"/>
        <stop offset="100%" stop-color="${c.base}"/>
      </linearGradient>
      <radialGradient id="shine${i}" cx="30%" cy="25%" r="55%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.45)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
      </radialGradient>
    `;
  });

  let diceSVG = '';
  values.forEach((val, i) => {
    const x = PADDING + i * (SIZE + GAP);
    const y = PADDING;

    // Bóng đổ
    diceSVG += `<rect x="${x + 7}" y="${y + 9}" width="${SIZE}" height="${SIZE}" rx="${RADIUS + 2}" ry="${RADIUS + 2}" fill="rgba(0,0,0,0.3)" filter="url(#shadow)"/>`;

    // Thân xúc xắc
    diceSVG += `<rect x="${x}" y="${y}" width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}" fill="url(#grad${i})" stroke="rgba(255,255,255,0.6)" stroke-width="2.5"/>`;

    // Lớp shine (ánh sáng góc trên trái)
    diceSVG += `<rect x="${x}" y="${y}" width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}" fill="url(#shine${i})"/>`;

    // Nếu triple → thêm viền phát sáng vàng
    if (isTriple) {
      diceSVG += `<rect x="${x - 3}" y="${y - 3}" width="${SIZE + 6}" height="${SIZE + 6}" rx="${RADIUS + 3}" ry="${RADIUS + 3}" fill="none" stroke="#f1c40f" stroke-width="3.5" filter="url(#glow)" opacity="0.9"/>`;
    }

    // Vẽ chấm
    DOT_POSITIONS[val].forEach(([dx, dy]) => {
      const cx = x + dx * SIZE;
      const cy = y + dy * SIZE;
      diceSVG += `
        <circle cx="${cx}" cy="${cy}" r="${DOT_R + 1}" fill="rgba(0,0,0,0.25)" filter="url(#dotshadow)"/>
        <circle cx="${cx}" cy="${cy}" r="${DOT_R}" fill="white"/>
        <circle cx="${cx - 2.5}" cy="${cy - 2.5}" r="${DOT_R * 0.38}" fill="rgba(255,255,255,0.6)"/>
      `;
    });

    // Số mặt nhỏ ở góc
    diceSVG += `<text x="${x + SIZE - 12}" y="${y + SIZE - 8}" font-family="Arial" font-size="16" font-weight="bold" fill="rgba(255,255,255,0.55)" text-anchor="middle">${val}</text>`;
  });

  // Nền tối bo góc
  const bgSVG = `<rect x="0" y="0" width="${TOTAL_W}" height="${TOTAL_H}" rx="20" ry="20" fill="#1a1a2e"/>`;

  // Đường viền gradient nền
  const borderSVG = `<rect x="1" y="1" width="${TOTAL_W - 2}" height="${TOTAL_H - 2}" rx="19" ry="19" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TOTAL_W}" height="${TOTAL_H}">
  <defs>${defs}</defs>
  ${bgSVG}
  ${borderSVG}
  ${diceSVG}
</svg>`;

  return Buffer.from(svg, 'utf-8');
}

module.exports = { drawDiceSVG };
