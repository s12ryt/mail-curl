# Mail Curl - 臨時郵箱 Worker

一個使用 Cloudflare Workers + D1 實現的臨時郵箱服務，支持 Cloudflare Email Routing (catch-all)。

# 注意:當前原碼已不再更新,請下載旁邊Releases的完整壓縮包



## 功能

- `GET /` - 返回 "made by yoyo qwq"
- `POST /api/remail?key=密鑰` - 刷新/創建新郵箱
- `GET /api/inbox?key=密鑰&mailbox_id=xxx` - 查看收件箱
- `GET /api/mail?key=密鑰&id=郵件ID` - 查看郵件內容
- `GET /api/ls?key=密鑰` - 查看所有郵箱

## ID 格式

- 郵箱ID: `xxxx-xx-xx-xxxx` (12位)
- 郵件ID: `xxxxxx-xxx-xxx-xxxxxx` (18位)
- 郵箱前綴: `yoyomail-xxxxxxxxxx`

## 部署

1. **創建 D1 數據庫**:
```bash
wrangler d1 create mail-curl-db
```

2. **創建數據表**:
```sql
CREATE TABLE IF NOT EXISTS mailboxes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  prefix TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS mails (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY(mailbox_id) REFERENCES mailboxes(id)
);
```

3. **更新 wrangler.jsonc**:
```json
{
  "d1_databases": [{
    "binding": "DB",
    "database_name": "mail-curl-db",
    "database_id": "你的數據庫ID"
  }]
}
```

4. **設置環境變量**:
```bash
wrangler secret put JWT_KEY
# 輸入你的訪問密鑰
```

5. **部署**:
```bash
npm run deploy
```

## Email Routing 設置

1. 進入 Cloudflare Dashboard → 你的域名
2. 點擊 Email Routing → Rules
3. 創建 Catch-all 規則：
   - 當: `All emails`
   - 動作: `Send to Worker`
   - 選擇: `mail-curl`

## 使用示例

```bash
# 刷新郵箱
curl -X POST "https://your-worker.workers.dev/api/remail?key=YOUR_KEY"

# 查看所有郵箱
curl "https://your-worker.workers.dev/api/ls?key=YOUR_KEY"

# 查看收件箱
curl "https://your-worker.workers.dev/api/inbox?key=YOUR_KEY&mailbox_id=xxxx-xx-xx-xxxx"

# 查看郵件
curl "https://your-worker.workers.dev/api/mail?key=YOUR_KEY&id=xxxxxx-xxx-xxx-xxxxxx"
```

## 環境變量

| 變量 | 說明 |
|------|------|
| JWT_KEY | 訪問密鑰 |
| domain | 郵箱後綴 (默認 domain.com) |
