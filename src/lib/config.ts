function parseThreshold(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : 0.8;
}

function parseInterval(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 500 ? value : 2000;
}

export const config = {
  /** Backend сам классифицирует документ по содержимому — тип при загрузке не передаётся. */
  autoClassify: process.env.NEXT_PUBLIC_AUTO_CLASSIFY === "true",
  /** Порог, ниже которого тип документа требует подтверждения специалиста (только отображение). */
  confidenceThreshold: parseThreshold(process.env.NEXT_PUBLIC_CONFIDENCE_THRESHOLD),
  /** Как часто опрашивать сервер, пока документы обрабатываются в фоне, мс. */
  pollInterval: parseInterval(process.env.NEXT_PUBLIC_POLL_INTERVAL_MS),
  maxFileSize: 10 * 1024 * 1024,
  /** Форматы из кейса; окончательно формат проверяет сервер. */
  acceptedExtensions: ["pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png"],
  acceptedFormatsLabel: "PDF, DOC/DOCX, XLS/XLSX, JPG/PNG",
};
