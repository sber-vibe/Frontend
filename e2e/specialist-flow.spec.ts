import { expect, test, type Page } from "@playwright/test";

/** Минимальный корректный PDF с текстовым слоем — чтобы встроенный просмотрщик его открыл. */
function makePdf(text: string): Buffer {
  const stream = `BT /F1 18 Tf 60 760 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

// PNG 2x2, зелёный — «скан»
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNUWnKAgYGBiYGBgYGBAQAWjAGQKkpq3wAAAABJRU5ErkJggg==",
  "base64",
);

async function shot(page: Page, name: string) {
  const project = test.info().project.name;
  await page.waitForTimeout(700); // дать анимациям доиграть
  await page.screenshot({ path: `docs/screenshots/${project}-${name}.png`, fullPage: false });
}

test("специалист проходит полный сценарий проверки пакета", async ({ page }) => {
  // 1. Вход
  await page.goto("/checks");
  await expect(page).toHaveURL(/\/login/);
  await shot(page, "01-login");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByText(/Введите имя специалиста/)).toBeVisible();
  await page.getByLabel("Имя специалиста").fill("Анна Петрова");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("heading", { name: "Проверки пакетов документов" })).toBeVisible();

  // 2. «Новая заявка»: только программа — реквизиты вручную не вводятся
  await page.getByRole("link", { name: "Новая заявка" }).first().click();
  await expect(page).toHaveURL(/\/checks\/new$/);
  await expect(page.getByLabel("ИНН")).toHaveCount(0);
  await shot(page, "02-new-check");
  await page.getByRole("button", { name: /Создать и загрузить/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Новая заявка" })).toBeVisible();
  await expect(page.getByText("Пакет пока пуст")).toBeVisible();
  const appLink = `a[href="${new URL(page.url()).pathname}"]`;

  // 3. Загрузка пакета: нейтральные имена файлов, тип указывает специалист (контракт текущего backend)
  await page.getByTestId("file-input").setInputFiles([
    { name: "1.pdf", mimeType: "application/pdf", buffer: makePdf("Zayavlenie INN 6161234567 summa 850000") },
    { name: "scan4.png", mimeType: "image/png", buffer: PNG },
    { name: "qwe.pdf", mimeType: "application/pdf", buffer: makePdf("Vypiska EGRUL INN 6161234567") },
    { name: "virus.exe", mimeType: "application/octet-stream", buffer: Buffer.from("x") },
  ]);
  await expect(page.getByText(/Формат не поддерживается/)).toBeVisible();
  await page.getByLabel("Тип документа для 1.pdf").selectOption("APPLICATION");
  await page.getByLabel("Тип документа для scan4.png").selectOption("COST_ESTIMATE");
  await page.getByLabel("Тип документа для qwe.pdf").selectOption("SUPPORTING_DOCUMENT");
  await shot(page, "03-upload-queue");
  await page.getByRole("button", { name: "Загрузить (3)" }).click();
  const list = page.getByRole("navigation", { name: "Документы пакета" });
  await expect(list.getByRole("button")).toHaveCount(3);

  // карточка заявки заполняется по документам; нераспознанное — «требуется проверка»
  await expect(page.getByRole("region", { name: "Реквизиты заявки" })).toBeVisible();

  // 4. Просмотр оригинала рядом с разбором
  await list.getByText("scan4.png").click();
  await expect(page.getByAltText("Скан документа scan4.png")).toBeVisible();
  await list.getByText("1.pdf").click();
  await expect(page.locator('iframe[title="Оригинал: 1.pdf"]')).toBeAttached();
  await shot(page, "04-package");

  // 5. Серверная проверка: не хватает выписки
  await page.getByRole("button", { name: "Запустить проверку" }).click();
  await expect(page).toHaveURL(/\/result$/);
  await expect(page.getByRole("heading", { level: 1, name: "Есть ошибки" })).toBeVisible();
  await expect(page.getByText(/Не хватает: Выписка из ЕГРЮЛ\/ЕГРИП/)).toBeVisible();
  await shot(page, "05-result-incomplete");

  // 6. Протокол проверки
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать протокол" }).click();
  expect((await download).suggestedFilename()).toMatch(/^protocol_\w+_\d{4}-\d{2}-\d{2}\.txt$/);

  // 7. Исправление типа: доп. документ на самом деле — выписка ЕГРЮЛ
  await page.getByRole("link", { name: "Дозагрузить документы" }).click();
  await list.getByText("qwe.pdf").click();
  if (test.info().project.name === "mobile") await page.getByRole("tab", { name: "Разбор" }).click();
  await page.getByRole("button", { name: "Исправить тип" }).click();
  await page.getByLabel("Новый тип документа").selectOption("REGISTRATION_EXTRACT");
  await page.getByRole("button", { name: "Сохранить тип" }).click();
  await expect(page.getByText("Тип документа исправлен")).toBeVisible();
  await expect(list.getByText("Выписка ЕГРЮЛ")).toBeVisible();

  // 8. Повторная проверка — пакет полный
  await page.getByRole("button", { name: "Запустить проверку" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Требует внимания" })).toBeVisible();
  await expect(page.getByText("Все обязательные документы на месте")).toBeVisible();
  await shot(page, "06-result-complete");

  // 9. Удаление документа сбрасывает отчёт
  await page.getByRole("link", { name: "Дозагрузить документы" }).click();
  await list.getByText("scan4.png").click();
  if (test.info().project.name === "mobile") await page.getByRole("tab", { name: "Разбор" }).click();
  await page.getByRole("button", { name: "Удалить документ" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Удалить" }).click();
  await expect(list.getByRole("button")).toHaveCount(2);

  // 10. Дашборд: проверка в списке, фильтр работает
  await page.goto("/checks");
  await expect(page.locator(appLink)).toBeVisible();
  await shot(page, "07-dashboard");
  await page.getByRole("tab", { name: "Есть ошибки" }).click();
  // фон выбранного фильтра действительно отрисован (регрессия: «пилюля» схлопывалась и текст был белым на белом)
  const pill = await page.getByRole("tab", { name: "Есть ошибки" }).locator("span").first().boundingBox();
  expect(pill?.width ?? 0).toBeGreaterThan(40);
  await expect(page.locator(appLink)).toHaveCount(0);
});

test("нет горизонтальной прокрутки на ключевых экранах", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Имя специалиста").fill("Анна Петрова");
  await page.getByRole("button", { name: "Войти" }).click();
  for (const path of ["/checks", "/checks/new"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `горизонтальный скролл на ${path}`).toBeLessThanOrEqual(0);
  }
});
