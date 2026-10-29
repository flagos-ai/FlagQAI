import { Marked, type TokenizerExtension, type Tokens } from "marked";
export type MathToken = Tokens.Generic & {
  type: "fqMath" | "fqMathBlock";
  raw: string;
  text: string;
  display: boolean;
  pending?: boolean;
};
const escaped = (source: string, index: number) => {
  let count = 0;
  while (index > 0 && source[--index] === "\\") count++;
  return count % 2 === 1;
};
function closing(source: string, delimiter: string, start: number) {
  let index = source.indexOf(delimiter, start);
  while (index >= 0 && escaped(source, index))
    index = source.indexOf(delimiter, index + 1);
  return index;
}
const pairs = [
  ["$$", "$$"],
  ["\\(", "\\)"],
  ["\\[", "\\]"],
  ["$", "$"],
] as const;
const inline: TokenizerExtension = {
  name: "fqMath",
  level: "inline",
  start(source) {
    const index = source.search(/\$|\\[([]/);
    return index < 0 ? undefined : index;
  },
  tokenizer(source) {
    const pair = pairs.find(([open]) => source.startsWith(open));
    if (!pair) return;
    const [open, close] = pair,
      end = closing(source, close, open.length);
    if (end < 0) return;
    const text = source.slice(open.length, end),
      after = source[end + close.length] || "";
    if (!text.trim() || text.includes("\n")) return;
    // Prices and environment-variable prose stay literal; CJK may touch math.
    if (
      open === "$" &&
      (/^\s|\s$/.test(text) || /^[A-Za-z0-9]/.test(after) || text.includes("`"))
    )
      return;
    return {
      type: "fqMath",
      raw: source.slice(0, end + close.length),
      text,
      display: open === "$$" || open === "\\[",
    } satisfies MathToken;
  },
};
const block: TokenizerExtension = {
  name: "fqMathBlock",
  level: "block",
  start(source) {
    const match =
      /(?:^|\n) {0,3}(?:\$\$|\\\[|\\begin\{(?:align\*?|aligned|equation\*?|gather\*?|gathered)\})/.exec(
        source,
      );
    return match
      ? match.index + (match[0].startsWith("\n") ? 1 : 0)
      : undefined;
  },
  tokenizer(source) {
    const environment =
      /^ {0,3}\\begin\{(align\*?|aligned|equation\*?|gather\*?|gathered)\}/.exec(
        source,
      );
    const opener = /^ {0,3}(\$\$|\\\[)/.exec(source);
    if (!environment && !opener) return;
    const prefix = (environment || opener)![0],
      close = environment
        ? "\\end{" + environment[1] + "}"
        : opener![1] === "$$"
          ? "$$"
          : "\\]";
    const end = closing(source, close, prefix.length);
    if (end < 0)
      return {
        type: "fqMathBlock",
        raw: source,
        text: environment ? source : source.slice(prefix.length),
        display: true,
        pending: true,
      } satisfies MathToken;
    const tail = /^[ \t]*(?:\n|$)/.exec(source.slice(end + close.length));
    if (!tail) return;
    return {
      type: "fqMathBlock",
      raw: source.slice(0, end + close.length + tail[0].length),
      text: environment
        ? source.slice(
            prefix.length - environment[0].trimStart().length,
            end + close.length,
          )
        : source.slice(prefix.length, end).trim(),
      display: true,
    } satisfies MathToken;
  },
};
// Separate instance: no mutation of the CLI's or other components' Markdown rules.
export const mathMarkdown = new Marked({ gfm: true });
mathMarkdown.use({ extensions: [block, inline] });
