import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UploadPanel } from "./UploadPanel";
import { DocumentDetails } from "./DocumentDetails";
import { DocumentViewer } from "./DocumentViewer";
import { PackageWorkspace } from "./PackageWorkspace";
import { RequisitesPanel } from "./RequisitesPanel";
import { jsonResponse, makeApplication, makeDocument, makeReport } from "@/test/fixtures";
import { mockApi } from "@/test/mockApi";
import { ApiError } from "@/lib/api";
import { renderWithProviders } from "@/test/render";
import { router } from "@/test/navigation";

vi.mock("next/navigation", () => import("@/test/navigation"));

const TYPES = ["APPLICATION", "REGISTRATION_EXTRACT", "COST_ESTIMATE", "SUPPORTING_DOCUMENT"];
const pdf = (name = "1.pdf") => new File(["%PDF-1.4"], name, { type: "application/pdf" });

describe("UploadPanel", () => {
  it("добавляет файлы в очередь и отклоняет неподдерживаемые", async () => {
    render(<UploadPanel types={TYPES} upload={vi.fn()} onUploaded={vi.fn()} />);
    await userEvent.upload(screen.getByTestId("file-input"), [pdf("scan.pdf")], { applyAccept: false });
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [new File(["x"], "virus.exe")] } });
    expect(screen.getByText("scan.pdf")).toBeInTheDocument();
    expect(screen.getByText(/Формат не поддерживается/)).toBeInTheDocument();
  });

  it("загружает без выбора типа — тип определяет сервер", async () => {
    const upload = vi.fn().mockResolvedValue(makeDocument({ processingStatus: "UPLOADED" }));
    const onUploaded = vi.fn();
    render(<UploadPanel types={TYPES} upload={upload} onUploaded={onUploaded} />);
    await userEvent.upload(screen.getByTestId("file-input"), pdf());
    expect(screen.getByText(/Указывать тип\s+не обязательно/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Загрузить/ }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(upload).toHaveBeenCalledWith(expect.any(File), null);
  });

  it("загружает файлы по очереди с выбранными типами", async () => {
    const upload = vi.fn().mockImplementation(async (file: File, type: string) => makeDocument({ id: file.name, type }));
    const onUploaded = vi.fn();
    render(<UploadPanel types={TYPES} upload={upload} onUploaded={onUploaded} />);
    await userEvent.upload(screen.getByTestId("file-input"), [pdf("a.pdf"), pdf("b.pdf")]);
    await userEvent.selectOptions(screen.getByLabelText("Тип документа для a.pdf"), "APPLICATION");
    await userEvent.selectOptions(screen.getByLabelText("Тип документа для b.pdf"), "COST_ESTIMATE");
    await userEvent.click(screen.getByRole("button", { name: "Загрузить (2)" }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(upload.mock.calls.map((c) => [c[0].name, c[1]])).toEqual([
      ["a.pdf", "APPLICATION"],
      ["b.pdf", "COST_ESTIMATE"],
    ]);
    expect(screen.getAllByText("Принят")).toHaveLength(2);
  });

  it("показывает ошибку сервера у конкретного файла", async () => {
    const upload = vi.fn().mockRejectedValue(new Error("Превышен лимит хранилища"));
    const onUploaded = vi.fn();
    render(<UploadPanel types={TYPES} upload={upload} onUploaded={onUploaded} />);
    await userEvent.upload(screen.getByTestId("file-input"), pdf());
    await userEvent.selectOptions(screen.getByLabelText("Тип документа для 1.pdf"), "APPLICATION");
    await userEvent.click(screen.getByRole("button", { name: /Загрузить/ }));
    expect(await screen.findByText("Превышен лимит хранилища")).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("принимает файлы перетаскиванием", () => {
    render(<UploadPanel types={TYPES} upload={vi.fn()} onUploaded={vi.fn()} />);
    const zone = screen.getByRole("button", { name: /Перетащите файлы/ });
    fireEvent.dragEnter(zone, { dataTransfer: { files: [] } });
    expect(screen.getByText("Отпустите файлы")).toBeInTheDocument();
    fireEvent.drop(zone, { dataTransfer: { files: [pdf("dropped.pdf")] } });
    expect(screen.getByText("dropped.pdf")).toBeInTheDocument();
  });
});

describe("DocumentDetails", () => {
  const base = {
    types: TYPES,
    findings: [],
    onChangeType: vi.fn().mockResolvedValue(undefined),
    onChangeField: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn(),
  };

  it("при низкой уверенности не выдаёт результат за точный", () => {
    render(<DocumentDetails {...base} document={makeDocument({ type: null, detectedType: "APPLICATION", confidence: 0.63 })} />);
    expect(screen.getByRole("heading")).toHaveTextContent("Предположительно: Заявление на субсидию");
    expect(screen.getByText("Тип документа требует подтверждения специалиста")).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "63");
  });

  it("подтверждает предложенный моделью тип", async () => {
    const onChangeType = vi.fn().mockResolvedValue(undefined);
    render(
      <DocumentDetails
        {...base}
        onChangeType={onChangeType}
        document={makeDocument({ type: null, detectedType: "COST_ESTIMATE", confidence: 0.5 })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Подтвердить" }));
    expect(onChangeType).toHaveBeenCalledWith("COST_ESTIMATE");
  });

  it("исправляет тип документа", async () => {
    const onChangeType = vi.fn().mockResolvedValue(undefined);
    render(<DocumentDetails {...base} onChangeType={onChangeType} document={makeDocument()} />);
    await userEvent.click(screen.getByRole("button", { name: "Исправить тип" }));
    const save = await screen.findByRole("button", { name: "Сохранить тип" });
    expect(save).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText("Новый тип документа"), "REGISTRATION_EXTRACT");
    await userEvent.click(save);
    expect(onChangeType).toHaveBeenCalledWith("REGISTRATION_EXTRACT");
    await waitFor(() => expect(screen.queryByLabelText("Новый тип документа")).not.toBeInTheDocument());
  });

  it("показывает и исправляет извлечённые поля", async () => {
    const onChangeField = vi.fn().mockResolvedValue(undefined);
    const doc = makeDocument({
      confidence: 0.94,
      fields: [
        { name: "inn", value: "6161234568", confidence: 0.9 },
        { name: "requested_amount", value: 850000, manuallyCorrected: true },
      ],
    });
    render(<DocumentDetails {...base} onChangeField={onChangeField} document={doc} />);
    expect(screen.getByText("ИНН")).toBeInTheDocument();
    expect(screen.getByText("исправлено")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Исправить поле «ИНН»" }));
    const input = screen.getByLabelText("Значение поля «ИНН»");
    await userEvent.clear(input);
    await userEvent.type(input, "6161234567{Enter}");
    expect(onChangeField).toHaveBeenCalledWith("inn", "6161234567");
  });

  it("нераспознанное поле помечает «требуется проверка» и не считает извлечённым", async () => {
    const onChangeField = vi.fn().mockResolvedValue(undefined);
    const doc = makeDocument({
      fields: [
        { name: "inn", value: "6161234567", confidence: 0.95 },
        { name: "requested_amount", value: null, status: "NOT_RECOGNIZED" },
      ],
    });
    render(<DocumentDetails {...base} onChangeField={onChangeField} document={doc} />);
    expect(screen.getByText("Не распознано / требуется проверка")).toBeInTheDocument();
    expect(screen.getByText(/Распознано 1 из 2/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Исправить поле «Запрашиваемая сумма»" }));
    const input = screen.getByLabelText("Значение поля «Запрашиваемая сумма»");
    expect(input).toHaveValue("");
    expect(screen.getByRole("button", { name: "Сохранить поле" })).toBeDisabled();
    await userEvent.type(input, "850000{Enter}");
    expect(onChangeField).toHaveBeenCalledWith("requested_amount", "850000");
  });

  it("показывает историю правки: исходное значение модели и автора", () => {
    const doc = makeDocument({
      fields: [
        {
          name: "inn",
          value: "6161234567",
          manuallyCorrected: true,
          originalValue: "6161234568",
          correctedBy: "Анна Петрова",
          correctedAt: "2026-10-10T09:00:00Z",
        },
      ],
    });
    render(<DocumentDetails {...base} document={doc} />);
    expect(screen.getByText(/Исправлено специалистом Анна Петрова/)).toHaveTextContent("распознано моделью: 6161234568");
  });

  it("сообщает, если сервер не вернул поля, и показывает замечания", () => {
    render(
      <DocumentDetails
        {...base}
        document={makeDocument()}
        findings={[{ code: "DUPLICATE_DOCUMENT", message: "Загружено несколько документов одного типа", documentType: "APPLICATION" }]}
      />,
    );
    expect(screen.getByText(/не вернул извлечённые поля/)).toBeInTheDocument();
    expect(screen.getByText("Загружено несколько документов одного типа")).toBeInTheDocument();
  });
});

describe("RequisitesPanel", () => {
  it("показывает извлечённые реквизиты, нераспознанные и ссылку на документ-источник", async () => {
    const onShowSource = vi.fn();
    const app = makeApplication({
      applicantName: null,
      inn: null,
      projectName: null,
      requestedAmount: null,
      documents: [makeDocument({ id: "d1", filename: "заявление.pdf", processingStatus: "DONE" })],
      requisites: [
        { name: "company_name", value: "ООО Ромашка", documentId: "d1", source: "ООО «Ромашка»" },
        { name: "inn", value: null, status: "NOT_RECOGNIZED", documentId: "d1" },
      ],
    });
    render(<RequisitesPanel app={app} onShowSource={onShowSource} />);
    expect(screen.getByText("ООО Ромашка")).toBeInTheDocument();
    // ИНН, проект и сумма не распознаны
    expect(screen.getAllByText("Не распознано / требуется проверка")).toHaveLength(3);
    expect(screen.getByText(/3 реквизита не распознаны/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Открыть «заявление.pdf»" })[1]);
    expect(onShowSource).toHaveBeenCalledWith("d1");
  });

  it("пока документы разбираются, не выдаёт пустые реквизиты за нераспознанные", () => {
    const app = makeApplication({
      applicantName: null,
      inn: null,
      projectName: null,
      requestedAmount: null,
      documents: [makeDocument({ processingStatus: "EXTRACTING" })],
    });
    render(<RequisitesPanel app={app} onShowSource={vi.fn()} />);
    expect(screen.queryByText("Не распознано / требуется проверка")).not.toBeInTheDocument();
    expect(screen.getAllByText("Извлекается из документов…")).toHaveLength(4);
  });
});

describe("DocumentViewer", () => {
  const docx = makeDocument({ filename: "смета.docx" });
  const original = () => Promise.resolve(new Blob(["PK"]));

  it("FE-05: показывает серверную версию DOCX рядом с результатом, ожидая конвертацию", async () => {
    const loadPreview = vi
      .fn()
      .mockResolvedValueOnce({ state: "pending", retryAfterMs: 10 })
      .mockResolvedValueOnce({ state: "ready", format: "pdf", blob: new Blob(["%PDF"]) });
    render(<DocumentViewer document={docx} load={original} loadPreview={loadPreview} />);
    expect(await screen.findByText("Сервер готовит версию документа для просмотра…")).toBeInTheDocument();
    expect(await screen.findByTitle("Просмотр: смета.docx")).toBeInTheDocument();
    expect(screen.getByText(/Версия для просмотра, подготовленная сервером/)).toBeInTheDocument();
    expect(loadPreview).toHaveBeenCalledTimes(2);
  });

  it("FE-05: HTML-версию показывает в изолированном фрейме", async () => {
    const loadPreview = vi.fn().mockResolvedValue({ state: "ready", format: "html", blob: new Blob(["<table></table>"]) });
    render(<DocumentViewer document={makeDocument({ filename: "расчёт.xlsx" })} load={original} loadPreview={loadPreview} />);
    expect(await screen.findByTitle("Просмотр: расчёт.xlsx")).toHaveAttribute("sandbox", "");
  });

  it("FE-05: без маршрута предпросмотра и при ошибке конвертации оставляет доступ к оригиналу", async () => {
    const { unmount } = render(
      <DocumentViewer document={docx} load={original} loadPreview={() => Promise.reject(new ApiError(405, "нет"))} />,
    );
    expect(await screen.findByText(/Сервер пока не формирует версию этого формата/)).toBeInTheDocument();
    expect(screen.getByText("Скачать оригинал")).toBeInTheDocument();
    unmount();

    render(
      <DocumentViewer
        document={docx}
        load={original}
        loadPreview={() => Promise.reject(new ApiError(422, "Файл повреждён", { detail: "Файл повреждён" }))}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось подготовить документ для просмотра: Файл повреждён");
    expect(screen.getByText("Скачать оригинал")).toBeInTheDocument();
  });

  it("показывает PDF во фрейме", async () => {
    render(<DocumentViewer document={makeDocument({ filename: "1.pdf" })} load={() => Promise.resolve(new Blob(["%PDF"]))} />);
    expect(await screen.findByTitle("Оригинал: 1.pdf")).toBeInTheDocument();
  });

  it("показывает скан как изображение и текстовый файл как текст", async () => {
    const { unmount } = render(
      <DocumentViewer document={makeDocument({ filename: "scan4.JPG" })} load={() => Promise.resolve(new Blob(["img"]))} />,
    );
    expect(await screen.findByAltText("Скан документа scan4.JPG")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Увеличить" }));
    expect(screen.getByText("125%")).toBeInTheDocument();
    unmount();

    render(<DocumentViewer document={makeDocument({ filename: "a.txt" })} load={() => Promise.resolve(new Blob(["ИНН 6161234567"]))} />);
    expect(await screen.findByText("ИНН 6161234567")).toBeInTheDocument();
  });

  it("сообщает об ошибке загрузки файла", async () => {
    render(<DocumentViewer document={makeDocument()} load={() => Promise.reject(new Error("Документ не найден"))} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Документ не найден");
  });
});

describe("PackageWorkspace", () => {
  const docs = [
    makeDocument({ id: "d1", type: "APPLICATION", filename: "1.pdf" }),
    makeDocument({ id: "d2", type: "COST_ESTIMATE", filename: "qwe.pdf" }),
  ];
  const app = makeApplication({ documents: docs });
  const baseRoutes = {
    "GET /applications/app-1": app,
    "GET /document-types": ["APPLICATION", "REGISTRATION_EXTRACT", "COST_ESTIMATE"],
    "GET /applications/app-1/documents/d1": () => new Response("%PDF"),
    "GET /applications/app-1/documents/d2": () => new Response("%PDF"),
  };

  it("показывает пакет: список, оригинал и разбор выбранного документа", async () => {
    mockApi(baseRoutes);
    renderWithProviders(<PackageWorkspace id="app-1" />);
    expect(await screen.findByRole("heading", { name: "ООО Ромашка" })).toBeInTheDocument();
    const list = screen.getByRole("navigation", { name: "Документы пакета" });
    expect(within(list).getAllByRole("button")).toHaveLength(2);
    expect(await screen.findByTitle("Оригинал: 1.pdf")).toBeInTheDocument();

    await userEvent.click(within(list).getByText("qwe.pdf"));
    expect(await screen.findByTitle("Оригинал: qwe.pdf")).toBeInTheDocument();
    expect(router.replace).toHaveBeenCalledWith("/checks/app-1?doc=d2", { scroll: false });
  });

  it("запускает серверную проверку и открывает итог", async () => {
    const api = mockApi({ ...baseRoutes, "POST /applications/app-1/check": makeReport() });
    renderWithProviders(<PackageWorkspace id="app-1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Запустить проверку" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/checks/app-1/result"));
    expect(api.calls("POST /applications/app-1/check")).toHaveLength(1);
  });

  it("удаляет документ после подтверждения", async () => {
    const api = mockApi({ ...baseRoutes, "DELETE /applications/app-1/documents/d1": () => new Response(null, { status: 204 }) });
    renderWithProviders(<PackageWorkspace id="app-1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Удалить документ" }));
    const dialog = screen.getByRole("dialog", { name: "Удалить документ?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(api.calls("DELETE /applications/app-1/documents/d1")).toHaveLength(1));
    const list = screen.getByRole("navigation", { name: "Документы пакета" });
    await waitFor(() => expect(within(list).queryByText("1.pdf")).not.toBeInTheDocument());
  });

  it("FE-03: исправляет тип одним PATCH — документ сохраняет ID, автор и время видны", async () => {
    const patched = makeDocument({
      id: "d1",
      type: "REGISTRATION_EXTRACT",
      typeSource: "SPECIALIST",
      typeChangedBy: "Анна Петрова",
      typeChangedAt: "2026-10-10T09:00:00Z",
      processingStatus: "DONE",
    });
    const api = mockApi({ ...baseRoutes, "PATCH /applications/app-1/documents/d1": patched });
    renderWithProviders(<PackageWorkspace id="app-1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Исправить тип" }));
    await userEvent.selectOptions(await screen.findByLabelText("Новый тип документа"), "REGISTRATION_EXTRACT");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить тип" }));
    expect(await screen.findByText("Тип документа сохранён")).toBeInTheDocument();
    expect(await screen.findByText(/Тип указан специалистом Анна Петрова/)).toBeInTheDocument();
    expect(JSON.parse(api.calls("PATCH /applications/app-1/documents/d1")[0][1]?.body as string)).toEqual({ type: "REGISTRATION_EXTRACT" });
    expect(api.calls("POST /applications/app-1/documents")).toHaveLength(0);
    expect(api.calls("DELETE /applications/app-1/documents/d1")).toHaveLength(0);
  });

  it("FE-03: при ошибке PATCH не перезагружает и не удаляет файл", async () => {
    const api = mockApi({
      ...baseRoutes,
      "PATCH /applications/app-1/documents/d1": () => new Response("", { status: 405 }),
    });
    renderWithProviders(<PackageWorkspace id="app-1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Исправить тип" }));
    await userEvent.selectOptions(await screen.findByLabelText("Новый тип документа"), "REGISTRATION_EXTRACT");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить тип" }));
    expect(await screen.findByText("Сервер пока не поддерживает исправление типа")).toBeInTheDocument();
    expect(api.calls("POST /applications/app-1/documents")).toHaveLength(0);
    expect(api.calls("DELETE /applications/app-1/documents/d1")).toHaveLength(0);
  });

  it("показывает пустой пакет и ошибку загрузки", async () => {
    mockApi({ ...baseRoutes, "GET /applications/app-1": makeApplication() });
    renderWithProviders(<PackageWorkspace id="app-1" />);
    expect(await screen.findByText("Пакет пока пуст")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Запустить проверку" })).toBeDisabled();
  });

  it("сообщает, если проверка не найдена", async () => {
    mockApi({ "GET /applications/app-1": () => jsonResponse({ detail: "Application not found" }, 404) });
    renderWithProviders(<PackageWorkspace id="app-1" />);
    expect(await screen.findByText("Проверка не найдена")).toBeInTheDocument();
  });
});
