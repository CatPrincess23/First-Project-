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
  const o = orig.trim(), c = corr.trim();
  if (!o && !c) return "grammar";
  if (o === c) return "grammar";
  if (o.toLowerCase() === c.toLowerCase() && o !== c) return "spelling";
  if (o.replace(/['']/g, "") === c.replace(/['']/g, "")) return "spelling";
  if (!o.includes(" ") && !c.includes(" ")) {
    const dist = levenshtein(o, c);
    if (dist <= 2) return "spelling";
    return "grammar";
  }
  if (o.includes(" ") || c.includes(" ")) return "style";
  return "grammar";
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function wordDiff(original: string, corrected: string) {
  // Tokenize into words (no whitespace tokens), tracking character offsets
  const oWords: { text: string; offset: number }[] = [];
  const wordRe = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(original)) !== null) {
    oWords.push({ text: m[0], offset: m.index });
  }
  const cWords = [...corrected.matchAll(wordRe)].map(x => x[0]);

  const n = oWords.length, cl = cWords.length;

  // Longest Common Subsequence DP
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(cl + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= cl; j++) {
      if (oWords[i - 1].text === cWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find edit operations
  const ops: { op: "match" | "del" | "ins"; oi: number; ci: number }[] = [];
  let i = n, j = cl;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oWords[i - 1].text === cWords[j - 1]) {
      ops.push({ op: "match", oi: i - 1, ci: j - 1 });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ op: "ins", oi: -1, ci: j - 1 });
      j--;
    } else {
      ops.push({ op: "del", oi: i - 1, ci: -1 });
      i--;
    }
  }
  ops.reverse();

  // Group consecutive non-match ops into error blocks
  const errors: { message: string; suggestion: string; offset: number; length: number; type: string }[] = [];
  let k = 0;
  while (k < ops.length) {
    if (ops[k].op === "match") { k++; continue; }

    const origWords: string[] = [];
    const corrWords: string[] = [];
    let blockStart = original.length;
    let blockEnd = 0;

    while (k < ops.length && ops[k].op !== "match") {
      if (ops[k].oi >= 0) {
        const w = oWords[ops[k].oi];
        blockStart = Math.min(blockStart, w.offset);
        blockEnd = Math.max(blockEnd, w.offset + w.text.length);
        origWords.push(w.text);
      }
      if (ops[k].ci >= 0) {
        corrWords.push(cWords[ops[k].ci]);
      }
      k++;
    }

    if (origWords.length === 0) continue;

    const errSpan = original.slice(blockStart, blockEnd);
    const corrStr = corrWords.join(" ");

    errors.push({
      message: `${origWords.join(" ")} → ${corrStr}`,
      suggestion: corrStr,
      offset: blockStart,
      length: blockEnd - blockStart,
      type: classifyError(errSpan, corrStr),
    });
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
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: `You are an expert professional proofreader and copy editor. Your task is to carefully review text and fix EVERY error you find — be thorough and precise. Fix ALL of the following:

1. **Spelling**: Typos, misspelled words, incorrect homophones (their/there/they're, your/you're, its/it's, to/too/two, etc.)
2. **Grammar**: Subject-verb agreement, verb tense consistency, pronoun agreement, article usage (a/an/the), pluralization, comparatives
3. **Punctuation**: Missing or incorrect commas, periods, apostrophes, quotation marks, semicolons, colons, dashes, hyphens
4. **Capitalization**: Sentence starts, proper nouns, titles
5. **Word choice**: Awkward phrasing, incorrect word usage, redundancies, clunky constructions
6. **Sentence structure**: Run-on sentences, fragments, awkward constructions

Return ONLY the corrected text with all errors fixed. Do NOT add any explanations, commentary, JSON formatting, or markdown. If there are no errors at all, return the text exactly as provided.`,
      },
      { role: "user", content: text },
    ],
    max_tokens: 2000,
  });
  const corrected = fixCompletion.choices[0]?.message?.content?.trim() || text.trim();

  if (corrected === text.trim()) return res.json({ errors: [], correctedText: text });

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
