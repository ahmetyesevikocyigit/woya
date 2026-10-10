"use client";
import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { pricingSchema, type PricingSettings } from "@/lib/pricing";
import { FormEnd, useSave } from "./shared";
import { SizePrices, type SizePricesHandle } from "./size-prices";
import { selectionRows } from "@/lib/size-pricing";

export function PricingForm({
  initial,
  version,
}: {
  initial: PricingSettings;
  version: number;
}) {
  const [value, setValue] = useState(initial);
  const [tab, setTab] = useState("set");
  const [validation, setValidation] = useState("");
  const setPricesRef = useRef<SizePricesHandle>(null);
  const clockPricesRef = useRef<SizePricesHandle>(null);
  const { busy, error, save } = useSave();
  function field<K extends keyof PricingSettings>(
    key: K,
    v: PricingSettings[K],
  ) {
    setValue((p) => ({ ...p, [key]: v }));
  }
  return (
    <form
      className="admin-form admin-pricing-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const setRows = setPricesRef.current?.rowsForSave();
        const clockRows = clockPricesRef.current?.rowsForSave();
        if (setRows === null || clockRows === null) {
          setTab(setRows === null ? "set" : "saat");
          setValidation("Ölçü fiyatını kontrol edin.");
          return;
        }
        const parsed = pricingSchema.safeParse({
          ...value,
          builderSetPrice:
            setRows?.find((row) => row.price !== null)?.price ??
            value.builderSetPrice,
          builderClockPrice:
            clockRows?.find((row) => row.price !== null)?.price ??
            value.builderClockPrice,
          builderSetPrices: setRows ??
            value.builderSetPrices ?? [
              ...selectionRows(
                "set",
                "rectangle",
                value,
                value.builderSetPrice,
              ),
              ...selectionRows("set", "circle", value, value.builderSetPrice),
            ],
          builderClockPrices: clockRows ??
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
            ],
        });
        if (!parsed.success) {
          setValidation(parsed.error.issues.map((i) => i.message).join(" "));
          return;
        }
        setValidation("");
        void save(
          "pricing",
          { version, data: parsed.data },
          "/admin/fiyatlandirma",
        );
      }}
    >
      <p className="admin-muted">
        Kişiselleştirme alanında oluşturulan ürünlerin ölçü fiyatları. Hazır
        ürünlerin fiyatlarını Ürünler bölümünden düzenleyin.
      </p>
      <div
        className="admin-settings-tabs"
        role="group"
        aria-label="Kişiselleştirme fiyat bölümleri"
      >
        {[
          ["set", "Set fiyatları"],
          ["saat", "Tekli saat fiyatları"],
          ["ozel", "Özel ölçü"],
          ["olculer", "Ölçü seçenekleri"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            aria-controls={`pricing-${key}`}
            disabled={busy}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <fieldset
        disabled={busy}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <section id="pricing-set" hidden={tab !== "set"}>
          <h2>Set ölçü fiyatları</h2>
          <SizePrices
            ref={setPricesRef}
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
        </section>
        <section id="pricing-saat" hidden={tab !== "saat"}>
          <h2>Tekli saat ölçü fiyatları</h2>
          <SizePrices
            ref={clockPricesRef}
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
        </section>
        <section id="pricing-ozel" hidden={tab !== "ozel"}>
          <h2>Özel ölçü tarifesi</h2>
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
        </section>
        <section id="pricing-olculer" hidden={tab !== "olculer"}>
          <p className="admin-muted">
            Bir ölçüyü seçeneklerden kaldırmak kayıtlı fiyat satırlarını silmez.
          </p>
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
        </section>
      </fieldset>
      <FormEnd busy={busy} error={validation || error} />
    </form>
  );
}
