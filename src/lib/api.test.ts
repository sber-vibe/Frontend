import { describe, expect, it, vi } from "vitest";
import { api, ApiError, setTokenProvider } from "./api";
import { jsonResponse, makeApplication } from "@/test/fixtures";

function mockFetch(response: Response | Promise<Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(response));
}

describe("api client", () => {
  it("загружает список проверок", async () => {
    const fetchSpy = mockFetch(jsonResponse([makeApplication()]));
    const list = await api.listApplications();
    expect(list).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledWith("/api/v1/applications", expect.any(Object));
  });

  it("создаёт проверку POST-запросом с JSON", async () => {
    const fetchSpy = mockFetch(jsonResponse(makeApplication(), 201));
    await api.createApplication({ applicantName: "ООО", inn: "6161234567", projectName: "P", requestedAmount: 10 });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/v1/applications");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toMatchObject({ inn: "6161234567", requestedAmount: 10 });
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
  });

  it("отправляет файл multipart с типом документа", async () => {
    const fetchSpy = mockFetch(jsonResponse({ id: "d" }, 201));
    const file = new File(["abc"], "scan.pdf", { type: "application/pdf" });
    await api.uploadDocument("app 1", file, "APPLICATION");
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/v1/applications/app%201/documents");
    const body = init?.body as FormData;
    expect(body.get("type")).toBe("APPLICATION");
    expect((body.get("file") as File).name).toBe("scan.pdf");
  });

  it("не отправляет type при автоклассификации на сервере", async () => {
    const fetchSpy = mockFetch(jsonResponse({ id: "d" }, 201));
    await api.uploadDocument("a", new File(["x"], "1.pdf"), null);
    expect((fetchSpy.mock.calls[0][1]?.body as FormData).has("type")).toBe(false);
  });

  it("превращает Problem Details в понятную ошибку на русском", async () => {
    mockFetch(jsonResponse({ status: 404, detail: "Application not found" }, 404));
    await expect(api.getApplication("x")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: "Проверка не найдена",
    });
  });

  it("переводит отказ по размеру файла (от backend или nginx)", async () => {
    mockFetch(jsonResponse({ status: 413, detail: "Maximum upload size exceeded" }, 413));
    await expect(api.uploadDocument("a", new File(["x"], "1.pdf"), "APPLICATION")).rejects.toThrow("Файл больше 10 МБ");
  });

  it("использует текст по HTTP-статусу, если detail пустой", async () => {
    mockFetch(new Response("", { status: 413 }));
    await expect(api.runCheck("x")).rejects.toThrow("Файл слишком большой");
  });

  it("сообщает об отсутствии связи с сервером", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await api.listApplications().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
  });

  it("помечает 405 на PATCH как неподдерживаемую операцию", async () => {
    mockFetch(new Response("", { status: 405 }));
    const error = (await api.updateDocument("a", "d", { type: "APPLICATION" }).catch((e: unknown) => e)) as ApiError;
    expect(error.isUnsupported).toBe(true);
  });

  it("удаляет документ и скачивает оригинал", async () => {
    const fetchSpy = mockFetch(new Response(null, { status: 204 }));
    await api.deleteDocument("a", "d");
    expect(fetchSpy.mock.calls[0][1]?.method).toBe("DELETE");

    fetchSpy.mockImplementation(() => Promise.resolve(new Response("PDF")));
    const blob = await api.downloadDocument("a", "d");
    expect(await blob.text()).toBe("PDF");
  });

  it("добавляет Bearer-токен, если пользователь авторизован через OIDC", async () => {
    const fetchSpy = mockFetch(jsonResponse([]));
    setTokenProvider(() => "jwt-token");
    await api.documentTypes();
    setTokenProvider(() => null);
    expect(new Headers(fetchSpy.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer jwt-token");
  });
});
