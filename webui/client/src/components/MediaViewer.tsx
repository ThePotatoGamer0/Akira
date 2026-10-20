import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ViewMedia = {
  src: string;
  name: string;
  avatar: string;
  app: boolean;
  time: string;
  color: string;
};

function stamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((startToday.getTime() - startDate.getTime()) / 86_400_000);
  if (days === 0) return `Today at ${time}`;
  if (days === 1) return `Yesterday at ${time}`;
  const day = date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  return `${day} at ${time}`;
}

function blobToPng(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 1;
      canvas.height = img.naturalHeight || 1;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((out) => {
        URL.revokeObjectURL(url);
        if (out) resolve(out);
        else reject(new Error("png"));
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}

async function copyImage(src: string): Promise<"image" | "link"> {
  const png = (async () => {
    const res = await fetch(src);
    if (!res.ok) throw new Error("fetch");
    const blob = await res.blob();
    if (blob.type === "image/png") return blob;
    return blobToPng(blob);
  })();
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return "image";
  } catch {
    await navigator.clipboard.writeText(src);
    return "link";
  }
}

function IconZoom() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.25" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M15.2 15.2 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconOpen() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M14 5h5v5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 5 10 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 13.5V19H5V6h5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M5 15V5h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MediaViewer(props: { media: ViewMedia; onClose: () => void }) {
  const { media, onClose } = props;
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [copied, setCopied] = useState<"image" | "link" | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const when = stamp(media.time);

  return createPortal(
    <div className="media-viewer" role="dialog" aria-modal="true" aria-label={media.name || "Image"} onClick={onClose}>
      <header className="media-viewer-bar" onClick={(event) => event.stopPropagation()}>
        <div className="media-viewer-who">
          {media.avatar ? <img src={media.avatar} alt="" /> : <span className="media-viewer-avatar" />}
          <strong style={media.color ? { color: media.color } : undefined}>{media.name}</strong>
          {media.app ? <span className="dlog-app">APP</span> : null}
          {when ? <time dateTime={media.time}>{when}</time> : null}
        </div>
        <div className="media-viewer-tools">
          <button type="button" aria-pressed={zoomed} aria-label={zoomed ? "Zoom out" : "Zoom in"} onClick={() => setZoomed((value) => !value)}>
            <IconZoom />
          </button>
          <button
            type="button"
            aria-label="Open in new tab"
            onClick={() => window.open(media.src, "_blank", "noopener,noreferrer")}
          >
            <IconOpen />
          </button>
          <button
            type="button"
            aria-label={copied === "image" ? "Copied" : copied === "link" ? "Link copied" : "Copy image"}
            onClick={() => {
              void copyImage(media.src).then((kind) => {
                setCopied(kind);
                window.setTimeout(() => setCopied(null), 1600);
              });
            }}
          >
            <IconCopy />
          </button>
        </div>
      </header>
      <div
        className={zoomed ? "media-viewer-stage is-zoomed" : "media-viewer-stage"}
        ref={stage}
        onClick={(event) => {
          event.stopPropagation();
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <img
          src={media.src}
          alt=""
          draggable={false}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const box = stage.current;
            if (!box) return;
            drag.current = { x: event.clientX, y: event.clientY, left: box.scrollLeft, top: box.scrollTop, moved: false };
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            const box = stage.current;
            if (!start || !box || !zoomed) return;
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            if (Math.hypot(dx, dy) > 4) start.moved = true;
            box.scrollLeft = start.left - dx;
            box.scrollTop = start.top - dy;
          }}
          onPointerUp={() => {
            const start = drag.current;
            drag.current = null;
            if (start && !start.moved) setZoomed((value) => !value);
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
