"use client";

import { useEffect, useState } from "react";
import { ApiError, type DocumentPreview } from "@/lib/api";
import { fileExtension } from "@/lib/format";
import { errorMessage } from "@/lib/useAsync";
import type { DocumentView } from "@/lib/types";
import { Button, Icon, Skeleton, Spinner } from "@/components/ui";
import s from "./package.module.scss";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  txt: "text/plain;charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

type Kind = "pdf" | "image" | "text" | "office" | "other";

const OFFICE = ["doc", "docx", "xls", "xlsx"];

function kindOf(filename: string): Kind {
  const ext = fileExtension(filename);
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg"].includes(ext)) return "image";
  if (ext === "txt") return "text";
  if (OFFICE.includes(ext)) return "office";
  return "other";
}

/** Сколько раз ждём, пока сервер подготовит версию для просмотра, прежде чем сообщить об ошибке. */
const PREVIEW_ATTEMPTS = 20;

type PreviewState =
  | { state: "loading" }
  | { state: "pending" }
  | { state: "ready"; format: "pdf" | "html"; url: string }
  | { state: "unsupported" }
  | { state: "error"; message: string };

interface Props {
  document: DocumentView;
  load: (doc: DocumentView) => Promise<Blob>;
  /** Серверная PDF/HTML-версия Office-документа. Без неё такие файлы можно только скачать. */
  loadPreview?: (doc: DocumentView) => Promise<DocumentPreview>;
}

/** Версия Office-документа для просмотра: сервер конвертирует файл, пока готовит — ждём и повторяем запрос. */
function useOfficePreview(doc: DocumentView, enabled: boolean, loadPreview?: Props["loadPreview"]): PreviewState {
  const [preview, setPreview] = useState<PreviewState>({ state: "loading" });

  useEffect(() => {
    if (!enabled) return;
    if (!loadPreview) {
      setPreview({ state: "unsupported" });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let objectUrl: string | null = null;
    setPreview({ state: "loading" });

    const attempt = (n: number) => {
      loadPreview(doc).then(
        (result) => {
          if (cancelled) return;
          if (result.state === "pending") {
            if (n >= PREVIEW_ATTEMPTS) {
              setPreview({ state: "error", message: "сервер не успел подготовить версию для просмотра, откройте документ позже" });
              return;
            }
            setPreview({ state: "pending" });
            timer = setTimeout(() => attempt(n + 1), result.retryAfterMs);
            return;
          }
          const type = result.format === "html" ? "text/html;charset=utf-8" : "application/pdf";
          objectUrl = URL.createObjectURL(new Blob([result.blob], { type }));
          setPreview({ state: "ready", format: result.format, url: objectUrl });
        },
        (e) => {
          if (cancelled) return;
          setPreview(e instanceof ApiError && e.isUnsupported ? { state: "unsupported" } : { state: "error", message: errorMessage(e) });
        },
      );
    };
    attempt(1);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc, enabled, loadPreview]);

  return preview;
}

/**
 * Оригинал документа. Backend отдаёт файл как application/octet-stream,
 * поэтому тип для предпросмотра восстанавливаем по расширению — только для отображения.
 */
export function DocumentViewer({ document: doc, load, loadPreview }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const kind = kindOf(doc.filename);
  const preview = useOfficePreview(doc, kind === "office", loadPreview);

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
            <a className={s.viewerLink} href={url} target="_blank" rel="noopener" aria-label="Открыть в новой вкладке">
              <Icon name="eye" size={18} />
            </a>
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
          <>
            <iframe className={s.viewerFrame} src={url} title={`Оригинал: ${doc.filename}`} />
            <div className={`${s.viewerEmpty} ${s.pdfMobile}`}>
              <Icon name="file" size={28} />
              <p>PDF откроется во встроенном просмотрщике устройства.</p>
              <a className={s.viewerDownload} href={url} target="_blank" rel="noopener">
                <Icon name="eye" size={18} /> Открыть PDF
              </a>
            </div>
          </>
        ) : kind === "image" ? (
          <div className={s.viewerImageWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL не обрабатывается next/image */}
            <img src={url} alt={`Скан документа ${doc.filename}`} style={{ transform: `scale(${zoom})` }} className={s.viewerImage} />
          </div>
        ) : kind === "text" ? (
          <pre className={s.viewerText}>{text}</pre>
        ) : kind === "office" ? (
          <OfficePreview preview={preview} filename={doc.filename} originalUrl={url} />
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

function OfficePreview({ preview, filename, originalUrl }: { preview: PreviewState; filename: string; originalUrl: string }) {
  const download = (
    <a className={s.viewerDownload} href={originalUrl} download={filename}>
      <Icon name="download" size={18} /> Скачать оригинал
    </a>
  );
  if (preview.state === "ready") {
    return (
      <div className={s.viewerPreview}>
        <p className={s.viewerPreviewNote}>
          <Icon name="info" size={14} /> Версия для просмотра, подготовленная сервером. Оригинал можно скачать кнопкой выше.
        </p>
        <iframe
          className={s.viewerFrame}
          src={preview.url}
          title={`Просмотр: ${filename}`}
          // HTML-версию показываем без скриптов и без доступа к странице
          sandbox={preview.format === "html" ? "" : undefined}
        />
      </div>
    );
  }
  if (preview.state === "loading" || preview.state === "pending") {
    return (
      <div className={s.viewerEmpty} role="status" aria-live="polite">
        <Spinner />
        <p>{preview.state === "pending" ? "Сервер готовит версию документа для просмотра…" : "Загружаем версию для просмотра…"}</p>
        {download}
      </div>
    );
  }
  return (
    <div className={s.viewerEmpty} role={preview.state === "error" ? "alert" : undefined}>
      <Icon name={preview.state === "error" ? "alert" : "file"} size={28} />
      <p>
        {preview.state === "error"
          ? `Не удалось подготовить документ для просмотра: ${preview.message}`
          : "Сервер пока не формирует версию этого формата для просмотра. Откройте оригинал."}
      </p>
      {download}
    </div>
  );
}
