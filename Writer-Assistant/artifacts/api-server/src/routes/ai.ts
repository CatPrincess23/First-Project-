import { Router } from "express";
import OpenAI from "openai";
import { AiSuggestBody, AiGrammarCheckBody, AiGenerateImageBody, AiSummarizeBody, AiGeneratePrologueBody, AiChatBody } from "@workspace/api-zod";
import { db, messages, conversations } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

function getUserId(req: any): string {
  return req.auth?.userId || req.headers["x-guest-id"] || "guest";
}

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: OPENROUTER_KEY || "sk-placeholder",
      defaultHeaders: {
        "HTTP-Referer": process.env.APP_URL || "http://localhost:8080",
        "X-Title": "WriteAI",
      },
    });
  }
  return _client;
}

const MODEL = "deepseek/deepseek-v4-flash";

function checkKey(res: any): boolean {
  if (!OPENROUTER_KEY) {
    res.status(503).json({ error: "AI features unavailable: no OPENROUTER_API_KEY configured" });
    return false;
  }
  return true;
}

// POST /api/ai/suggest
router.post("/suggest", async (req, res) => {
  if (!checkKey(res)) return;
  const parse = AiSuggestBody.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });
  const { text, type, context } = parse.data;
  const prompts: Record<string, string> = {
    improve: `Improve the following text to make it clearer, more engaging, and better written. Return only the improved text:\n\n${text}`,
    expand: `Expand the following text with more detail and depth. Return only the expanded text:\n\n${text}`,
    shorten: `Shorten the following text while keeping the key ideas. Return only the shortened text:\n\n${text}`,
    rephrase: `Rephrase the following text in a different way. Return only the rephrased text:\n\n${text}`,
    continue: `Continue writing naturally from the following text. Return only the continuation (not the original):\n\n${text}`,
  };
  const systemMsg = context ? `You are a skilled writing assistant. Context: ${context.slice(0, 500)}` : "You are a skilled writing assistant.";
  const completion = await getClient().chat.completions.create({
    model: MODEL,
    messages: [{ role: "system", content: systemMsg }, { role: "user", content: prompts[type] || prompts.improve }],
    max_tokens: 1000,
  });
  res.json({ suggestion: completion.choices[0]?.message?.content?.trim() || "" });
});

function classifyError(orig: string, corr: string): "spelling" | "grammar" | "style" {
  // Single word, different spelling → spelling
  if (!orig.includes(" ") && !corr.includes(" ")) return "spelling";
  // Adding/removing contraction apostrophe → spelling
  if (orig.replace(/['']/g, "") === corr.replace(/['']/g, "")) return "spelling";
  return "grammar";
}

function wordDiff(original: string, corrected: string) {
  const tokenRe = /\S+|\s+/g;
  const ot: { text: string; offset: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(original)) !== null) ot.push({ text: m[0], offset: m.index });
  const ct = [...corrected.matchAll(tokenRe)].map(x => x[0]);

  const errors: { message: string; suggestion: string; offset: number; length: number; type: string }[] = [];
  let oi = 0, ci = 0;

  while (oi < ot.length || ci < ct.length) {
    // Skip matching tokens
    while (oi < ot.length && ci < ct.length && ot[oi].text === ct[ci]) { oi++; ci++; }

    if (oi >= ot.length && ci >= ct.length) break;
    if (oi >= ot.length) break; // insertion only (shouldn't happen with corrections)
    if (ci >= ct.length) break; // deletion only (shouldn't happen)

    // Found a difference — collect the error span in original
    const errStart = ot[oi].offset;
    let errEnd = ot[oi].offset + ot[oi].text.length;
    const origWords: string[] = [ot[oi].text];
    const corrWords: string[] = [ct[ci]];
    oi++; ci++;

    // Try to find next matching token to bound the error
    while (oi < ot.length && ci < ct.length && ot[oi].text !== ct[ci]) {
      errEnd = ot[oi].offset + ot[oi].text.length;
      origWords.push(ot[oi].text);
      corrWords.push(ct[ci]);
      oi++; ci++;
    }

    const origStr = origWords.join("").replace(/\s+/g, " ").trim();
    const corrStr = corrWords.join("").replace(/\s+/g, " ").trim();
    const errText = original.slice(errStart, errEnd);
    const errorLen = errText.length;

    if (origStr && corrStr) {
      errors.push({
        message: `${origStr} → ${corrStr}`,
        suggestion: corrStr,
        offset: errStart,
        length: errorLen,
        type: classifyError(origStr, corrStr),
      });
    }
  }

  return errors;
}

// POST /api/ai/grammar
router.post("/grammar", async (req, res) => {
  if (!checkKey(res)) return;
  const parse = AiGrammarCheckBody.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });
  const { text } = parse.data;

  // Get corrected text from AI
  const fixCompletion = await getClient().chat.completions.create({
    model: MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: "You are a proofreader. Fix ALL spelling, grammar, punctuation, and word choice errors in the text. Return ONLY the corrected text — no explanations, no JSON, no markdown." },
      { role: "user", content: text },
    ],
    max_tokens: 2000,
  });
  const corrected = fixCompletion.choices[0]?.message?.content?.trim() || text;

  if (corrected === text) return res.json({ errors: [], correctedText: text });

  const errors = wordDiff(text, corrected);
  res.json({ errors, correctedText: corrected });
});

// POST /api/ai/image
router.post("/image", async (_req, res) => {
  res.status(501).json({ error: "Image generation is not available via OpenRouter. Use DALL-E 3 with an OpenAI key." });
});

// POST /api/ai/summarize
router.post("/summarize", async (req, res) => {
  if (!checkKey(res)) return;
  const parse = AiSummarizeBody.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });
  const { text, title } = parse.data;
  const completion = await getClient().chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: "You are a literary assistant specializing in book and manuscript summaries. Create clear, engaging summaries that capture the essence of the work." },
      { role: "user", content: `Please provide a concise summary of the following manuscript${title ? ` titled "${title}"` : ""}. Identify key themes, plot points, characters, and the overall arc:\n\n${text.slice(0, 8000)}` },
    ],
    max_tokens: 600,
  });
  res.json({ summary: completion.choices[0]?.message?.content?.trim() || "" });
});

// POST /api/ai/prologue
router.post("/prologue", async (req, res) => {
  if (!checkKey(res)) return;
  const parse = AiGeneratePrologueBody.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });
  const { text, title } = parse.data;
  const completion = await getClient().chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: "You are a master storyteller and author. Write compelling prologues that hook readers immediately and set the tone for the story." },
      { role: "user", content: `Based on the following manuscript content${title ? ` from a book titled "${title}"` : ""}, write a captivating prologue that sets the stage for the story. The prologue should be mysterious, atmospheric, and draw readers in. Write it as actual narrative prose:\n\n${text.slice(0, 6000)}` },
    ],
    max_tokens: 800,
  });
  res.json({ prologue: completion.choices[0]?.message?.content?.trim() || "" });
});

// POST /api/ai/chat
router.post("/chat", async (req, res) => {
  if (!checkKey(res)) return;
  const parse = AiChatBody.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });
  const { messages: incomingMessages, conversationId } = parse.data;
  const userId = getUserId(req);

  let convId = conversationId;
  let allMessages = incomingMessages;

  if (convId) {
    const [conv] = await db.select().from(conversations).where(and(eq(conversations.id, convId), eq(conversations.userId, userId)));
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const userMsg = incomingMessages.find(m => m.role === "user");
    if (userMsg) {
      await db.insert(messages).values({ conversationId: convId, role: userMsg.role, content: userMsg.content });
    }

    const incomingSystemMsgs = incomingMessages.filter(m => m.role === "system");

    const historyMsgs = await db.select().from(messages).where(eq(messages.conversationId, convId)).orderBy(messages.createdAt);
    allMessages = [...incomingSystemMsgs, ...historyMsgs.map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content }))];

    const isFirstMessage = historyMsgs.filter(m => m.role === "assistant").length === 0;
    if (isFirstMessage && userMsg) {
      const title = userMsg.content.slice(0, 100).replace(/\n/g, " ");
      await db.update(conversations).set({ title }).where(eq(conversations.id, convId));
    }
  }

  const sysMessages = allMessages.filter(m => m.role === "system");
  const nonSysMessages = allMessages.filter(m => m.role !== "system");
  const docContent = sysMessages.map(m => m.content).join("\n\n");
  const unifiedPrompt = docContent
    ? `You are a helpful writing assistant. Help users with their writing — give feedback, answer questions, suggest improvements, and discuss their story. Be friendly and constructive.\n\n${docContent}`
    : "You are a helpful writing assistant. Help users with their writing — give feedback, answer questions, suggest improvements, and discuss their story. Be friendly and constructive.";

  const completion = await getClient().chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: unifiedPrompt },
      ...nonSysMessages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    ],
    max_tokens: 4000,
  });
  const reply = completion.choices[0]?.message?.content?.trim() || "";

  if (convId) {
    await db.insert(messages).values({ conversationId: convId, role: "assistant", content: reply });
  }

  res.json({ reply, conversationId: convId || undefined });
});

export default router;
