"use client";

import { setPref } from "@/lib/client";
import type { Article } from "@/lib/db";
import { ReadAloudBar, type useReadAloud } from "./speech";

/** 練習頁左側的文章區（進階與基礎共用） */
export function ArticleReader({
  article,
  reader,
  hideArticle,
  onHideChange,
  highlight,
}: {
  article: Article;
  reader: ReturnType<typeof useReadAloud>;
  hideArticle: boolean;
  onHideChange: (v: boolean) => void;
  highlight: string | null;
}) {
  return (
    <article className={`reader card ${hideArticle ? "collapsed" : ""}`}>
      <div className="reader-head">
        <div>
          <h1>{article.title}</h1>
          <p className="meta">
            {article.era}・{article.author}・{article.genre}・約 {article.charCount} 字
          </p>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={hideArticle}
            onChange={(e) => {
              onHideChange(e.target.checked);
              setPref("closedBook", e.target.checked ? "1" : "0");
            }}
          />
          蓋起原文
        </label>
      </div>
      <ReadAloudBar ctl={reader} />
      {!hideArticle && (
        <div className="text">
          {article.paragraphs.map((p) => (
            <p
              key={p.id}
              id={`para-${p.id}`}
              className={[highlight === p.id ? "hl" : "", reader.current === p.id ? "reading" : ""].join(" ")}
            >
              {reader.supported ? (
                <button type="button" className="pid" onClick={() => reader.play(p.id)} title={`從 ${p.id} 開始朗讀`}>
                  {p.id}
                </button>
              ) : (
                <span className="pid">{p.id}</span>
              )}
              {p.text}
            </p>
          ))}
        </div>
      )}
      <p className="source">
        {article.license === "public-domain" ? "公有領域作品" : article.license}
        {article.url && (
          <>
            ・<a href={article.url} target="_blank" rel="noreferrer">原文出處</a>
          </>
        )}
      </p>
    </article>
  );
}
