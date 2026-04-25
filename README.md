# Mail Curl - 臨時郵箱 Worker

一個使用 Cloudflare Workers + D1 + KV 實現的臨時郵箱服務，支持 Cloudflare Email Routing (catch-all)。

# 注意:當前原碼已不再更新,請下載旁邊Releases的完整壓縮包

# 已有V2版本在: https://github.com/s12ryt/mail-curl-v2

## 功能

- `GET /` - 返回 "made by yoyo qwq"
- `POST /api/remail?key=密鑰` - 刷新/創建新郵箱
- `GET /api/inbox?key=密鑰&mailbox_id=xxx` - 查看收件箱
- `GET /api/mail?key=密鑰&id=郵件ID` - 查看郵件內容
- `GET /api/ls?key=密鑰` - 查看所有郵箱
- `GET /api/domains?key=密鑰` - 查看域名配置 (KV 列表 + 環境變量)
- `GET /api/now-root-domain?key=密鑰` - 查看當前 root-domain
- `POST /api/domains?key=密鑰` - 添加域名到 KV
- `DELETE /api/domains?key=密鑰` - 從 KV 移除域名

## ID 格式

- 郵箱ID: `xxxx-xx-xx-xxxx` (12位)
- 郵件ID: `xxxxxx-xxx-xxx-xxxxxx` (18位)
- 郵箱前綴: `{前綴}-{名詞}-{月日}-{3位隨機}` (如 alex-cloud-0824-a1b)

## 域名系統

域名獲取優先級：**KV 域名列表 > root-domain 環境變量 > domain 環境變量**

所有來源均**直接使用域名**，不生成子域名。多域名時自動輪詢 (round-robin) 分配。

例如配置 `domain=domain1.com,domain2.com` 時：
- 第一個郵箱: xxx@domain1.com
- 第二個郵箱: xxx@domain2.com
- 第三個郵箱: xxx@domain1.com
- ...以此類推

### KV 域名管理 API

通過 API 動態管理域名列表（存儲在 KV 中），優先級最高：

```bash
# 查看當前域名配置 (KV 列表 + 環境變量)
curl "https://your-worker.workers.dev/api/domains?key=YOUR_KEY"

# 添加域名 (合併去重)
curl -X POST "https://your-worker.workers.dev/api/domains?key=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domains": ["domain.top", "another.top"]}'

# 移除域名
curl -X DELETE "https://your-worker.workers.dev/api/domains?key=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domains": ["domain.top"]}'
```

## 部署

1. **創建 D1 數據庫**:
```bash
wrangler d1 create mail-curl-db
```

2. **創建 KV 命名空間** (用於域名管理):
```bash
wrangler kv namespace create DOMAINS
```

3. **創建數據表**:
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

4. **更新 wrangler.jsonc**:
```jsonc
{
  "d1_databases": [{
    "binding": "DB",
    "database_name": "mail-curl-db",
    "database_id": "你的數據庫ID"
  }],
  "kv_namespaces": [{
    "binding": "DOMAINS",
    "id": "你的KV命名空間ID"
  }]
}
```

5. **設置環境變量**:
```bash
wrangler secret put JWT_KEY
# 輸入你的訪問密鑰
```

6. **部署**:
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
# 刷新郵箱 (隨機詞彙 + 隨機月日)
curl -X POST "https://your-worker.workers.dev/api/remail?key=YOUR_KEY"

# 刷新郵箱 (指定詞彙)
curl -X POST "https://your-worker.workers.dev/api/remail?key=YOUR_KEY&word=cloud"

# 刷新郵箱 (指定月日)
curl -X POST "https://your-worker.workers.dev/api/remail?key=YOUR_KEY&birthday=0824"

# 刷新郵箱 (指定詞彙 + 月日)
curl -X POST "https://your-worker.workers.dev/api/remail?key=YOUR_KEY&word=cloud&birthday=0824"

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
| root-domain | 根域名 (如 domain.top)，直接使用。支持多域名逗號分隔。優先級低於 KV 域名列表 |
| domain | 郵箱後綴 (支持多域名，逗號分隔)。僅在 KV 和 root-domain 均未設置時使用 |
| MAIL_PREFIX | 郵箱前綴 (未設置時使用隨機人名，如 alex-cloud-0824-a1b) |
