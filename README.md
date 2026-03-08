# 🎲 Đánh Bạc Làm Chó — Discord Bot

Bot cờ bạc Discord tích hợp **Tài Xỉu**, **cược bóng đá EPL**, và **ngân hàng tiết kiệm** với hệ thống tiền ảo (coins).

---

## 🚀 Cài Đặt

### Yêu Cầu
- **Node.js** v18+
- Discord Bot với các quyền: `Send Messages`, `Embed Links`, `Use Application Commands`, `Read Message History`
- **Message Content Intent** được bật (cho prefix commands của admin)

### Tạo Bot Discord
1. Vào [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application**
2. Vào tab **Bot** → **Reset Token** → copy token
3. Bật **Message Content Intent** trong phần Privileged Gateway Intents
4. Vào **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`, permissions `Send Messages`, `Embed Links`, `Read Message History`
5. Dùng URL được tạo để mời bot vào server

### Cấu Hình
```bash
cp .env.example .env
```

Sửa file `.env`:
```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
GUILD_ID=your_server_id          # Khuyên dùng — commands đăng ký ngay lập tức
ADMIN_ID=your_discord_user_id    # User ID của admin
FOOTBALL_API_KEY=your_api_key    # Lấy miễn phí tại football-data.org
```

### Chạy Bot
```bash
npm install
npm run register    # Đăng ký slash commands (chạy 1 lần hoặc khi thêm command mới)
npm start
```

---

## 🎮 Lệnh Người Dùng

### 🎲 Tài Xỉu
| Lệnh | Mô tả |
|------|-------|
| `/sicbo start` | Bắt đầu ván Tài Xỉu mới trong kênh hiện tại |
| `/sicbo stop` | Dừng ván đang chạy (cần quyền Manage Server) |
| `/sicbo autostart` | Bật/tắt tự động chạy ván liên tục (cần quyền Manage Server) |

**Luật chơi:**
- Mỗi ván kéo dài 30 giây, 3 xúc xắc được tung khi hết giờ
- Bấm nút **Tài / Xỉu / Triple** → nhập số tiền muốn cược
- Hỗ trợ gõ `max` để cược toàn bộ số dư, `min` để cược tối thiểu

| Kèo | Điều kiện | Tỉ lệ |
|-----|-----------|-------|
| 🔴 **Tài** | Tổng 3 xúc xắc 11–17 (không phải triple) | 1:1 |
| 🔵 **Xỉu** | Tổng 3 xúc xắc 4–10 (không phải triple) | 1:1 |
| ⭐ **Triple** | 3 xúc xắc giống nhau | 24:1 |

> ⚠️ Khi ra **Triple**, toàn bộ Tài/Xỉu thua hết.

---

### ⚽ Bóng Đá (EPL)
| Lệnh | Mô tả |
|------|-------|
| `/football matches` | Xem lịch thi đấu EPL 7 ngày tới, bấm nút để cược |
| `/football mybets` | Xem các cược bóng đá đang chờ kết quả |

**Cách cược:**
1. Dùng `/football matches` → hiện danh sách trận
2. Bấm **Trận X** → hiện kèo chi tiết (chỉ bạn thấy)
3. Chọn **Thắng Nhà / Hòa / Thắng Khách** → nhập số tiền

| Kèo | Tỉ lệ |
|-----|-------|
| 🏠 Thắng Nhà | x1.9 |
| 🤝 Hòa | x3.0 |
| ✈️ Thắng Khách | x1.9 |

Kết quả tự động được kiểm tra và settle mỗi **5 phút** sau khi trận kết thúc.

---

### 🏦 Ngân Hàng
| Lệnh | Mô tả |
|------|-------|
| `/bank balance` | Xem số dư ví, số dư bank, và tổng tài sản |
| `/bank deposit <số/max>` | Gửi coins vào ngân hàng |
| `/bank withdraw <số/max>` | Rút coins về ví |

- Tiền gửi trong bank sinh lãi **1%/giờ** tự động
- Lãi suất có thể tùy chỉnh qua biến môi trường

---

### 💰 Kinh Tế
| Lệnh | Mô tả |
|------|-------|
| `/balance` | Xem số dư ví hiện tại |
| `/daily` | Nhận thưởng hàng ngày (cooldown 24 giờ) |
| `/stats` | Xem thống kê cá nhân: win rate, tổng thắng/thua, net P&L |
| `/leaderboard` | Bảng xếp hạng top 10 người chơi theo số dư |
| `/give @user <số>` | Chuyển coins cho người khác |

---

## 🔐 Lệnh Admin

Admin được xác định bằng **User ID Discord** (`ADMIN_ID` trong `.env`).

### Slash Command
| Lệnh | Mô tả |
|------|-------|
| `/admin` | Hiện danh sách tất cả lệnh prefix admin |

### Prefix Commands (gõ trực tiếp trong chat)
| Lệnh | Mô tả |
|------|-------|
| `!addcoins @user <số>` | Thêm coins cho người dùng |
| `!removecoins @user <số>` | Trừ coins của người dùng |
| `!setcoins @user <số>` | Đặt số coins cụ thể |
| `!resetbalance @user` | Reset số dư về mặc định |
| `!checkuser @user` | Xem toàn bộ thông tin người dùng |
| `!resetdaily @user` | Reset daily reward để người dùng nhận lại ngay |
| `!setresult tai/xiu/triple/random` | Can thiệp kết quả ván Tài Xỉu tiếp theo |
| `!settle <matchId> <homeScore> <awayScore>` | Settle kết quả trận bóng đá thủ công |
| `!bankinfo @user` | Xem số dư bank của người dùng bất kỳ |

> Prefix commands không hiển thị trong autocomplete Discord — chỉ admin biết.

---

## ⚙️ Biến Môi Trường

```env
# ── Discord ──────────────────────────────────────────────
DISCORD_TOKEN=             # Token bot
CLIENT_ID=                 # Application ID
GUILD_ID=                  # Server ID (commands đăng ký ngay, khuyên dùng)
ADMIN_ID=                  # User ID của admin

# ── Football API ─────────────────────────────────────────
FOOTBALL_API_KEY=          # API key từ football-data.org (miễn phí)

# ── Game ─────────────────────────────────────────────────
ROUND_DURATION=30000       # Thời gian mỗi ván Tài Xỉu (ms)
STARTING_BALANCE=1000      # Coins ban đầu cho người chơi mới
DAILY_REWARD=500           # Phần thưởng daily
MIN_BET=10                 # Cược tối thiểu

# ── Bank ─────────────────────────────────────────────────
BANK_INTEREST_RATE=0.01    # Lãi suất mỗi giờ (0.01 = 1%)
BANK_INTEREST_CAP=0        # Lãi tối đa mỗi giờ (0 = không giới hạn)
BANK_MAX_SAVINGS=0         # Số tiền gửi tối đa (0 = không giới hạn)
```

---

## 📁 Cấu Trúc Project

```
sicbo-bot/
├── src/
│   ├── index.js                # Entry point, xử lý events
│   ├── deploy-commands.js      # Đăng ký slash commands
│   ├── commands/
│   │   ├── definitions.js      # Định nghĩa slash commands
│   │   └── handlers.js         # Logic xử lý commands
│   ├── game/
│   │   ├── engine.js           # Logic tung xúc xắc & tính kết quả
│   │   ├── roundManager.js     # Quản lý vòng đời ván Tài Xỉu
│   │   └── footballManager.js  # Quản lý cược bóng đá
│   └── utils/
│       ├── database.js         # SQLite: players, bets, bank, history
│       ├── footballApi.js      # Wrapper gọi football-data.org API
│       └── diceRenderer.js     # Render hình xúc xắc
├── data/
│   └── sicbo.db                # Database SQLite (tự tạo)
├── .env                        # Config (không commit)
├── .env.example                # Template config
└── package.json
```

---

## 🛡️ Phân Quyền

| Tính năng | Yêu cầu |
|-----------|---------|
| Tất cả lệnh người dùng | Mọi thành viên server |
| `/sicbo stop`, `/sicbo autostart` | Quyền **Manage Server** |
| `/admin` và prefix `!` commands | **ADMIN_ID** trong `.env` |
