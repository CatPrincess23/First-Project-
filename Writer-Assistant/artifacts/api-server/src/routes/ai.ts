import { Router } from "express";
import OpenAI from "openai";
import { AiSuggestBody, AiGrammarCheckBody, AiGenerateImageBody, AiSummarizeBody, AiGeneratePrologueBody } from "@workspace/api-zod";

const router = Router();

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
    res.status(503).json({ error: "AI features unavailable: no API key configured" });
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

// POST /api/ai/grammar
router.post("/grammar", async (req, res) => {
  if (!checkKey(res)) return;
  const parse = AiGrammarCheckBody.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });
  const { text } = parse.data;
  const completion = await getClient().chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: `You are a grammar and spelling checker. Analyze the text and return a JSON object with:\n- "errors": array of { "message": string, "offset": number, "length": number, "type": "grammar"|"spelling"|"style", "suggestion": string|null }\n- "correctedText": the full corrected version\nReturn ONLY valid JSON, no markdown.` },
      { role: "user", content: `Check this text:\n\n${text}` },
    ],
    max_tokens: 2000,
  });
  const raw = completion.choices[0]?.message?.content || '{"errors":[],"correctedText":""}';
  let result;
  try { result = JSON.parse(raw); } catch { result = { errors: [], correctedText: text }; }
  res.json({ errors: result.errors || [], correctedText: result.correctedText || text });
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

export default router;
