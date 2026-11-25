import { useState } from "react";
import { CollectionCard } from "../components/CollectionCard";
import { AlbumCard, ArticleCard, MixedHeadline, SectionRule } from "../components/editorial";
import { Button, Dialog, FilterChips, SelectField, StatusPill, TextField } from "../components/ui";
import { useContent } from "../domain/useContent";
import { getAlbumCover } from "../domain/repository";

export function ComponentsPage() {
  const { publicArticles, publicAlbums, publicCollections } = useContent();
  const article = publicArticles[0];
  const album = publicAlbums[0];
  const collection = publicCollections[0];
  const [filter, setFilter] = useState("全部");
  const [dialog, setDialog] = useState(false);

  return (
    <main className="container componentsPage">
      <p className="eyebrow">DESIGN SYSTEM / LIVE</p>
      <MixedHeadline>
        林间刊物的<em>组件档案</em>
      </MixedHeadline>
      <p className="lead">Tokens → Primitives → Composites → Patterns。此页面不进入公开导航。</p>
      <section className="componentSection">
        <h2>Tokens</h2>
        <div className="componentCanvas" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {["paper", "ink", "coral", "mustard", "olive", "bone"].map((color) => (
            <div
              key={color}
              style={{
                width: 120,
                height: 80,
                padding: 10,
                background: `var(--${color})`,
                color: color === "ink" ? "var(--paper)" : "var(--ink)",
              }}
            >
              {color}
            </div>
          ))}
        </div>
      </section>
      <section className="componentSection">
        <h2>Primitives</h2>
        <div className="componentCanvas formStack">
          <div>
            <Button>主要按钮</Button> <Button variant="secondary">次要按钮</Button>{" "}
            <Button variant="danger">危险动作</Button>
          </div>
          <TextField label="文本输入" placeholder="输入内容" />
          <SelectField label="选择框">
            <option>默认选项</option>
          </SelectField>
          <div>
            <StatusPill status="published" /> <StatusPill status="scheduled" />{" "}
            <StatusPill status="draft" /> <StatusPill status="private" />
          </div>
          <Button onClick={() => setDialog(true)}>打开 Dialog</Button>
        </div>
      </section>
      <section className="componentSection">
        <h2>Composites</h2>
        <div className="componentCanvas">
          <SectionRule index="Ⅱ." title="版块分隔" meta="组件状态" />
          <br />
          <FilterChips
            label="组件筛选"
            options={["全部", "文章", "相册"]}
            value={filter}
            onChange={setFilter}
          />
          <p>当前筛选：{filter}</p>
        </div>
      </section>
      <section className="componentSection">
        <h2>Patterns</h2>
        <div className="articleGrid">{article && <ArticleCard article={article} />}</div>
        {album && (
          <div className="albumGrid">
            <AlbumCard album={album} cover={getAlbumCover(album)} onOpen={() => {}} />
          </div>
        )}
        {collection && (
          <div className="componentCollectionThemes">
            <CollectionCard item={collection} theme="stamp" />
            <CollectionCard item={collection} theme="editorial" />
            <CollectionCard item={collection} theme="holographic" />
            <CollectionCard item={collection} theme="cinema" />
            <CollectionCard item={collection} theme="boarding" />
          </div>
        )}
      </section>
      {dialog && (
        <Dialog
          title="Dialog 交互状态"
          onClose={() => setDialog(false)}
          actions={<Button onClick={() => setDialog(false)}>关闭</Button>}
        >
          <p>支持遮罩点击和 Escape 键关闭。</p>
        </Dialog>
      )}
    </main>
  );
}
