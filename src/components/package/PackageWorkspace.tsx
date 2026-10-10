"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { selectableTypes } from "@/lib/documentTypes";
import { pluralize } from "@/lib/format";
import { DECISION_VIEW, documentFindings, isProcessing, needsPolling, reportStatusView } from "@/lib/presentation";
import { applicationTitle, NOT_RECOGNIZED, recognizedInn, requisiteView, type RequisiteView } from "@/lib/requisites";
import { errorMessage, useAsync } from "@/lib/useAsync";
import { usePolling } from "@/lib/usePolling";
import type { ApplicationView, DocumentTypeCode, DocumentView } from "@/lib/types";
import { BackLink } from "@/components/BackLink";
import { PollingNotice } from "@/components/PollingNotice";
import Link from "next/link";
import { Badge, Button, ButtonLink, EmptyState, ErrorState, Icon, Skeleton, Spinner } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { DocumentDetails } from "./DocumentDetails";
import { DocumentList } from "./DocumentList";
import { DocumentViewer } from "./DocumentViewer";
import { AttributesPanel } from "./AttributesPanel";
import { RequisitesPanel } from "./RequisitesPanel";
import { UploadPanel } from "./UploadPanel";
import s from "./package.module.scss";

type MobileTab = "original" | "details";

/** Значение реквизита в шапке: «не распознано» выделяется, а не выглядит как пустое значение. */
function HeaderValue({ view }: { view: RequisiteView }) {
  if (view.kind === "missing") return <Badge tone="warning">{NOT_RECOGNIZED}</Badge>;
  return <>{view.text}</>;
}

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

  // Фоновая обработка: пока сервер разбирает файлы, опрашиваем заявку и показываем результат по мере готовности.
  const polling = usePolling(
    app ? needsPolling(app) : false,
    () => api.getApplication(id),
    (fresh) => setApp(() => fresh),
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

  const loadPreview = useCallback((doc: DocumentView) => api.documentPreview(id, doc.id), [id]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !app) return <PackageSkeleton />;
  if (!app) return null;

  const selected = app.documents.find((d) => d.id === selectedId) ?? null;
  const status = reportStatusView(app.report, app.documents);
  const docFindings = selected ? documentFindings(selected, app.report) : [];
  const processingCount = app.documents.filter(isProcessing).length;
  const decision = app.decision ? DECISION_VIEW[app.decision.decision] : null;
  const inn = recognizedInn(app);
  const project = requisiteView(app, "project_name");

  const selectDocument = (docId: string) => {
    setSelectedId(docId);
    router.replace(`/checks/${id}?doc=${docId}`, { scroll: false });
  };

  const replaceDocument = (oldId: string, next: DocumentView) =>
    setApp((a) => ({ ...a, report: null, documents: a.documents.map((d) => (d.id === oldId ? next : d)) }));

  // Только атомарный PATCH: документ сохраняет ID и оригинал, автор и время правки фиксирует сервер.
  // При ошибке ничего не перезагружаем и не удаляем.
  const changeType = async (doc: DocumentView, type: DocumentTypeCode) => {
    try {
      const updated = await api.updateDocument(id, doc.id, { type });
      replaceDocument(doc.id, updated);
      toast.success("Тип документа сохранён", "Запустите проверку повторно");
    } catch (e) {
      const msg = e instanceof ApiError && e.isUnsupported ? "Сервер пока не поддерживает исправление типа" : errorMessage(e);
      toast.error("Не удалось изменить тип", msg);
      throw e;
    }
  };

  const reprocess = async (doc: DocumentView) => {
    try {
      const updated = await api.reprocessDocument(id, doc.id);
      replaceDocument(doc.id, updated);
      toast.success("Документ отправлен на повторную обработку");
    } catch (e) {
      const msg = e instanceof ApiError && e.isUnsupported ? "Сервер пока не поддерживает повторную обработку" : errorMessage(e);
      toast.error("Не удалось повторить обработку", msg);
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
            <h1>{applicationTitle(app)}</h1>
            <Badge tone={status.tone}>{status.label}</Badge>
            {decision && <Badge tone={decision.tone}>Решение: {decision.label}</Badge>}
          </div>
          {project.kind === "value" && <p className={s.headerProject}>{project.text}</p>}
          <dl className={s.headerFacts}>
            <div>
              <dt>Программа</dt>
              <dd>
                {app.programName ?? app.programCode ?? "Определяется из заявления"}
                {app.programDetected && <small className={s.headerHint}> · определена по заявлению</small>}
              </dd>
            </div>
            <div>
              <dt>ИНН</dt>
              <dd>
                {inn ? (
                  <Link href={`/organizations/${inn}`} title="История проверок организации">
                    {inn}
                  </Link>
                ) : (
                  <HeaderValue view={requisiteView(app, "inn")} />
                )}
              </dd>
            </div>
            <div>
              <dt>Сумма субсидии</dt>
              <dd>
                <HeaderValue view={requisiteView(app, "requested_amount")} />
              </dd>
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
          <ButtonLink href={`/checks/${id}/journal`} variant="ghost" icon="clock">
            Журнал
          </ButtonLink>
          {app.report && (
            <ButtonLink href={`/checks/${id}/result`} variant="outline" icon="list">
              Итог проверки
            </ButtonLink>
          )}
          <Button
            icon="shield"
            onClick={runCheck}
            loading={checking}
            disabled={docsCount === 0 || processingCount > 0}
            title={processingCount > 0 ? "Дождитесь окончания обработки файлов" : undefined}
          >
            {app.report ? "Проверить заново" : "Запустить проверку"}
          </Button>
        </div>
      </motion.header>

      <PollingNotice polling={polling} />

      {app.duplicateOf && (
        <div className={s.banner} data-tone="warning" role="status">
          <Icon name="alert" size={18} />
          <span>
            Этот пакет уже проверялся. <Link href={`/checks/${app.duplicateOf}`}>Открыть предыдущую проверку</Link>
          </span>
        </div>
      )}

      <AnimatePresence>
        {processingCount > 0 && (
          <motion.div
            className={s.banner}
            data-tone="info"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Spinner />
            <span>
              Обрабатывается {processingCount} {pluralize(processingCount, ["файл", "файла", "файлов"])} из {docsCount}. Результаты
              появляются по мере готовности — можно работать с уже проверенными документами.
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <UploadPanel
        types={types}
        compact={docsCount > 0}
        upload={(file, type) => api.uploadDocument(id, file, type)}
        onUploaded={(docs) => {
          toast.success(
            `Принято ${docs.length} ${pluralize(docs.length, ["файл", "файла", "файлов"])}`,
            docs.some(isProcessing)
              ? "Сервер определяет тип и проверяет документы в фоне"
              : app.report
                ? "Предыдущий отчёт сброшен — запустите проверку заново"
                : undefined,
          );
          setSelectedId(docs[0].id);
          void reload();
        }}
      />

      {docsCount > 0 && (
        <RequisitesPanel
          app={app}
          onShowSource={(docId) => {
            selectDocument(docId);
            setTab("details");
          }}
        />
      )}

      {app.programCode && <AttributesPanel app={app} onUpdated={(fresh) => setApp(() => fresh)} />}

      {docsCount === 0 ? (
        <EmptyState
          icon="upload"
          title="Пакет пока пуст"
          text="Перетащите файлы в область выше. Сервер определит тип каждого документа и заполнит карточку заявки: организацию, ИНН, проект и сумму."
        />
      ) : (
        <div className={s.workspace}>
          <DocumentList
            documents={app.documents}
            report={app.report}
            selectedId={selectedId}
            onSelect={selectDocument}
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
                <DocumentViewer document={selected} load={loadBlob} loadPreview={loadPreview} />
                <DocumentDetails
                  document={selected}
                  types={types}
                  findings={docFindings}
                  onChangeType={(type) => changeType(selected, type)}
                  onChangeField={(name, value) => changeField(selected, name, value)}
                  onReprocess={() => reprocess(selected)}
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
