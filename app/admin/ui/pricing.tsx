"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { pricingSchema, type PricingSettings } from "@/lib/pricing";
import { FormEnd, useSave } from "./shared";
import { SizePrices } from "./size-prices";
import { selectionRows } from "@/lib/size-pricing";

export function PricingForm({
  initial,
  version,
}: {
  initial: PricingSettings;
  version: number;
}) {
  const [value, setValue] = useState(initial);
  const [validation, setValidation] = useState("");
  const [pendingSet, setPendingSet] = useState(false);
  const [pendingClock, setPendingClock] = useState(false);
  const { busy, error, save } = useSave();
  function field<K extends keyof PricingSettings>(
    key: K,
    v: PricingSettings[K],
  ) {
    setValue((p) => ({ ...p, [key]: v }));
  }
  return (
    <form
      className="admin-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (pendingSet || pendingClock) {
          setValidation(
            "Seçtiğiniz ölçüyü önce Ekle/Güncelle ile listeye alın veya Vazgeç düğmesine basın.",
          );
          return;
        }
        const parsed = pricingSchema.safeParse({
          ...value,
          builderSetPrices: value.builderSetPrices ?? [
            ...selectionRows("set", "rectangle", value, value.builderSetPrice),
            ...selectionRows("set", "circle", value, value.builderSetPrice),
          ],
          builderClockPrices: value.builderClockPrices ?? [
            ...selectionRows(
              "saat",
              "rectangle",
              value,
              value.builderClockPrice,
            ),
            ...selectionRows("saat", "circle", value, value.builderClockPrice),
          ],
        });
        if (!parsed.success) {
          setValidation(parsed.error.issues.map((i) => i.message).join(" "));
          return;
        }
        setValidation("");
        if (
          !window.confirm(
            "Fiyatlandırma değişikliklerini kaydetmek istediğinize emin misiniz?",
          )
        )
          return;
        void save(
          "pricing",
          { version, data: parsed.data },
          "/admin/fiyatlandirma",
        );
      }}
    >
      <fieldset
        disabled={busy}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <h2>Kendin Oluştur · Set ölçü fiyatları</h2>
        <SizePrices
          onDraftChange={setPendingSet}
          kind="set"
          shape="rectangle"
          bothShapes
          settings={value}
          rows={
            value.builderSetPrices ?? [
              ...selectionRows(
                "set",
                "rectangle",
                value,
                value.builderSetPrice,
              ),
              ...selectionRows("set", "circle", value, value.builderSetPrice),
            ]
          }
          onChange={(rows) =>
            setValue((v) => ({
              ...v,
              builderSetPrices: rows,
              builderSetPrice:
                rows.find((row) => row.price !== null)?.price ?? null,
            }))
          }
        />
        <h2>Kendin Oluştur · Tek saat ölçü fiyatları</h2>
        <SizePrices
          onDraftChange={setPendingClock}
          kind="saat"
          shape="rectangle"
          bothShapes
          settings={value}
          rows={
            value.builderClockPrices ?? [
              ...selectionRows(
                "saat",
                "rectangle",
                value,
                value.builderClockPrice,
              ),
              ...selectionRows(
                "saat",
                "circle",
                value,
                value.builderClockPrice,
              ),
            ]
          }
          onChange={(rows) =>
            setValue((v) => ({
              ...v,
              builderClockPrices: rows,
              builderClockPrice:
                rows.find((row) => row.price !== null)?.price ?? null,
            }))
          }
        />
        <h2>Özel Ölçü · Metrekare Birim Fiyatları</h2>
        <div className="admin-two">
          {(
            [
              ["panelRate", "Tablo · 1 m² (₺)"],
              ["clockRate", "Saat · 1 m² (₺)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min="0.01"
                max="10000000"
                step="0.01"
                value={value[key] ?? ""}
                placeholder="Tanımlanmadı"
                onChange={(e) =>
                  field(
                    key,
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
            </label>
          ))}
        </div>
        <h2>Özel Ölçü Sınırları</h2>
        <div className="admin-two">
          {(
            [
              ["minCm", "En küçük kenar / çap (cm)"],
              ["maxCm", "En büyük kenar / çap (cm)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                required
                min="1"
                max="500"
                step="0.1"
                value={Number.isFinite(value[key]) ? value[key] : ""}
                onChange={(e) => field(key, e.target.valueAsNumber)}
              />
            </label>
          ))}
        </div>
        {(
          [
            ["panelPresets", "Tablo Ölçüleri"],
            ["clockPresets", "Dikdörtgen / Kare Saat Ölçüleri"],
          ] as const
        ).map(([key, title]) => (
          <section key={key}>
            <h2>{title} (cm)</h2>
            {value[key].map((size, i) => (
              <div className="admin-size-row" key={i}>
                {(["width", "height"] as const).map((axis) => (
                  <label key={axis}>
                    {axis === "width" ? "En" : "Boy"}
                    {i === 0 ? " · Varsayılan" : ""}
                    <input
                      aria-label={`${title} ${i + 1} ${axis === "width" ? "en" : "boy"}`}
                      type="number"
                      min={value.minCm}
                      max={value.maxCm}
                      step="0.1"
                      required
                      value={Number.isFinite(size[axis]) ? size[axis] : ""}
                      onChange={(e) =>
                        field(
                          key,
                          value[key].map((s, n) =>
                            i === n
                              ? { ...s, [axis]: e.target.valueAsNumber }
                              : s,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
                <button
                  type="button"
                  aria-label={`${title} ${i + 1} sil`}
                  title="Ölçüyü sil"
                  disabled={value[key].length === 1}
                  onClick={() =>
                    field(
                      key,
                      value[key].filter((_, n) => n !== i),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={value[key].length >= 12}
              onClick={() =>
                field(key, [
                  ...value[key],
                  { width: value.minCm, height: value.minCm },
                ])
              }
            >
              <Plus size={16} />
              Ölçü ekle
            </button>
          </section>
        ))}
        <h2>Yuvarlak Saat Çapları</h2>
        {value.diameterPresets.map((d, i) => (
          <div className="admin-size-row admin-size-row-circle" key={i}>
            <label>
              Çap (cm){i === 0 ? " · Varsayılan" : ""}
              <input
                type="number"
                required
                min={value.minCm}
                max={value.maxCm}
                step="0.1"
                value={Number.isFinite(d) ? d : ""}
                onChange={(e) =>
                  field(
                    "diameterPresets",
                    value.diameterPresets.map((n, j) =>
                      i === j ? e.target.valueAsNumber : n,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              disabled={value.diameterPresets.length === 1}
              title="Çapı sil"
              aria-label={`${i + 1}. çapı sil`}
              onClick={() =>
                field(
                  "diameterPresets",
                  value.diameterPresets.filter((_, j) => i !== j),
                )
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={value.diameterPresets.length >= 12}
          onClick={() =>
            field("diameterPresets", [...value.diameterPresets, value.minCm])
          }
        >
          <Plus size={16} />
          Çap ekle
        </button>
      </fieldset>
      <FormEnd busy={busy} error={validation || error} />
    </form>
  );
}
