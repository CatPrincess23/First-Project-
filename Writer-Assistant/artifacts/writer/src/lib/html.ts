// Shared HTML-to-plain-text helpers used by the dashboard previews and the
// editor. Mirrors the server-side countWords() decoding so client previews match
// the saved word counts (entities decoded, tags stripped, whitespace collapsed).

export const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
  "&quot;": '"', "&#39;": "'", "&#x27;": "'", "&#x2F;": "/",
};

export function decodeEntities(text: string): string {
  return text.replace(
    /&(?:nbsp|amp|lt|gt|quot|#39|#x27|#x2F|#(\d+)|#x([0-9a-fA-F]+));/g,
    (match, dec, hex) => {
      if (ENTITY_MAP[match]) return ENTITY_MAP[match];
      if (hex !== undefined) return String.fromCharCode(parseInt(hex, 16));
      if (dec !== undefined) return String.fromCharCode(parseInt(dec, 10));
      return match;
    },
  );
}

export function stripHtml(html: string): string {
  return decodeEntities(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
