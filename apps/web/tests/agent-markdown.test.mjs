import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const root = fileURLToPath(new URL("../", import.meta.url));
const temp = await mkdtemp(root + "node_modules/.agent-markdown-test-");
after(() => rm(temp, { recursive: true, force: true }));
await build({
  entryPoints: [root + "src/components/AgentMarkdown.tsx"],
  bundle: true,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  external: ["react", "react/jsx-runtime"],
  outfile: temp + "/render.mjs",
});
const { AgentMarkdown, safeMarkdownLink } = await import(
  pathToFileURL(temp + "/render.mjs")
);
const render = (text) =>
  renderToStaticMarkup(React.createElement(AgentMarkdown, { text }));
test("CLI-style Markdown renders headings, inline code, emphasis, nested lists, quotes and tables", () => {
  const html = render(
    "## 信息获取\n\n**重点**：使用 `flagqai`\n\n- 第一项\n  - 子项\n\n3. 第三步\n4. 第四步\n\n> 引用\n\n| 门 | 说明 |\n| --- | --- |\n| H | 叠加 |",
  );
  assert.match(html, /<h2>.*信息获取/);
  assert.match(html, /<strong>.*重点/);
  assert.match(html, /<code>flagqai<\/code>/);
  assert.equal((html.match(/<ul>/g) || []).length, 2);
  assert.match(html, /<ol start="3">/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<table>/);
  assert.doesNotMatch(html, /\*\*重点\*\*/);
});
test("incomplete streamed fences stay code and close without duplicating the payload", () => {
  for (const suffix of ["", "\n```"]) {
    const html = render(
      "```python\nimport flagquantum as fq\nfq.run(circuit)" + suffix,
    );
    assert.match(html, /fq-syntax-keyword/);
    assert.match(html, /Copy python/);
    assert.equal((html.match(/flagquantum/g) || []).length, 1);
    assert.doesNotMatch(html, /```/);
  }
  assert.match(
    render("```bash\nflagqai serve --port 4096\n```"),
    /fq-syntax-plain/,
  );
});
test("untrusted model HTML, image URLs and executable links remain inert", () => {
  const html = render(
    "<script>alert(1)</script>\n\n[unsafe](javascript:alert%281%29)\n\n![tracking](https://example.com/pixel)\n\n[safe](https://example.com/docs)",
  );
  assert.doesNotMatch(html, /<script|<img|href="javascript:/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /href="https:\/\/example.com\/docs"/);
  for (const href of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///etc/passwd",
    "vbscript:msgbox(1)",
  ])
    assert.equal(safeMarkdownLink(href), undefined);
});
test("all streamed prefixes are renderable, including unfinished lists and inline tokens", () => {
  const text =
    "## 标题\n\n**粗体** 和 `inline`\n\n- 列表\n  - 子项\n\n```qasm\nh q[0];\n```";
  for (let i = 1; i <= text.length; i++)
    assert.doesNotThrow(() => render(text.slice(0, i)));
});
test("LaTeX renders inline, display, table and list formulas without losing TeX syntax", () => {
  const html = render(String.raw`| Formula | Result |
| --- | --- |
| $(n\cdot\sigma)^2=I$, $\operatorname{spec}=\{+1,-1\}$ | PASS |
| $M=\frac{\operatorname{tr}M}{2}I+\frac12\sum_a\operatorname{tr}(M\sigma_a)\sigma_a$ | PASS |

1. **Factor 2**: $[\sigma_i,\sigma_j]=2i\varepsilon_{ijk}\sigma_k$
2. \(a\otimes b\)

$$
e^{i\theta N}=\cos\theta I+i\sin\theta N
$$

\[
\frac{1}{2}
\]

\begin{aligned}
a &= b \\
c &= d
\end{aligned}
`);
  assert.match(html, /<table>/);
  assert.match(html, /<ol/);
  assert.equal((html.match(/class="katex"/g) || []).length, 8);
  assert.match(html, /<math/);
  assert.doesNotMatch(html, /fq-math-source/);
});
test("math leaves code and currency prose literal and preserves invalid or pending source", () => {
  const html = render(
    '`$x$`\n\n```python\nvalue = "$x$"\n```\n\nPrice $20 and $30.',
  );
  assert.doesNotMatch(html, /class="katex"/);
  assert.match(html, /<code>\$x\$<\/code>/);
  for (const text of [
    String.raw`$$\frac{`,
    String.raw`$\notARealCommand{x}$`,
    "$" + "x".repeat(4100) + "$",
  ]) {
    assert.match(render(text), /fq-math-source/);
  }
  const source = String.raw`Start $\sigma_2^T=-\sigma_2$.

$$
\frac{1}{\sqrt{2}}\begin{pmatrix}1\\1\end{pmatrix}
$$`;
  for (let i = 1; i <= source.length; i++)
    assert.doesNotThrow(() => render(source.slice(0, i)));
  assert.match(render(source), /class="katex"/);
});
test("untrusted TeX cannot mount executable links, images or arbitrary HTML", () => {
  for (const tex of [
    String.raw`\href{javascript:alert(1)}{x}`,
    String.raw`\includegraphics{https://example.com/pixel}`,
    String.raw`\htmlClass{owned}{x}`,
    String.raw`\htmlStyle{background:url(https://example.com)}{x}`,
    String.raw`\def\a{\a}\a`,
  ]) {
    const html = render("$" + tex + "$");
    assert.doesNotMatch(
      html,
      /<img|<script|<a\s|class="owned"|style="background/,
    );
  }
  assert.match(render("$<script>alert(1)</script>$"), /&lt;script/);
});
test("each complete formula exposes its exact LaTeX source as an accessible copy action", () => {
  const html = render(String.raw`Inline $\sigma_i^2=I$.

$$
\frac{1}{\sqrt{2}}
$$`);
  assert.equal((html.match(/<button/g) || []).length, 2);
  assert.match(html, /aria-label="Copy LaTeX: \\sigma_i\^2=I"/);
  assert.match(html, /aria-label="Copy LaTeX: \\frac\{1\}\{\\sqrt\{2\}\}"/);
  assert.doesNotMatch(render(String.raw`$$\frac{`), /<button/);
});
