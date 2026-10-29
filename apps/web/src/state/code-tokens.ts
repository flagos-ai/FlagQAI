export type CodeToken = { text: string; kind: string };
export function codeTokens(
  source: string,
  language: "python" | "qasm" | "plain",
): CodeToken[] {
  if (language === "plain") return [{ text: source, kind: "plain" }];
  const pattern =
    language === "python"
      ? /#[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b[A-Za-z_]\w*\b/g
      : /\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b[A-Za-z_]\w*\b/g;
  const keywords = new Set(
    language === "python"
      ? [
          "import",
          "from",
          "as",
          "True",
          "False",
          "None",
          "return",
          "def",
          "for",
          "in",
          "if",
          "else",
        ]
      : [
          "OPENQASM",
          "include",
          "qreg",
          "creg",
          "qubit",
          "bit",
          "measure",
          "reset",
          "barrier",
        ],
  );
  const tokens: CodeToken[] = [];
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index!,
      text = match[0];
    if (index > cursor)
      tokens.push({ text: source.slice(cursor, index), kind: "plain" });
    const kind = (
      language === "python" ? text.startsWith("#") : text.startsWith("//")
    )
      ? "comment"
      : /^["']/.test(text)
        ? "string"
        : /^\d/.test(text)
          ? "number"
          : keywords.has(text)
            ? "keyword"
            : text === "pi"
              ? "constant"
              : /^\s*\(/.test(source.slice(index + text.length))
                ? "function"
                : "plain";
    tokens.push({ text, kind });
    cursor = index + text.length;
  }
  if (cursor < source.length)
    tokens.push({ text: source.slice(cursor), kind: "plain" });
  return tokens;
}
