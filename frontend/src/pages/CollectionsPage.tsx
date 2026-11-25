import { useMemo, useState } from "react";
import { CollectionCard } from "../components/CollectionCard";
import { CollectionPreview } from "../components/CollectionPreview";
import {
  MixedHeadline,
  PublicShell,
  SectionRule,
} from "../components/editorial";
import { FilterChips } from "../components/ui";
import { useCollectionTheme } from "../domain/useCollectionTheme";
import { useContent } from "../domain/useContent";
import type { CollectionView } from "../domain/types";

const themeLabels = {
  stamp: "邮票",
  editorial: "编辑排版",
  holographic: "镭射",
  cinema: "电影票根",
  boarding: "登机牌",
} as const;

interface CollectionPreviewState { item: CollectionView; source: DOMRect }

export function CollectionsPage() {
  const {
    publicCollections: all,
    publicCollectionPresentation: presentation,
    publicStatus: { collections: status },
  } = useContent();
  const [filter, setFilter] = useState("全部");
  const [preview, setPreview] = useState<CollectionPreviewState>();
  const [previewActive, setPreviewActive] = useState(false);
  const { theme, options: themeOptions, switchTheme } =
    useCollectionTheme(presentation, !status.loading && !status.error);
  const items = useMemo(
    () => all.filter((item) => filter === "全部" || item.type === filter),
    [all, filter],
  );

  return (
    <PublicShell>
      <main className={`container collectionPage${previewActive ? " collectionPageBlurred" : ""}`} data-collection-page>
        <section className="intro">
          <SectionRule index="Ⅲ." title="公开收藏" meta="文章 / 相册 / 照片" />
          <MixedHeadline>
            一些值得被多看<em>一会儿</em>的内容
          </MixedHeadline>
          <p className="lead">
            收藏由编辑部从已经发布的文章、相册与相册照片中挑选。把指针移过卡片，画面会跟随观看方向轻轻倾斜。
          </p>
        </section>
        <div className="collectionFilters">
          <FilterChips
            label="收藏类型筛选"
            options={["全部", "文章", "相册", "照片"]}
            value={filter}
            onChange={setFilter}
          />
          {!status.loading && !status.error && all.length > 0 && presentation.enabledThemes.length > 1 && (
            <div className="collectionThemeSwitch" aria-label="卡片样式">
              <span>卡片样式</span>
              {themeOptions.map((option) => (
                <button
                  type="button"
                  key={option}
                  aria-pressed={theme === option}
                  onClick={() => switchTheme(option)}
                >
                  {themeLabels[option]}
                </button>
              ))}
            </div>
          )}
          {!status.loading && !status.error && <span className="results">{items.length} 项收藏</span>}
        </div>
        {status.loading ? (
          <p className="results" role="status">
            正在加载刊物内容...
          </p>
        ) : !status.error ? (
          <section className="collectionGrid">
            {items.map((item, index) => (
              <CollectionCard key={item.id} item={item} theme={theme} index={index + 1} onPreview={(source) => { setPreview({ item, source }); setPreviewActive(true); }} />
            ))}
          </section>
        ) : null}
        <p className="error">{status.error}</p>
        {!status.loading && !status.error && items.length === 0 && (
          <MixedHeadline as="h2">
            本期收藏正在<em>编排</em>
          </MixedHeadline>
        )}
      </main>
      {preview && <CollectionPreview item={preview.item} source={preview.source} theme={theme} index={items.findIndex(item => item.id === preview.item.id) + 1} onClosing={() => setPreviewActive(false)} onClose={() => { setPreview(undefined); setPreviewActive(false); }} />}
    </PublicShell>
  );
}
