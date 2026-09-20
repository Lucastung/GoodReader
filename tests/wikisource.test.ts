import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error 純 JS 腳本
import { extractParagraphs, mergeParagraphs, inspect } from "../scripts/collect-wikisource.mjs";

// 仿維基文庫 parse API 輸出的結構（內容為測試用自編文字）
const html = `<div class="mw-parser-output">
<div id="headerContainer"><table class="headertemplate"><tr><td>測試篇　作者：某人　朝代</td></tr></table></div>
<div class="ws-noexport">本作品在全世界都屬於公有領域</div>
<p>春日遲遲，庭前花木初發，鳥語相和，行人往來不絕。<sup class="reference">[1]</sup></p>
<p>余坐窗下讀書，時聞鄰童笑語，心甚樂之，因記其事。</p>
<dl><dd><p>客曰：讀書之樂，在於自得，非外物所能與也。</p></dd></dl>
<h2><span class="mw-headline">注釋</span></h2>
<ol class="references"><li>遲遲：緩慢的樣子。</li></ol>
<p>這段是注釋後面的文字，不應該被收進來。</p>
</div>`;

test("抽出正文段落，去掉頁首、授權框、註腳與注釋段", () => {
  const p = extractParagraphs(html);
  assert.equal(p.length, 3);
  assert.ok(p[0].startsWith("春日遲遲") && !p[0].includes("[1]"));
  assert.ok(p[2].startsWith("客曰"));
  assert.ok(!p.join("").includes("公有領域"));
  assert.ok(!p.join("").includes("注釋後面"));
});

test("詩體 div.poem 依換行分句", () => {
  const p = extractParagraphs(`<div class="poem"><p>床前明月光，疑是地上霜。<br>舉頭望明月，低頭思故鄉。</p></div>`);
  assert.equal(p.length, 2);
});

test("段落超過 40 段會合併到 40 段，內容不變", () => {
  const src = Array.from({ length: 55 }, (_, i) => `第${i}段文字內容。`);
  const m = mergeParagraphs(src);
  assert.equal(m.length, 40);
  assert.equal(m.join(""), src.join(""));
});

test("檢查：簡體與字數警告", () => {
  assert.ok(inspect(["这们说这个时候来国学会对发过的文字，重复重复重复。".repeat(10)]).warnings.some((w: string) => w.includes("簡體")));
  assert.ok(inspect(["太短了。"]).warnings.some((w: string) => w.includes("過少")));
});

test("異體字換成臺灣標準字", async () => {
  // @ts-expect-error 純 JS 腳本
  const { normalizeVariants } = await import("../scripts/collect-wikisource.mjs");
  const r = normalizeVariants("爲學一首示子姪，説眞話");
  assert.equal(r.text, "為學一首示子姪，說真話");
  assert.equal(r.replaced, 3);
});

test("去掉模板殘留與整段括號註記", async () => {
  // @ts-expect-error 純 JS 腳本
  const { isJunk } = await import("../scripts/collect-wikisource.mjs");
  assert.equal(isJunk("<作者:某人<古文觀止"), true);
  assert.equal(isJunk("（某人曰：此文甚佳。）"), true);
  assert.equal(isJunk("（一九一九年三月。）"), true);
  assert.equal(isJunk("他說（大意如此），然後走了。"), false);
  assert.equal(isJunk("一九二七年，七月，北京清華園。"), false);
});
