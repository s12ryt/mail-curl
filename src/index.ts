/**
 * 臨時郵箱 Worker - 使用 Cloudflare D1 存儲
 * 支持 Cloudflare Email Routing (catch-all)
 * 
 * 環境變量:
 *   - JWT_KEY: 訪問密鑰
 *   - domain: 郵箱後綴 (默認 domain.com)
 */
import PostalMime from "postal-mime";

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;
		const method = request.method;

		// 根目錄
		if (path === "/") {
			return new Response("made by yoyo qwq", { status: 200 });
		}

		// API 路由
		if (path.startsWith("/api/")) {
			// 檢查 JWT_KEY
			const authHeader = request.headers.get("Authorization");
			const providedKey = authHeader?.replace("Bearer ", "") || url.searchParams.get("key");

			if (!providedKey) {
				return new Response(JSON.stringify({ error: "Missing key" }), {
					status: 401,
					headers: { "Content-Type": "application/json" }
				});
			}

			if (providedKey !== env.JWT_KEY) {
				return new Response(JSON.stringify({ error: "Invalid key" }), {
					status: 403,
					headers: { "Content-Type": "application/json" }
				});
			}

			// /api/remail - 刷新郵箱
			if (path === "/api/remail" && method === "POST") {
				return await handleRemail(env, url.searchParams.get("domain") || env.domain);
			}

			// /api/inbox - 查看收件箱
			if (path === "/api/inbox" && method === "GET") {
				const mailboxId = url.searchParams.get("mailbox_id");
				if (!mailboxId) {
					return new Response(JSON.stringify({ error: "Missing mailbox_id" }), {
						status: 400,
						headers: { "Content-Type": "application/json" }
					});
				}
				return await handleInbox(env, mailboxId);
			}

			// /api/mail - 查看郵件內容
			if (path === "/api/mail" && method === "GET") {
				const mailId = url.searchParams.get("id");
				if (!mailId) {
					return new Response(JSON.stringify({ error: "Missing mail id" }), {
						status: 400,
						headers: { "Content-Type": "application/json" }
					});
				}
				return await handleGetMail(env, mailId);
			}

			// /api/ls - 查看所有郵箱
			if (path === "/api/ls" && method === "GET") {
				return await handleListMailboxes(env);
			}
		}

		return new Response("Not Found", { status: 404 });
	},

	/**
	 * 處理收到的郵件 (Cloudflare Email Routing)
	 */
	async email(message: EmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
		await handleIncomingEmail(message, env);
	},
} satisfies ExportedHandler<Env>;

interface Env {
	DB: D1Database;
	JWT_KEY: string;
	domain: string;
}

/**
 * 生成隨機 ID
 */
function generateMailboxId(): string {
	const chars = "0123456789abcdef";
	const generatePart = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
	return `${generatePart(4)}-${generatePart(2)}-${generatePart(2)}-${generatePart(4)}`;
}

function generateMailId(): string {
	const chars = "0123456789abcdef";
	const generatePart = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
	return `${generatePart(6)}-${generatePart(3)}-${generatePart(3)}-${generatePart(6)}`;
}

function generatePrefix(): string {
	const chars = "0123456789abcdef";
	const generatePart = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
	return `yoyomail-${generatePart(10)}`;
}

/**
 * 處理 /api/remail - 刷新郵箱
 */
async function handleRemail(env: Env, domain: string): Promise<Response> {
	const prefix = generatePrefix();
	const email = `${prefix}@${domain}`;
	const mailboxId = generateMailboxId();

	try {
		await env.DB.prepare(
			"INSERT INTO mailboxes (id, email, prefix) VALUES (?, ?, ?)"
		).bind(mailboxId, email, prefix).run();

		return new Response(JSON.stringify({
			email: email,
			id: mailboxId
		}), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	} catch (e: any) {
		return new Response(JSON.stringify({ error: e.message }), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		});
	}
}

/**
 * 處理 /api/inbox - 查看收件箱
 */
async function handleInbox(env: Env, mailboxId: string): Promise<Response> {
	try {
		const mailbox = await env.DB.prepare(
			"SELECT id FROM mailboxes WHERE id = ?"
		).bind(mailboxId).first();

		if (!mailbox) {
			return new Response(JSON.stringify({ error: "Mailbox not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" }
			});
		}

		const mails = await env.DB.prepare(
			"SELECT sender_name, id FROM mails WHERE mailbox_id = ? ORDER BY created_at DESC"
		).bind(mailboxId).all();

		const result = (mails.results || []).map((mail: any) => ({
			sender_name: mail.sender_name,
			mail_id: mail.id
		}));

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	} catch (e: any) {
		return new Response(JSON.stringify({ error: e.message }), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		});
	}
}

/**
 * 處理 /api/mail - 查看郵件內容
 */
async function handleGetMail(env: Env, mailId: string): Promise<Response> {
	try {
		const mail = await env.DB.prepare(
			"SELECT * FROM mails WHERE id = ?"
		).bind(mailId).first();

		if (!mail) {
			return new Response(JSON.stringify({ error: "Mail not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" }
			});
		}

		return new Response(JSON.stringify({
			id: mail.id,
			mailbox_id: mail.mailbox_id,
			sender_name: mail.sender_name,
			content: mail.content,
			created_at: mail.created_at
		}), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	} catch (e: any) {
		return new Response(JSON.stringify({ error: e.message }), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		});
	}
}

/**
 * 處理 /api/ls - 查看所有郵箱
 */
async function handleListMailboxes(env: Env): Promise<Response> {
	try {
		const mailboxes = await env.DB.prepare(
			"SELECT email, id FROM mailboxes ORDER BY created_at DESC"
		).all();

		const result = (mailboxes.results || []).map((mb: any) => ({
			email: mb.email,
			id: mb.id
		}));

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	} catch (e: any) {
		return new Response(JSON.stringify({ error: e.message }), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		});
	}
}

/**
 * 處理收到的郵件 (Cloudflare Email Routing)
 */
async function handleIncomingEmail(message: EmailMessage, env: Env): Promise<void> {
	try {
		const msg = message as any;
		const headers = msg.headers;
		const fromAddress = headers?.get?.("from") || msg.from || "unknown";
		const toAddress = headers?.get?.("to") || msg.to || "unknown";
		
		const atIndex = toAddress.indexOf("@");
		const prefix = atIndex > 0 ? toAddress.substring(0, atIndex) : "";
		
		let textContent = "";
		let htmlContent = "";
		let subject = "";
		
		try {
			const rawStream = msg.raw;
			if (rawStream) {
				const reader = rawStream.getReader();
				const chunks: Uint8Array[] = [];
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					chunks.push(value);
				}
				const rawBytes = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
				let offset = 0;
				for (const chunk of chunks) {
					rawBytes.set(chunk, offset);
					offset += chunk.length;
				}
				const rawText = new TextDecoder().decode(rawBytes);
				
				const parser = PostalMime;
				const parsed = await parser.parse(rawText);
				
				subject = parsed.subject || "";
				textContent = parsed.text || "";
				htmlContent = parsed.html || "";
			}
		} catch (e: any) {
			console.error("Error parsing email:", e.message);
		}
		
		const mailContent = JSON.stringify({
			subject: subject,
			text: textContent,
			html: htmlContent
		});
		
		console.log(`Processing email: ${fromAddress} -> ${toAddress}`);
		
		let mailbox = await env.DB.prepare(
			"SELECT id FROM mailboxes WHERE prefix = ? OR email = ?"
		).bind(prefix, toAddress).first();

		if (!mailbox) {
			const newMailboxId = generateMailboxId();
			await env.DB.prepare(
				"INSERT INTO mailboxes (id, email, prefix) VALUES (?, ?, ?)"
			).bind(newMailboxId, toAddress, prefix).run();
			mailbox = { id: newMailboxId };
			console.log(`Created new mailbox: ${toAddress} (${newMailboxId})`);
		}

		const mailId = generateMailId();
		
		await env.DB.prepare(
			"INSERT INTO mails (id, mailbox_id, sender_name, content) VALUES (?, ?, ?, ?)"
		).bind(mailId, mailbox.id, fromAddress, mailContent).run();

		console.log(`Email stored: ${fromAddress} -> ${toAddress}, mail_id: ${mailId}`);
	} catch (e: any) {
		console.error("Error processing email:", e.message, e.stack);
	}
}
