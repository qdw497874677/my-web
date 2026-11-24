import { useEffect, useMemo, useState } from "react";
import { CollectionCard } from "../components/CollectionCard";
import { AdminShell, MixedHeadline } from "../components/editorial";
import { Button, SelectField } from "../components/ui";
import {
  buildCollectionCatalog,
  keyOf,
  moveCollectionReference,
  previewCollection,
  toggleCollectionReference,
  toggleCollectionTheme,
  toReference,
  updateCollectionReference,
  type CollectionCatalogItem,
} from "../domain/collections";
import { useContent } from "../domain/useContent";
import type {
  CollectionCardTheme,
  CollectionPresentation,
  CollectionReference,
  CollectionView,
} from "../domain/types";

const labels: Record<CollectionCardTheme, string> = {
  stamp: "邮票",
  editorial: "编辑排版",
  holographic: "镭射",
  cinema: "电影票根",
  boarding: "登机牌",
};
function CollectionPresentationPanel({
  presentation,
  preview,
  onChange,
}: {
  presentation: CollectionPresentation;
  preview?: CollectionView;
  onChange: (presentation: CollectionPresentation) => void;
}) {
  return (
    <section className="panel collectionPresentationPanel">
      <div className="panelHead">
        <h2>展示策略</h2>
        <span>至少启用一个主题</span>
      </div>
      <div className="collectionThemeConfig">
        <label>
          <input
            type="checkbox"
            checked={presentation.enabledThemes.includes("stamp")}
            onChange={(event) =>
              onChange(
                toggleCollectionTheme(
                  presentation,
                  "stamp",
                  event.target.checked,
                ),
              )
            }
          />
          启用邮票主题
        </label>
        <label>
          <input
            type="checkbox"
            checked={presentation.enabledThemes.includes("editorial")}
            onChange={(event) =>
              onChange(
                toggleCollectionTheme(
                  presentation,
                  "editorial",
                  event.target.checked,
                ),
              )
            }
          />
          启用编辑排版主题
        </label>
        <label>
          <input
            type="checkbox"
            checked={presentation.enabledThemes.includes("holographic")}
            onChange={(event) =>
              onChange(
                toggleCollectionTheme(
                  presentation,
                  "holographic",
                  event.target.checked,
                ),
              )
            }
          />
          启用镭射主题
        </label>
        <label>
          <input
            type="checkbox"
            checked={presentation.enabledThemes.includes("cinema")}
            onChange={(event) => onChange(toggleCollectionTheme(presentation, "cinema", event.target.checked))}
          />
          启用电影票根主题
        </label>
        <label>
          <input
            type="checkbox"
            checked={presentation.enabledThemes.includes("boarding")}
            onChange={(event) => onChange(toggleCollectionTheme(presentation, "boarding", event.target.checked))}
          />
          启用登机牌主题
        </label>
        <SelectField
          label="默认主题"
          value={presentation.defaultTheme}
          onChange={(event) =>
            onChange({
              ...presentation,
              defaultTheme: event.target.value as CollectionCardTheme,
            })
          }
        >
          {presentation.enabledThemes.map((theme) => (
            <option value={theme} key={theme}>
              {labels[theme]}
            </option>
          ))}
        </SelectField>
      </div>
      {preview && (
        <div className="collectionPreview">
          <p className="meta">真实收藏卡片即时预览</p>
          <CollectionCard
            item={preview}
            theme={presentation.defaultTheme}
            preview
            index={1}
          />
        </div>
      )}
    </section>
  );
}

function CollectionCatalogPanel({
  catalog,
  selected,
  onToggle,
}: {
  catalog: CollectionCatalogItem[];
  selected: CollectionReference[];
  onToggle: (reference: CollectionReference) => void;
}) {
  const selectedKeys = new Set(selected.map(keyOf));
  return (
    <section className="panel">
      <div className="panelHead">
        <h2>可选内容</h2>
        <span>{catalog.length} 项</span>
      </div>
      {catalog.map((item) => (
        <article className="catalogItem" key={keyOf(item.reference)}>
          <img src={item.image} alt="" />
          <div>
            <h3>{item.title}</h3>
            <p>{item.type}</p>
          </div>
          <Button variant="secondary" onClick={() => onToggle(item.reference)}>
            {selectedKeys.has(keyOf(item.reference)) ? "移出收藏" : "加入收藏"}
          </Button>
        </article>
      ))}
    </section>
  );
}

function CollectionOrderPanel({
  selected,
  message,
  onChange,
  onMove,
  onSave,
}: {
  selected: CollectionReference[];
  message: string;
  onChange: (
    index: number,
    changes: Partial<Pick<CollectionReference, "note" | "visible">>,
  ) => void;
  onMove: (index: number, offset: number) => void;
  onSave: () => void;
}) {
  return (
    <section className="panel">
      <div className="panelHead">
        <h2>当前收藏顺序</h2>
        <span>{selected.length} 项</span>
      </div>
      {selected.map((item, index) => (
        <article className="catalogItem" key={keyOf(item)}>
          <strong>{String(index + 1).padStart(2, "0")}</strong>
          <input
            aria-label={`第 ${index + 1} 项说明`}
            value={item.note}
            onChange={(event) =>
              onChange(index, { note: event.target.value })
            }
          />
          <label>
            <input
              type="checkbox"
              checked={item.visible !== false}
              onChange={(event) =>
                onChange(index, { visible: event.target.checked })
              }
            />
            公开
          </label>
          <div>
            <button
              className="ghost"
              disabled={index === 0}
              onClick={() => onMove(index, -1)}
            >
              上移
            </button>
            <button
              className="ghost"
              disabled={index === selected.length - 1}
              onClick={() => onMove(index, 1)}
            >
              下移
            </button>
          </div>
        </article>
      ))}
      <Button onClick={onSave}>保存收藏</Button>
      <p aria-live="polite">{message}</p>
    </section>
  );
}

export function AdminCollectionsPage() {
  const {
    adminArticles,
    adminAlbums,
    adminCollections,
    adminCollectionPresentation,
    saveCollections,
  } = useContent();
  const [selected, setSelected] = useState<CollectionReference[]>([]);
  const [presentation, setPresentation] = useState<CollectionPresentation>({
    defaultTheme: "stamp",
    enabledThemes: ["stamp", "editorial", "holographic", "cinema", "boarding"],
  });
  const [message, setMessage] = useState("");
  useEffect(() => {
    setSelected(adminCollections.map(toReference));
    setPresentation(adminCollectionPresentation);
  }, [adminCollections, adminCollectionPresentation]);
  const catalog = useMemo(
    () => buildCollectionCatalog(adminArticles, adminAlbums),
    [adminArticles, adminAlbums],
  );
  const preview = previewCollection(selected, catalog, adminCollections);
  const save = async () => {
    setMessage("");
    try {
      await saveCollections(selected, presentation);
      setMessage("收藏与展示策略已保存");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "保存失败，请稍后重试。",
      );
    }
  };
  return (
    <AdminShell title="收藏编排" viewTo="/collections">
      <section className="adminHeading">
        <div>
          <p className="eyebrow">COLLECTION DESK</p>
          <MixedHeadline>
            决定哪些内容值得<em>再看</em>
          </MixedHeadline>
        </div>
      </section>
      <CollectionPresentationPanel
        presentation={presentation}
        preview={preview}
        onChange={setPresentation}
      />
      <div className="workspace">
        <CollectionCatalogPanel
          catalog={catalog}
          selected={selected}
          onToggle={(reference) =>
            setSelected((current) =>
              toggleCollectionReference(current, reference),
            )
          }
        />
        <CollectionOrderPanel
          selected={selected}
          message={message}
          onChange={(index, changes) =>
            setSelected((current) =>
              updateCollectionReference(current, index, changes),
            )
          }
          onMove={(index, offset) =>
            setSelected((current) =>
              moveCollectionReference(current, index, offset),
            )
          }
          onSave={() => void save()}
        />
      </div>
    </AdminShell>
  );
}
