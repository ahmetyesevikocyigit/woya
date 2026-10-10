import type { Metadata } from "next";
import { CategoryPage } from "../components/category-page";
export const metadata: Metadata = {
  title: "Üçlü Setler",
  description:
    "WOYA saatli üçlü tablo ve aynalı duvar setlerini ölçü ve fiyat seçenekleriyle keşfedin.",
  alternates: { canonical: "/uclu-setler" },
};
export default async function Page() {
  return CategoryPage({ id: "uclu-setler" });
}
