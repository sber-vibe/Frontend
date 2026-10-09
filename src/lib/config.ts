function parseThreshold(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : 0.8;
}

export const config = {
  /** Backend сам классифицирует документ по содержимому — тип при загрузке не передаётся. */
  autoClassify: process.env.NEXT_PUBLIC_AUTO_CLASSIFY === "true",
  /** Порог, ниже которого тип документа требует подтверждения специалиста (только отображение). */
  confidenceThreshold: parseThreshold(process.env.NEXT_PUBLIC_CONFIDENCE_THRESHOLD),
  maxFileSize: 10 * 1024 * 1024,
  acceptedExtensions: ["pdf", "docx", "txt", "png", "jpg", "jpeg"],
};
