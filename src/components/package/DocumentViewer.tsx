"use client";

import { useEffect, useState } from "react";
import { fileExtension } from "@/lib/format";
import { errorMessage } from "@/lib/useAsync";
import type { DocumentView } from "@/lib/types";
import { Button, Icon, Skeleton } from "@/components/ui";
import s from "./package.module.scss";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  txt: "text/plain;charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

type Kind = "pdf" | "image" | "text" | "other";

function kindOf(filename: string): Kind {
  const ext = fileExtension(filename);
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg"].includes(ext)) return "image";
  if (ext === "txt") return "text";
  return "other";
}

interface Props {
  document: DocumentView;
  load: (doc: DocumentView) => Promise<Blob>;
}

/**
 * Оригинал документа. Backend отдаёт файл как application/octet-stream,
 * поэтому тип для предпросмотра восстанавливаем по расширению — только для отображения.
 */
export function DocumentViewer({ document: doc, load }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const kind = kindOf(doc.filename);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setText(null);
    setError(null);
    setZoom(1);
    load(doc)
      .then(async (blob) => {
        if (cancelled) return;
        const typed = new Blob([blob], { type: MIME[fileExtension(doc.filename)] ?? "application/octet-stream" });
        if (kind === "text") setText(await typed.text());
        objectUrl = URL.createObjectURL(typed);
        setUrl(objectUrl);
      })
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc, load, kind]);

  return (
    <section className={s.viewer} aria-label="Оригинал документа">
      <div className={s.viewerBar}>
        <span className={s.viewerName} title={doc.filename}>
          <Icon name="file" size={16} /> {doc.filename}
        </span>
        <div className={s.viewerTools}>
          {kind === "image" && url && (
            <>
              <Button variant="ghost" size="sm" iconOnly aria-label="Уменьшить" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
                −
              </Button>
              <span className={s.zoom}>{Math.round(zoom * 100)}%</span>
              <Button variant="ghost" size="sm" iconOnly aria-label="Увеличить" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>
                +
              </Button>
            </>
          )}
          {url && (
            <a className={s.viewerLink} href={url} download={doc.filename} aria-label="Скачать оригинал">
              <Icon name="download" size={18} />
            </a>
          )}
        </div>
      </div>

      <div className={s.viewerBody}>
        {error ? (
          <div className={s.viewerEmpty} role="alert">
            <Icon name="alert" size={28} />
            <p>Не удалось открыть файл: {error}</p>
          </div>
        ) : !url ? (
          <div className={s.viewerLoading} aria-busy="true">
            <Skeleton height="70%" width="80%" radius={12} />
          </div>
        ) : kind === "pdf" ? (
          <iframe className={s.viewerFrame} src={url} title={`Оригинал: ${doc.filename}`} />
        ) : kind === "image" ? (
          <div className={s.viewerImageWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL не обрабатывается next/image */}
            <img src={url} alt={`Скан документа ${doc.filename}`} style={{ transform: `scale(${zoom})` }} className={s.viewerImage} />
          </div>
        ) : kind === "text" ? (
          <pre className={s.viewerText}>{text}</pre>
        ) : (
          <div className={s.viewerEmpty}>
            <Icon name="file" size={28} />
            <p>Предпросмотр этого формата недоступен в браузере.</p>
            <a className={s.viewerDownload} href={url} download={doc.filename}>
              <Icon name="download" size={18} /> Скачать файл
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
