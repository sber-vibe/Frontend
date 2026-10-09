"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { selectableTypes } from "@/lib/documentTypes";
import { formatMoney, pluralize } from "@/lib/format";
import { effectiveType, reportStatusView } from "@/lib/presentation";
import { errorMessage, useAsync } from "@/lib/useAsync";
import type { ApplicationView, DocumentTypeCode, DocumentView } from "@/lib/types";
import { BackLink } from "@/components/BackLink";
import { Badge, Button, ButtonLink, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { DocumentDetails } from "./DocumentDetails";
import { DocumentList } from "./DocumentList";
import { DocumentViewer } from "./DocumentViewer";
import { UploadPanel } from "./UploadPanel";
import s from "./package.module.scss";

type MobileTab = "original" | "details";

export function PackageWorkspace({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { data, error, loading, reload, mutate } = useAsync(
    () => Promise.all([api.getApplication(id), api.documentTypes().catch(() => [] as string[])]),
    [id],
  );
  const app = data?.[0];
  const types = useMemo(() => selectableTypes(data?.[1] ?? []), [data]);

  const [selectedId, setSelectedId] = useState<string | null>(params.get("doc"));
  const [tab, setTab] = useState<MobileTab>("original");
  const [toDelete, setToDelete] = useState<DocumentView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [checking, setChecking] = useState(false);
  const blobs = useRef(new Map<string, Promise<Blob>>());

  const setApp = useCallback(
    (update: (a: ApplicationView) => ApplicationView) => mutate(([a, t]) => [update(a), t]),
    [mutate],
  );

  // если выбранного документа нет (удалён или ещё не выбран) — выбираем первый
  useEffect(() => {
    if (!app) return;
    if (!selectedId || !app.documents.some((d) => d.id === selectedId)) {
      setSelectedId(app.documents[0]?.id ?? null);
    }
  }, [app, selectedId]);

  const loadBlob = useCallback(
    (doc: DocumentView) => {
      let p = blobs.current.get(doc.id);
      if (!p) {
        p = api.downloadDocument(id, doc.id);
        p.catch(() => blobs.current.delete(doc.id));
        blobs.current.set(doc.id, p);
      }
      return p;
    },
    [id],
  );

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !app) return <PackageSkeleton />;
  if (!app) return null;

  const selected = app.documents.find((d) => d.id === selectedId) ?? null;
  const status = reportStatusView(app.report, app.documents.length);
  const docFindings = selected && app.report
    ? app.report.findings.filter(
        (f) => f.documentId === selected.id || (!f.documentId && f.documentType && f.documentType === effectiveType(selected)),
      )
    : [];

  const replaceDocument = (oldId: string, next: DocumentView) =>
    setApp((a) => ({ ...a, report: null, documents: a.documents.map((d) => (d.id === oldId ? next : d)) }));

  const changeType = async (doc: DocumentView, type: DocumentTypeCode) => {
    try {
      const updated = await api.updateDocument(id, doc.id, { type });
      replaceDocument(doc.id, updated);
      toast.success("Тип документа сохранён");
    } catch (e) {
      if (!(e instanceof ApiError && e.isUnsupported)) {
        toast.error("Не удалось изменить тип", errorMessage(e));
        throw e;
      }
      // Backend без PATCH: перезагружаем тот же файл с исправленным типом и удаляем старую запись.
      try {
        const blob = await loadBlob(doc);
        const uploaded = await api.uploadDocument(id, new File([blob], doc.filename), type);
        await api.deleteDocument(id, doc.id);
        blobs.current.set(uploaded.id, Promise.resolve(blob));
        replaceDocument(doc.id, uploaded);
        setSelectedId(uploaded.id);
        toast.success("Тип документа исправлен", "Запустите проверку повторно");
      } catch (err) {
        toast.error("Не удалось изменить тип", errorMessage(err));
        throw err;
      }
    }
  };

  const changeField = async (doc: DocumentView, name: string, value: string) => {
    try {
      const updated = await api.updateDocument(id, doc.id, { fields: [{ name, value }] });
      replaceDocument(doc.id, updated);
      toast.success("Поле исправлено", "Изменение сохранено на сервере");
    } catch (e) {
      const msg = e instanceof ApiError && e.isUnsupported ? "Сервер пока не поддерживает правку полей" : errorMessage(e);
      toast.error("Не удалось сохранить поле", msg);
      throw e;
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteDocument(id, toDelete.id);
      blobs.current.delete(toDelete.id);
      setApp((a) => ({ ...a, report: null, documents: a.documents.filter((d) => d.id !== toDelete.id) }));
      toast.success("Документ удалён");
      setToDelete(null);
    } catch (e) {
      toast.error("Не удалось удалить документ", errorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  const runCheck = async () => {
    setChecking(true);
    try {
      const report = await api.runCheck(id);
      setApp((a) => ({ ...a, report }));
      router.push(`/checks/${id}/result`);
    } catch (e) {
      toast.error("Проверка не выполнена", errorMessage(e));
      setChecking(false);
    }
  };

  const docsCount = app.documents.length;

  return (
    <div className={s.page}>
      <BackLink href="/checks">Все проверки</BackLink>

      <motion.header className={s.header} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className={s.headerMain}>
          <div className={s.headerTitle}>
            <h1>{app.applicantName}</h1>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className={s.headerProject}>{app.projectName}</p>
          <dl className={s.headerFacts}>
            <div>
              <dt>ИНН</dt>
              <dd>{app.inn}</dd>
            </div>
            <div>
              <dt>Сумма субсидии</dt>
              <dd>{formatMoney(app.requestedAmount)}</dd>
            </div>
            <div>
              <dt>Документов</dt>
              <dd>
                {docsCount} {pluralize(docsCount, ["файл", "файла", "файлов"])}
              </dd>
            </div>
          </dl>
        </div>
        <div className={s.headerActions}>
          {app.report && (
            <ButtonLink href={`/checks/${id}/result`} variant="outline" icon="list">
              Итог проверки
            </ButtonLink>
          )}
          <Button icon="shield" onClick={runCheck} loading={checking} disabled={docsCount === 0}>
            {app.report ? "Проверить заново" : "Запустить проверку"}
          </Button>
        </div>
      </motion.header>

      <UploadPanel
        types={types}
        compact={docsCount > 0}
        upload={(file, type) => api.uploadDocument(id, file, type)}
        onUploaded={(docs) => {
          toast.success(
            `Загружено ${docs.length} ${pluralize(docs.length, ["документ", "документа", "документов"])}`,
            app.report ? "Предыдущий отчёт сброшен — запустите проверку заново" : undefined,
          );
          setSelectedId(docs[0].id);
          void reload();
        }}
      />

      {docsCount === 0 ? (
        <EmptyState
          icon="upload"
          title="Пакет пока пуст"
          text="Перетащите файлы в область выше. Сервер определит тип каждого документа и извлечёт данные."
        />
      ) : (
        <div className={s.workspace}>
          <DocumentList
            documents={app.documents}
            report={app.report}
            selectedId={selectedId}
            onSelect={(docId) => {
              setSelectedId(docId);
              router.replace(`/checks/${id}?doc=${docId}`, { scroll: false });
            }}
          />

          <div className={s.mobileTabs} role="tablist" aria-label="Режим просмотра">
            {(["original", "details"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                {tab === t && <motion.span layoutId="mobile-tab" className={s.mobileTabPill} />}
                <span>{t === "original" ? "Оригинал" : "Разбор"}</span>
              </button>
            ))}
          </div>

          {selected && (
            <AnimatePresence mode="wait">
              <motion.div
                key={selected.id}
                className={s.panes}
                data-tab={tab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
              >
                <DocumentViewer document={selected} load={loadBlob} />
                <DocumentDetails
                  document={selected}
                  types={types}
                  findings={docFindings}
                  onChangeType={(type) => changeType(selected, type)}
                  onChangeField={(name, value) => changeField(selected, name, value)}
                  onDelete={() => setToDelete(selected)}
                />
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Удалить документ?"
        tone="danger"
        confirmLabel="Удалить"
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setToDelete(null)}
      >
        Файл «{toDelete?.filename}» будет удалён из пакета. Результат предыдущей проверки сбросится.
      </ConfirmDialog>
    </div>
  );
}

function PackageSkeleton() {
  return (
    <div className={s.page} aria-busy="true">
      <Skeleton width={120} height={18} />
      <div className={s.header}>
        <div className={s.headerMain} style={{ display: "grid", gap: 12 }}>
          <Skeleton width="50%" height={28} />
          <Skeleton width="70%" />
          <Skeleton width="40%" />
        </div>
      </div>
      <Skeleton height={120} radius={20} />
    </div>
  );
}
