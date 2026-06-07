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

const IMAGE_MODELS = [
  "openai/gpt-5.4-image-2",
  "openai/gpt-5-image",
  "black-forest-labs/flux-schnell",
];

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

function classifyError(orig: string, corr: string): "spelling" | "grammar" | "style" | "punctuation" {
  const o = orig.trim(), c = corr.trim();
  if (!o && !c) return "grammar";
  if (o === c) return "grammar";
  const stripNonAlpha = (s: string) => s.replace(/[a-zA-Z0-9\s]/g, "");
  const alphaOnly = (s: string) => s.replace(/[^a-zA-Z0-9\s]/g, "");
  if (stripNonAlpha(o) !== stripNonAlpha(c) && alphaOnly(o) === alphaOnly(c)) return "punctuation";
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

  // Quick pre-scan: check if the text has any errors before doing a full correction
  const scanCompletion = await getClient().chat.completions.create({
    model: MODEL,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `You are an expert proofreader. Scan the text for ANY errors — spelling, grammar, punctuation, capitalization, word choice, or sentence structure issues. Reply with ONLY "YES" if there are errors to fix, or "NO" if the text is perfectly error-free. Do not provide any other response.`,
      },
      { role: "user", content: text },
    ],
    max_tokens: 5,
  });
  const scanResult = (scanCompletion.choices[0]?.message?.content || "").trim().toUpperCase();

  if (scanResult === "NO") return res.json({ errors: [], correctedText: text });

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

// POST /api/ai/scan-entities
router.post("/scan-entities", async (req, res) => {
  if (!checkKey(res)) return;
  const { type, entityName, documentContent } = req.body;
  if (!type || !documentContent) {
    return res.status(400).json({ error: "type and documentContent are required" });
  }
  const validTypes = ["person", "animal", "place", "thing"];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
  }

  const article = type === "animal" ? "an" : "a";
  const plural = type === "person" ? "people" : type === "animal" ? "animals" : type === "place" ? "places" : "things";
  const singular = type;

  // If a specific entity name is provided, search for just that entity
  if (entityName) {
    const completion = await getClient().chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You are ${article} literary analyst. Scan the document below and find the specific ${singular} named "${entityName}". Extract:
1. Their name (or "Unnamed" if not named)
2. A detailed visual description based ONLY on what the text says — appearance, personality, role, traits
3. Key characteristics mentioned

Return the results as JSON ONLY — no other text. Format:
{
  "entities": [
    {
      "name": "Entity Name",
      "description": "Detailed visual description based on the text",
      "details": "Key characteristics, role, personality traits"
    }
  ]
}

If "${entityName}" is not found in the document, return { "entities": [] }.`,
        },
        { role: "user", content: documentContent },
      ],
      max_tokens: 2000,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '{"entities":[]}';
    try {
      const parsed = JSON.parse(raw);
      res.json(parsed);
    } catch {
      res.json({ entities: [{ name: entityName, description: raw.slice(0, 500), details: "" }] });
    }
    return;
  }

  const completion = await getClient().chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `You are ${article} literary analyst. Scan the document below and find all ${plural} (characters/${plural}). For each one, extract:
1. Their name (or "Unnamed" if not named)
2. A detailed visual description based ONLY on what the text says — appearance, personality, role, traits
3. Key characteristics mentioned

Return the results as JSON ONLY — no other text. Format:
{
  "entities": [
    {
      "name": "Entity Name",
      "description": "Detailed visual description based on the text",
      "details": "Key characteristics, role, personality traits"
    }
  ]
}

If no ${plural} are found, return { "entities": [] }.`,
      },
      { role: "user", content: documentContent },
    ],
    max_tokens: 2000,
  });

  const raw = completion.choices[0]?.message?.content?.trim() || '{"entities":[]}';
  try {
    const parsed = JSON.parse(raw);
    res.json(parsed);
  } catch {
    res.json({ entities: [{ name: "Character", description: raw.slice(0, 500), details: "" }] });
  }
});

// POST /api/ai/image
router.post("/image", async (req, res) => {
  if (!checkKey(res)) return;
  const { prompt, entityType, entityName, documentContent } = req.body;

  let finalPrompt = prompt;

  // If entity info is provided, use AI to build a detailed prompt from the document
  if (entityType && entityName && documentContent) {
    const article = entityType === "animal" ? "an" : "a";
    const completion = await getClient().chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: `You are ${article} literary visual artist. Based on the document content, extract ALL visual details about "${entityName}" (${article} ${entityType}). Focus on:
- Physical appearance (age, height, build, hair, eyes, skin, clothing)
- Personality that would show in expression/posture
- Surroundings and setting
- Any distinctive features or items

Return a single detailed image generation prompt (2-3 sentences) describing this ${entityType} visually. Do NOT include any meta text, just the prompt.`,
        },
        { role: "user", content: `Document content:\n\n${documentContent}\n\nFocus on the character "${entityName}."` },
      ],
      max_tokens: 500,
    });
    finalPrompt = completion.choices[0]?.message?.content?.trim() || prompt;
  }

  if (!finalPrompt) {
    return res.status(400).json({ error: "prompt is required" });
  }

  // Generate image using OpenRouter's images API
  let imgResult: { b64_json: string; mime: string } | null = null;
  for (const imgModel of IMAGE_MODELS) {
    try {
      const gen = await getClient().images.generate({
        model: imgModel,
        prompt: finalPrompt,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json",
      });
      const data = gen.data?.[0];
      if (data?.b64_json) {
        imgResult = { b64_json: data.b64_json, mime: "image/png" };
        console.log("[image] Success with", imgModel);
        break;
      }
      if (data?.url) {
        imgResult = { b64_json: data.url, mime: "image/png" };
        console.log("[image] Success with", imgModel, "(url)");
        break;
      }
    } catch (imgErr: any) {
      console.log("[image]", imgModel, "failed:", imgErr.message);
    }
  }

  if (imgResult) {
    return res.json(imgResult);
  }

  // Fallback: SVG generation via deepseek
  try {
    function extractSvg(raw: string): string | null {
      const blockMatch = raw.match(/```(?:svg)?\s*([\s\S]*?)```/i);
      if (blockMatch) {
        const svg = blockMatch[1].trim();
        if (svg.startsWith("<svg")) return svg;
      }
      const svgMatch = raw.match(/(<svg[\s\S]*?<\/svg>)/i);
      if (svgMatch) return svgMatch[1];
      const idx = raw.indexOf("<svg");
      if (idx >= 0) {
        const endIdx = raw.indexOf("</svg>", idx);
        if (endIdx >= 0) return raw.slice(idx, endIdx + 6);
      }
      return null;
    }

    let svg: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const sysMsg = `Create an SVG illustration matching the user's description.

OUTPUT FORMAT: Put the SVG inside \`\`\`svg ... \`\`\` tags.
- viewBox="0 0 800 600" width="100%" height="100%"
- Use gradient backgrounds
- If the user describes a PERSON, draw them with: circle for head, path for body/clothes, lines for arms, circle for sun/moon
- Add surrounding scene elements (trees, mountains, stars, etc.)
- Use <defs> with linearGradient for sky and ground
- Keep it under 50 SVG elements
- NO text explanations, just the SVG in code blocks

Example structure:
\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="100%" height="100%">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1a1a3e"/><stop offset="100%" stop-color="#2d4a6a"/></linearGradient></defs>
  <rect width="800" height="600" fill="url(#g)"/>
  <circle cx="400" cy="300" r="25" fill="#e8c9a0"/>
  <path d="M375 330 L425 330 L435 420 L365 420 Z" fill="#2a4a7a"/>
</svg>
\`\`\``;

        const completion = await getClient().chat.completions.create({
          model: MODEL,
          temperature: attempt === 0 ? 0.2 : 0,
          messages: [
            { role: "system", content: sysMsg },
            { role: "user", content: finalPrompt },
          ],
          max_tokens: 1500,
        });

        const raw = completion.choices[0]?.message?.content?.trim() || "";
        const extracted = extractSvg(raw);
        if (extracted) { svg = extracted; break; }
      } catch {
        // retry
      }
    }

    if (!svg) {
      const fbEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="100%" height="100%">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="50%" stop-color="#16213e"/>
      <stop offset="100%" stop-color="#0f3460"/>
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.1)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#sky)"/>
  <rect width="800" height="600" fill="url(#glow)"/>
  <circle cx="400" cy="200" r="150" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
  <circle cx="400" cy="200" r="100" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.04)" stroke-width="0.5"/>
  <text x="400" y="290" text-anchor="middle" fill="rgba(255,255,255,0.6)" font-family="Georgia, serif" font-size="22" font-style="italic">${fbEsc(finalPrompt.slice(0, 80))}</text>
</svg>`;
    }

    const b64_json = Buffer.from(svg, "utf-8").toString("base64");
    res.json({ b64_json, mime: "image/svg+xml" });
  } catch (err: any) {
    res.status(500).json({ error: `Image generation failed: ${err.message}` });
  }
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
