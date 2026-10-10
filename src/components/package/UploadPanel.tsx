"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { config } from "@/lib/config";
import { typeTitle } from "@/lib/documentTypes";
import { formatFileSize } from "@/lib/format";
import { errorMessage } from "@/lib/useAsync";
import { validateFile } from "@/lib/validation";
import type { DocumentTypeCode, DocumentView } from "@/lib/types";
import { Button, Icon, SelectField } from "@/components/ui";
import s from "./package.module.scss";

type QueueStatus = "ready" | "uploading" | "done" | "error";

interface QueueItem {
  key: string;
  file: File;
  type: DocumentTypeCode | "";
  status: QueueStatus;
  error?: string;
}

interface Props {
  types: DocumentTypeCode[];
  upload: (file: File, type: DocumentTypeCode | null) => Promise<DocumentView>;
  onUploaded: (docs: DocumentView[]) => void;
  compact?: boolean;
}

let keySeq = 0;

export function UploadPanel({ types, upload, onUploaded, compact }: Props) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const addFiles = (files: FileList | File[]) => {
    const items = Array.from(files).map<QueueItem>((file) => {
      const error = validateFile(file);
      return { key: `f${++keySeq}`, file, type: "", status: error ? "error" : "ready", error: error ?? undefined };
    });
    setQueue((q) => [...q.filter((i) => i.status !== "done"), ...items]);
  };

  const patch = (key: string, data: Partial<QueueItem>) =>
    setQueue((q) => q.map((i) => (i.key === key ? { ...i, ...data } : i)));

  const pending = queue.filter((i) => i.status === "ready");

  const uploadAll = async () => {
    setBusy(true);
    const uploaded: DocumentView[] = [];
    // последовательно — сервер обрабатывает файлы по одному и пересчитывает лимиты
    for (const item of pending) {
      patch(item.key, { status: "uploading", error: undefined });
      try {
        uploaded.push(await upload(item.file, item.type || null));
        patch(item.key, { status: "done" });
      } catch (e) {
        patch(item.key, { status: "error", error: errorMessage(e) });
      }
    }
    setBusy(false);
    if (uploaded.length) onUploaded(uploaded);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const typeOptions = [{ value: "", label: "Определить по содержимому" }, ...types.map((t) => ({ value: t, label: typeTitle(t) }))];

  return (
    <section className={s.uploadPanel} id="upload" aria-label="Загрузка документов">
      <div
        className={s.dropzone}
        data-dragging={dragging}
        data-compact={compact}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        aria-label="Перетащите файлы или нажмите, чтобы выбрать"
      >
        <motion.span
          className={s.dropIcon}
          animate={dragging ? { scale: 1.15, y: -4 } : { scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 18 }}
        >
          <Icon name="upload" size={compact ? 22 : 28} />
        </motion.span>
        <div>
          <p className={s.dropTitle}>{dragging ? "Отпустите файлы" : "Перетащите документы сюда"}</p>
          <p className={s.dropHint}>
            или <span className={s.dropLink}>выберите на устройстве</span> · можно сразу несколько файлов · {config.acceptedFormatsLabel} до {config.maxFileMb} МБ
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept={config.acceptedExtensions.map((e) => `.${e}`).join(",")}
          data-testid="file-input"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <AnimatePresence initial={false}>
        {queue.length > 0 && (
          <motion.div
            className={s.queue}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <p className={s.queueNote}>
              <Icon name="sparkle" size={16} /> Тип каждого файла определит сервер по содержимому, а не по имени. Указывать тип
              не обязательно{config.autoClassify ? "" : ": выберите его, только если уверены"}. Ход обработки виден в списке документов.
            </p>
            <ul className={s.queueList}>
              <AnimatePresence initial={false}>
                {queue.map((item) => (
                  <motion.li
                    key={item.key}
                    className={s.queueItem}
                    data-status={item.status}
                    layout
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                  >
                    <span className={s.queueIcon}>
                      <Icon name={item.status === "done" ? "check" : item.status === "error" ? "alert" : "file"} size={18} />
                    </span>
                    <div className={s.queueInfo}>
                      <span className={s.queueName}>{item.file.name}</span>
                      <span className={item.status === "error" ? s.queueError : s.queueMeta}>
                        {item.status === "error"
                          ? item.error
                          : item.status === "done"
                            ? "Принят"
                            : item.status === "uploading"
                              ? "Загрузка…"
                              : formatFileSize(item.file.size)}
                      </span>
                      {item.status === "uploading" && <span className={s.progress} />}
                    </div>
                    {!config.autoClassify && item.status === "ready" && (
                      <div className={s.queueType}>
                        <SelectField
                          label={`Тип документа для ${item.file.name}`}
                          hideLabel
                          options={typeOptions}
                          value={item.type}
                          onChange={(e) => patch(item.key, { type: e.target.value })}
                        />
                      </div>
                    )}
                    {item.status !== "uploading" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        iconOnly
                        icon="close"
                        aria-label={`Убрать ${item.file.name}`}
                        onClick={() => setQueue((q) => q.filter((i) => i.key !== item.key))}
                      />
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            <div className={s.queueActions}>
              <Button icon="upload" onClick={uploadAll} loading={busy} disabled={pending.length === 0}>
                Загрузить {pending.length > 0 ? `(${pending.length})` : ""}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
