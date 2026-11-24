import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import type {
  CollectionCardTheme,
  CollectionView,
} from "../domain/types";

const securityLabels = [
  "林间防伪 · 07",
  "SECURE · 031",
  "林间防伪 · 07",
  "OPTICAL KEY",
  "林间刊物 · 07",
  "VALID · 031",
  "林间防伪 · 07",
  "SECURE · 031",
  "林间防伪 · 07",
  "OPTICAL KEY",
  "林间刊物 · 07",
  "VALID · 031",
  "林间防伪 · 07",
  "SECURE · 031",
  "林间防伪 · 07",
  "OPTICAL KEY",
  "林间刊物 · 07",
  "VALID · 031",
];

function CollectionSecurityLabels() {
  return (
    <div className="collectionSecurityText" data-security-text aria-hidden="true">
      {securityLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
    </div>
  );
}

function ticketNumber(item: CollectionView) {
  return [...item.id].reduce((value, character) => (value * 31 + character.charCodeAt(0)) % 997, 17) + 1;
}

function CinemaTicket({ item }: { item: CollectionView }) {
  const number = ticketNumber(item);
  const seat = `${String.fromCharCode(65 + (number % 7))} · ${String((number % 24) + 1).padStart(2, "0")}`;
  return (
    <div className="collectionCinemaTicket" data-cinema-ticket role="img" aria-label={`电影票根：${item.title}，${item.type}，座位 ${seat}`}>
      <div className="collectionTicketImage" data-ticket-image><img src={item.image} alt="" /></div>
      <div className="collectionCinemaHead"><span>林间艺术影院 · 一号厅</span><b>{item.type === "文章" ? "PG" : "G"}</b></div>
      <div className="collectionCinemaTitle"><span>特别展映 · 本期收藏</span><strong>{item.title}</strong></div>
      <div className="collectionCinemaStub">
        <div><small>票种 / 场次</small><b>{item.type.toUpperCase()} · {String(18 + (number % 5)).padStart(2, "0")}:30</b></div>
        <div><small>影厅 / 座位</small><b>AUD 01 · {seat}</b></div>
        <div className="collectionTicketCode"><i className="collectionTicketBarcode" /><span>TKT 07{String(number).padStart(3, "0")}</span></div>
      </div>
    </div>
  );
}

function BoardingPass({ item }: { item: CollectionView }) {
  const number = ticketNumber(item);
  const destination = item.sourceType === "article" ? "ART" : item.sourceType === "album" ? "ALB" : "IMG";
  return (
    <div className="collectionBoardingPass" data-boarding-pass role="img" aria-label={`收藏登机牌：${item.title}，林间收藏，${item.type}`}>
      <div className="collectionBoardingBand" />
      <div className="collectionBoardingImage" data-boarding-image>
        <img src={item.image} alt="" />
        <div className="collectionBoardingHead"><span>林间航空 · COLLECTION PASS</span><b>LJ {String(number).padStart(3, "0")}</b></div>
      </div>
      <div className="collectionBoardingMain">
        <div>
          <div className="collectionBoardingRoute"><strong>LIN</strong><i /><strong>{destination}</strong></div>
          <div className="collectionBoardingCities"><span>林间收藏</span><span>{item.type}</span></div>
        </div>
        <p>{item.title}</p>
      </div>
      <div className="collectionBoardingStub">
        <div className="collectionBoardingGrid">
          <div><small>登机口</small><b>G{String((number % 18) + 1).padStart(2, "0")}</b></div>
          <div><small>登机时间</small><b>{String((number % 12) + 8).padStart(2, "0")}:20</b></div>
          <div><small>座位</small><b className="collectionBoardingSeat">{String((number % 28) + 1).padStart(2, "0")}A</b></div>
        </div>
        <div className="collectionBoardingFoot"><div><small>持票人</small><b>林间读者 / READER</b></div><i className="collectionTicketBarcode" /></div>
      </div>
    </div>
  );
}

export function CollectionCard({
  item,
  theme,
  preview = false,
  index,
  onPreview,
}: {
  item: CollectionView;
  theme: CollectionCardTheme;
  preview?: boolean;
  index?: number;
  onPreview?: (source: DOMRect) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const reset = useCallback(() => {
    stageRef.current?.style.setProperty("--collection-rx", "0deg");
    stageRef.current?.style.setProperty("--collection-ry", "0deg");
    stageRef.current?.style.setProperty("--collection-pointer-x", "50%");
    stageRef.current?.style.setProperty("--collection-pointer-y", "50%");
    stageRef.current?.style.setProperty("--collection-pointer-center", "0");
    stageRef.current?.style.setProperty("--collection-background-x", "50%");
    stageRef.current?.style.setProperty("--collection-background-y", "50%");
    stageRef.current?.style.setProperty("--collection-label-a", "0.34");
    stageRef.current?.style.setProperty("--collection-label-b", "0.12");
    stageRef.current?.style.setProperty("--collection-watermark-opacity", "0.38");
    stageRef.current?.style.setProperty("--collection-spectrum-x", "50%");
    stageRef.current?.style.setProperty("--collection-hue", "0deg");
    stageRef.current?.style.setProperty("--collection-shadow-x", "0px");
    stageRef.current?.style.setProperty("--collection-shadow-y", "8px");
    stageRef.current?.style.setProperty("--collection-sheen-shift", "0%");
  }, []);
  useEffect(reset, [reset, theme]);
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (
      event.pointerType !== "mouse" ||
      !matchMedia(
        "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
      ).matches
    )
      return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    stageRef.current?.style.setProperty("--collection-rx", `${y * -8}deg`);
    stageRef.current?.style.setProperty("--collection-ry", `${x * 8}deg`);
    stageRef.current?.style.setProperty("--collection-shadow-x", `${x * -14}px`);
    stageRef.current?.style.setProperty("--collection-shadow-y", `${8 + y * -8}px`);
    stageRef.current?.style.setProperty("--collection-sheen-shift", `${x * 24}%`);
    stageRef.current?.style.setProperty("--collection-pointer-x", `${(x + 0.5) * 100}%`);
    stageRef.current?.style.setProperty("--collection-pointer-y", `${(y + 0.5) * 100}%`);
    stageRef.current?.style.setProperty("--collection-pointer-center", `${Math.min(1, Math.hypot(x, y) * 2)}`);
    stageRef.current?.style.setProperty("--collection-background-x", `${50 + x * 30}%`);
    stageRef.current?.style.setProperty("--collection-background-y", `${50 + y * 30}%`);
    const angle = x * 2;
    const angleVisibility = Math.abs(angle);
    const verticalPhase = Math.abs(y) * 2;
    stageRef.current?.style.setProperty("--collection-label-a", `${0.2 + angleVisibility * 0.68}`);
    stageRef.current?.style.setProperty("--collection-label-b", `${0.08 + verticalPhase * 0.5}`);
    stageRef.current?.style.setProperty("--collection-watermark-opacity", `${0.2 + Math.max(angleVisibility, verticalPhase) * 0.72}`);
    stageRef.current?.style.setProperty("--collection-spectrum-x", `${50 + angle * 44}%`);
    stageRef.current?.style.setProperty("--collection-hue", `${angle * 105 - y * 70}deg`);
  };

  return (
    <div
      ref={stageRef}
      className="collectionCardStage"
      onPointerMove={move}
      onPointerLeave={() => {
        reset();
      }}
      onBlur={reset}
      {...(preview ? { "data-collection-preview": "" } : {})}
      data-theme={theme}
    >
      {onPreview ? <button className="collectionCardLink collectionCardButton" type="button" onClick={(event) => onPreview(event.currentTarget.getBoundingClientRect())} data-collection-card data-theme={theme} aria-label={`预览收藏：${item.title}`}>
        <article className="collectionCardSurface">
          <CollectionSecurityLabels />
          <CinemaTicket item={item} />
          <BoardingPass item={item} />
          <div className="collectionCardImage">
            <img src={item.image} alt={item.alt} />
          </div>
          <div className="collectionCardContent">
            <span className="collectionCardIndex">
              {item.type} / {String(index ?? 1).padStart(2, "0")}
            </span>
            <span className="meta">{item.note}</span>
            <h2>{item.title}</h2>
            <p>{item.meta}</p>
            <span className="collectionCardAction">预览卡片 ↗</span>
          </div>
        </article>
      </button> : <div className="collectionCardLink" data-collection-card data-theme={theme}>
        <article className="collectionCardSurface">
          <CollectionSecurityLabels />
          <CinemaTicket item={item} />
          <BoardingPass item={item} />
          <div className="collectionCardImage"><img src={item.image} alt={item.alt} /></div>
          <div className="collectionCardContent">
            <span className="collectionCardIndex">{item.type} / {String(index ?? 1).padStart(2, "0")}</span>
            <span className="meta">{item.note}</span><h2>{item.title}</h2><p>{item.meta}</p>
            <span className="collectionCardAction">收藏预览</span>
          </div>
        </article>
      </div>}
    </div>
  );
}
