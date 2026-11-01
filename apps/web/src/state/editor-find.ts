import type { CodeToken } from "./code-tokens.ts";
export type CodeMatch = { start: number; end: number };

export function findCodeMatches(
  source: string,
  query: string,
  matchCase = false,
): CodeMatch[] {
  if (!query) return [];
  const literal = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    ...source.matchAll(new RegExp(literal, matchCase ? "gu" : "giu")),
  ].map((match) => ({
    start: match.index!,
    end: match.index! + match[0].length,
  }));
}

/** Split only the active match, preserving exact token text and syntax colors. */
export function markCodeMatch(
  tokens: CodeToken[],
  start: number,
  end: number,
): (CodeToken & { matched?: boolean })[] {
  if (end <= start || end <= 0) return tokens;
  let offset = 0;
  return tokens.flatMap((token) => {
    const from = Math.max(0, start - offset);
    const to = Math.min(token.text.length, end - offset);
    offset += token.text.length;
    if (to <= from) return [{ ...token, matched: false }];
    return [
      { ...token, text: token.text.slice(0, from), matched: false },
      { ...token, text: token.text.slice(from, to), matched: true },
      { ...token, text: token.text.slice(to), matched: false },
    ].filter((part) => part.text);
  });
}
