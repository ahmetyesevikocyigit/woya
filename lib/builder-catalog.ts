import type { BuilderParts } from "./admin/schema";
export type BuilderAssets = Pick<BuilderParts, "enabled" | "left" | "center" | "right">;
export type SourceOption = {
  code: string;
  name: string;
  motif: string;
  tone: string;
  parts?: BuilderAssets;
};

export type BuilderCatalogModel = {
  code: string; title: string; productType?: "set" | "saat" | "tablo" | "rehber"; builderParts?: BuilderAssets;
};
export function builderCatalog(models: BuilderCatalogModel[]) {
  const tables: SourceOption[] = [], clocks: SourceOption[] = [];
  for (const model of models) {
    if (!["set", "saat", "tablo"].includes(model.productType ?? "")) continue;
    if (model.builderParts) {
      const parts = model.builderParts;
      if (!parts.enabled) continue;
      const option = { code: model.code, name: model.title, motif: model.productType === "saat" ? "Saat" : "Tablo seti", tone: "", parts };
      if (model.productType !== "tablo" && parts.center) clocks.push(option);
      if (model.productType !== "saat" && parts.left && parts.right) tables.push(option);
    } else {
      const clock = clockSources.find((s) => s.code === model.code);
      const table = tableSetSources.find((s) => s.code === model.code);
      if (clock) clocks.push(clock);
      if (table && model.productType === "set") tables.push(table);
    }
  }
  return { tables, clocks };
}

export const tableSetSources: SourceOption[] = [
  { code: "01", name: "Beyaz Manolya", motif: "Çiçek", tone: "Gold" },
  { code: "02", name: "Siyah Gold Yaprak", motif: "Yaprak", tone: "Gold" },
  { code: "03", name: "Pampas Detayı", motif: "Pampas", tone: "Gold" },
  { code: "04", name: "Antrasit Gül", motif: "Çiçek", tone: "Gümüş" },
  { code: "05", name: "Mavi Geometrik", motif: "Geometrik", tone: "Mavi" },
  { code: "06", name: "Siyah Gold Hat", motif: "Hat", tone: "Gold" },
  { code: "07", name: "Krem Lotus", motif: "Çiçek", tone: "Krem" },
  { code: "08", name: "Mor Tüy", motif: "Tüy", tone: "Mor" },
  { code: "09", name: "Pembe Çiçek", motif: "Çiçek", tone: "Pembe" },
  { code: "10", name: "Gold Palmiye", motif: "Yaprak", tone: "Gold" },
  { code: "11", name: "Beyaz Orkide", motif: "Çiçek", tone: "Beyaz" },
  { code: "12", name: "Lacivert Tüy", motif: "Tüy", tone: "Lacivert" },
  { code: "13", name: "Gold Başak", motif: "Başak", tone: "Gold" },
  { code: "14", name: "Klasik Vazo", motif: "Klasik", tone: "Gold" },
  { code: "15", name: "Gold Hat Yazılı", motif: "Hat", tone: "Gold" },
  { code: "16", name: "Bordo Çiçek", motif: "Çiçek", tone: "Bordo" },
  { code: "17", name: "Saks Mavi Çiçek", motif: "Çiçek", tone: "Mavi" },
  { code: "18", name: "Gold Kelebek", motif: "Kelebek", tone: "Gold" },
  { code: "19", name: "Mavi Yaprak", motif: "Yaprak", tone: "Mavi" },
  { code: "20", name: "Allah Muhammed Hat", motif: "Hat", tone: "Gold" },
  { code: "21", name: "Mavi Ginkgo", motif: "Botanik", tone: "Mavi" },
  { code: "22", name: "Siyah Beyaz Çiçek", motif: "Çiçek", tone: "Siyah" },
  { code: "23", name: "Siyah Beyaz Katalog", motif: "Çiçek", tone: "Gümüş" },
  { code: "24", name: "Gold Dallı Çiçek", motif: "Çiçek", tone: "Gold" },
  { code: "25", name: "Mor Orkide Katalog", motif: "Çiçek", tone: "Mor" },
  { code: "27", name: "Siyah Lale", motif: "Çiçek", tone: "Siyah" },
  { code: "28", name: "Siyah Botanik", motif: "Botanik", tone: "Gümüş" },
  { code: "29", name: "Beyaz Tüy", motif: "Tüy", tone: "Gümüş" },
  { code: "30", name: "Kırmızı Gül", motif: "Çiçek", tone: "Kırmızı" },
  { code: "31", name: "Lavanta", motif: "Çiçek", tone: "Lavanta" },
  { code: "32", name: "Tavus Kuşu", motif: "Tavus", tone: "Mavi" },
  { code: "33", name: "Pastel Manolya", motif: "Çiçek", tone: "Pastel" },
  { code: "35", name: "Gümüş Kanat Katalog", motif: "Kanat", tone: "Gümüş" },
  { code: "36", name: "Siyah Hat Katalog", motif: "Hat", tone: "Gümüş" },
  { code: "37", name: "Siyah Gold Tüy", motif: "Tüy", tone: "Gold" },
  { code: "38", name: "Petrol Mavisi Çiçek", motif: "Çiçek", tone: "Petrol" },
  { code: "39", name: "Gri Beyaz Çiçek", motif: "Çiçek", tone: "Gri" },
  { code: "40", name: "Gold Çiçek", motif: "Çiçek", tone: "Gold" },
  { code: "41", name: "Mavi Gold Botanik", motif: "Botanik", tone: "Mavi" },
  { code: "42", name: "Gold Tüy Siyah", motif: "Tüy", tone: "Gold" },
  { code: "43", name: "Modern Yaprak", motif: "Yaprak", tone: "Gold" },
  { code: "44", name: "Lacivert Pampas", motif: "Pampas", tone: "Lacivert" },
  { code: "45", name: "Siyah Hatlı Set", motif: "Hat", tone: "Gold" },
  { code: "52", name: "Ayna Manolya", motif: "Çiçek", tone: "Ayna" },
  { code: "54", name: "Ayna Beyaz Çiçek", motif: "Çiçek", tone: "Ayna" },
  { code: "55", name: "Yuvarlak Aynalı Çiçek", motif: "Çiçek", tone: "Ayna" },
  { code: "56", name: "Gümüş Yuvarlak Katalog", motif: "Çiçek", tone: "Gümüş" },
];

const clockOnlySources: SourceOption[] = [
  { code: "46", name: "Gümüş Aplik Saat", motif: "Aplik", tone: "Gümüş" },
  { code: "47", name: "Siyah Çizgili Aplik", motif: "Aplik", tone: "Siyah" },
  { code: "48", name: "Yuvarlak Ayna Saat", motif: "Ayna", tone: "Gümüş" },
  { code: "49", name: "Kare Saatli Aplik", motif: "Aplik", tone: "Gümüş" },
  { code: "50", name: "Gold Kadranlı Aplik", motif: "Aplik", tone: "Gold" },
  { code: "53", name: "Yuvarlak Gold Aplik", motif: "Aplik", tone: "Gold" },
];

export const clockSources = [...tableSetSources, ...clockOnlySources];
