// Thin Telegram Bot API helpers shared by the webhook + background agent.
const API = (method) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

async function call(method, payload) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return { ok: false, skipped: "TELEGRAM_BOT_TOKEN missing" };
  const res = await fetch(API(method), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  return res.json().catch(() => ({}));
}

const CHUNK = 3800; // stay under Telegram's 4096 limit
function chunk(text) {
  const parts = [];
  let s = String(text);
  while (s.length > CHUNK) {
    let cut = s.lastIndexOf("\n", CHUNK);
    if (cut < CHUNK * 0.5) cut = CHUNK;
    parts.push(s.slice(0, cut));
    s = s.slice(cut);
  }
  parts.push(s);
  return parts;
}

// HTML send, auto-split. reply_markup applied to the LAST chunk only.
async function send(chatId, text, opts = {}) {
  const parts = chunk(text);
  let last;
  for (let i = 0; i < parts.length; i++) {
    const payload = { chat_id: chatId, text: parts[i], parse_mode: opts.parseMode || "HTML", disable_web_page_preview: true };
    if (i === parts.length - 1 && opts.reply_markup) payload.reply_markup = opts.reply_markup;
    last = await call("sendMessage", payload);
  }
  return last;
}

const escapeHtml = (s) =>
  String(s == null ? "" : s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const answerCallback = (id, text) => call("answerCallbackQuery", { callback_query_id: id, text: text || "" });
const editText = (chatId, messageId, text) =>
  call("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", disable_web_page_preview: true });

module.exports = { call, send, escapeHtml, answerCallback, editText };
