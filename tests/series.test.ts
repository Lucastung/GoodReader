// 系列：文章可以標一個主題系列（例如「釣魚」），學生端可以只挑那個系列來練習。
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeD1 } from "./d1-shim.ts";
import { getArticle, listArticles, listSeries, pickArticle } from "../lib/db.ts";
import { insertArticle, listAdminArticles, updateArticle } from "../lib/admin-db.ts";
import type { ArticleInputT } from "../lib/schemas.ts";

const article = (over: Partial<ArticleInputT> & { id?: string }): ArticleInputT & { id?: string } => ({
  title: "測試",
  author: "好好讀書（AI 撰寫）",
  genre: "說明文",
  difficulty: 2,
  license: "ai-generated",
  paragraphs: ["第一段第一段第一段。", "第二段第二段第二段。"],
  ...over,
});

async function setup() {
  const db = makeD1();
  const mk = async (o: Parameters<typeof article>[0], status = "approved") =>
    insertArticle(db, article(o), { origin: "import", createdBy: "t@e.st", status });
  await mk({ id: "fish-a", title: "釣魚一", series: "釣魚", difficulty: 1 });
  await mk({ id: "fish-b", title: "釣魚二", series: "釣魚", difficulty: 5, genre: "記敘文" });
  await mk({ id: "cook-a", title: "料理一", series: "廚藝", difficulty: 2 });
  await mk({ id: "plain-a", title: "沒有系列", difficulty: 2 });
  await mk({ id: "fish-draft", title: "釣魚草稿", series: "釣魚", difficulty: 2 }, "draft");
  return db;
}

test("系列會存進資料庫，也讀得回來；沒填就是 null", async () => {
  const db = await setup();
  assert.equal((await getArticle(db, "fish-a"))?.series, "釣魚");
  assert.equal((await getArticle(db, "plain-a"))?.series, null);
});

test("指定系列抽文章時，只會抽到那個系列的已上架文章", async () => {
  const db = await setup();
  for (let i = 0; i < 20; i++) {
    const a = await pickArticle(db, "junior", undefined, [], "釣魚");
    assert.equal(a?.series, "釣魚");
    assert.notEqual(a?.id, "fish-draft"); // 草稿不給學生
  }
});

test("系列 + 文體都指定也抽得到；該系列只剩難度不符的文章時仍留在系列內", async () => {
  const db = await setup();
  const a = await pickArticle(db, "junior", "記敘文", [], "釣魚");
  assert.equal(a?.id, "fish-b"); // 記敘文只有這篇，雖然難度 5 超出國中範圍也要放寬給它
  // 排除掉該系列僅有的兩篇後，寧可回不了文章，也不會跑去別的系列
  const none = await pickArticle(db, "junior", undefined, ["fish-a", "fish-b"], "釣魚");
  assert.equal(none?.series ?? null, "釣魚");
});

test("沒指定系列時，行為和以前一樣，各系列都可能抽到", async () => {
  const db = await setup();
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) seen.add((await pickArticle(db, "junior"))?.id ?? "");
  assert.ok(seen.size > 1);
  assert.ok(!seen.has("fish-draft"));
});

test("系列清單只列已上架、且真的有系列的文章", async () => {
  const db = await setup();
  assert.deepEqual(await listSeries(db), ["釣魚", "廚藝"]); // 依篇數多寡排序
  const list = await listArticles(db);
  assert.equal(list.find((a) => a.id === "cook-a")?.series, "廚藝");
});

test("後台可以依系列篩選，也會回傳現有的系列清單", async () => {
  const db = await setup();
  const all = await listAdminArticles(db, {});
  assert.deepEqual(all.series, ["廚藝", "釣魚"]); // 後台依名稱排序，含草稿
  const only = await listAdminArticles(db, { series: "釣魚" });
  assert.equal(only.articles.length, 3);
  assert.ok(only.articles.every((a) => a.series === "釣魚"));
});

test("編輯文章可以改系列，也可以清空", async () => {
  const db = await setup();
  await updateArticle(db, "cook-a", article({ title: "料理一", series: "釣魚" }));
  assert.equal((await getArticle(db, "cook-a"))?.series, "釣魚");
  await updateArticle(db, "cook-a", article({ title: "料理一", series: null }));
  assert.equal((await getArticle(db, "cook-a"))?.series, null);
});
