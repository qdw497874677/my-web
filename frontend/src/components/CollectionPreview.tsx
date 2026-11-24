import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import type { CollectionCardTheme, CollectionView } from "../domain/types";
import { CollectionCard } from "./CollectionCard";

export function CollectionPreview({ item, theme, index, source, onClosing, onClose }: { item: CollectionView; theme: CollectionCardTheme; index: number; source: DOMRect; onClosing: () => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"entering" | "open" | "closing">("entering");
  const close = useCallback(() => setPhase((current) => {
    if (current === "closing") return current;
    onClosing();
    return "closing";
  }), [onClosing]);
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const target = card.getBoundingClientRect();
    card.style.setProperty("--preview-from-x", `${source.left + source.width / 2 - (target.left + target.width / 2)}px`);
    card.style.setProperty("--preview-from-y", `${source.top + source.height / 2 - (target.top + target.height / 2)}px`);
    card.style.setProperty("--preview-from-scale", String(source.width / target.width));
    requestAnimationFrame(() => setPhase("open"));
  }, [source]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const keydown = (event: KeyboardEvent) => event.key === "Escape" && close();
    addEventListener("keydown", keydown);
    return () => { removeEventListener("keydown", keydown); document.body.style.overflow = overflow; previous?.focus(); };
  }, [close]);
  useEffect(() => {
    if (phase !== "closing") return;
    const timer = window.setTimeout(onClose, 300);
    return () => clearTimeout(timer);
  }, [onClose, phase]);

  return createPortal(
    <div className="collectionPreviewBackdrop" data-phase={phase} onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div ref={dialogRef} className="collectionPreviewDialog" role="dialog" aria-modal="true" aria-label={`收藏预览：${item.title}`} tabIndex={-1} data-closing={phase === "closing" ? "true" : "false"}>
        <div ref={cardRef} className="collectionPreviewCard" data-phase={phase}>
          <CollectionCard item={item} theme={theme} index={index} preview />
        </div>
        <div className="collectionPreviewActions">
          <button className="collectionPreviewClose" type="button" onClick={close} aria-label="关闭收藏预览">关闭预览</button>
          <Link className="collectionPreviewOpen" to={item.href}>打开内容</Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}
