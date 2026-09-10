"use client";
import { builderPriceConfig, findSizePrice } from "@/lib/size-pricing";

import Image from "next/image";
import { useState } from "react";
import {
  Check,
  Clock3,
  PanelsTopLeft,
  RotateCcw,
  Search,
  Shuffle,
  X,
} from "lucide-react";
import { type CartProduct } from "./cart-provider";
import type { WoyaProduct } from "../data/products";
import {
  calculateSelectionPrice,
  selectedPricingMode,
  type MeasurementModes,
  clockShapeFor,
  dimensionLabel,
  type PricingSettings,
} from "@/lib/pricing";
import { MeasurementControls } from "./measurement-controls";
import { PriceSummary } from "./price-summary";
import { ClockArtwork } from "./clock-artwork";
import { clockSource, type NumeralStyle } from "@/lib/clock-artwork";
import { AddToCartButton } from "./cart-actions";
import styles from "./custom-builder.module.css";

type BuilderMode = "set" | "clock";
type PartPosition = "left" | "center" | "right";

import { builderCatalog, type SourceOption } from "@/lib/builder-catalog";

type ChoiceOption<T extends string> = {
  value: T;
  label: string;
  detail: string;
};

type DetailLine = {
  label: string;
  value: string;
};

const numeralOptions: ChoiceOption<NumeralStyle>[] = [
  { value: "romen", label: "Romen", detail: "XII · III · VI · IX" },
  { value: "normal", label: "Normal", detail: "12 · 3 · 6 · 9" },
  { value: "minimal", label: "Minimal", detail: "Sade çizgiler" },
];

const partLabels: Record<PartPosition, { title: string; short: string }> = {
  left: { title: "Sol tablo", short: "Sol" },
  center: { title: "Orta saat", short: "Saat" },
  right: { title: "Sağ tablo", short: "Sağ" },
};

function partSource(source: SourceOption, part: PartPosition) {
  return (
    source.parts?.[part] ??
    `/images/builder-parts/woya/refined-v1/woya-${source.code}-${part}.webp`
  );
}

function findSource(options: SourceOption[], code: string) {
  return options.find((option) => option.code === code) ?? options[0];
}

function findChoice<T extends string>(options: ChoiceOption<T>[], value: T) {
  return options.find((option) => option.value === value) ?? options[0];
}

function ChoiceGrid<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="mixer-choice-field">
      <legend>{legend}</legend>
      <div className="mixer-choice-grid">
        {options.map((option) => (
          <label
            className="mixer-choice"
            data-selected={value === option.value ? "true" : undefined}
            key={option.value}
          >
            <input
              className="sr-only"
              type="radio"
              name={name}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
            <small>{option.detail}</small>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SourceGrid({
  title,
  helper,
  part,
  options,
  selectedCode,
  clockStyle = "romen",
  onSelect,
}: {
  title: string;
  helper: string;
  part: PartPosition;
  options: SourceOption[];
  selectedCode: string;
  clockStyle?: NumeralStyle;
  onSelect: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [motif, setMotif] = useState("");
  const motifs = [...new Set(options.map((option) => option.motif))];
  const filteredOptions = options.filter(
    (option) =>
      (!motif || option.motif === motif) &&
      `${option.name} ${option.motif} ${option.tone}`
        .toLocaleLowerCase("tr-TR")
        .includes(query.trim().toLocaleLowerCase("tr-TR")),
  );

  return (
    <section
      className="mixer-browser"
      aria-labelledby={`mixer-browser-${part}`}
    >
      <div className="mixer-browser-head">
        <span id={`mixer-browser-${part}`}>{title}</span>
        <small>{filteredOptions.length} model</small>
      </div>
      <div className={styles.filters}>
        <div className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="Model ara"
            placeholder="Model ara"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="Aramayı temizle"
              title="Aramayı temizle"
              onClick={() => setQuery("")}
            >
              <X size={15} />
            </button>
          )}
        </div>
        <select
          aria-label="Desene göre filtrele"
          value={motif}
          onChange={(event) => setMotif(event.target.value)}
        >
          <option value="">Tüm desenler</option>
          {motifs.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      <div className="mixer-option-grid" role="group" aria-label={helper}>
        {filteredOptions.map((option) => {
          const selected = option.code === selectedCode;

          return (
            <button
              className="mixer-source-option"
              data-selected={selected ? "true" : undefined}
              type="button"
              aria-pressed={selected}
              aria-label={[option.name, option.motif, option.tone]
                .filter(Boolean)
                .join(", ")}
              key={`${part}-${option.code}`}
              onClick={() => onSelect(option.code)}
            >
              <span className="mixer-source-thumb">
                {part === "center" ? (
                  <ClockArtwork
                    code={option.code}
                    style={clockStyle}
                    source={option.parts?.center}
                    sizes="160px"
                  />
                ) : (
                  <Image
                    src={partSource(option, part)}
                    alt=""
                    fill
                    sizes="160px"
                  />
                )}
              </span>
              <span className="mixer-source-copy">
                <span>{option.name}</span>
                <small>
                  {[option.motif, option.tone].filter(Boolean).join(" · ")}
                </small>
              </span>
              {selected ? (
                <span className={styles.selectedMark}>
                  <Check aria-hidden="true" size={13} />
                </span>
              ) : null}
            </button>
          );
        })}
        {!filteredOptions.length && (
          <div className={styles.empty} role="status">
            <p>Aramanıza uygun model bulunamadı.</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setMotif("");
              }}
            >
              Filtreleri temizle
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function OrderDetails({ details }: { details: DetailLine[] }) {
  return (
    <dl className="builder-order-details mixer-order-details">
      {details.map((detail) => (
        <div key={`${detail.label}-${detail.value}`}>
          <dt>{detail.label}</dt>
          <dd>{detail.value}</dd>
        </div>
      ))}
    </dl>
  );
}

type BuilderModel = Pick<
  WoyaProduct,
  "code" | "title" | "productType" | "clockShape" | "builderParts"
>;
export function CustomBuilder({
  availableModels,
  settings,
}: {
  availableModels: BuilderModel[];
  settings: PricingSettings;
}) {
  const { tables: availableTables, clocks: availableClocks } =
    builderCatalog(availableModels);
  if (!availableClocks.length) return null;
  return (
    <AvailableBuilder
      key={[...availableTables, ...availableClocks]
        .map((s) => `${s.code}:${s.parts?.center ?? "legacy"}`)
        .join("|")}
      tableSetSources={availableTables}
      clockSources={availableClocks}
      availableModels={availableModels}
      settings={settings}
    />
  );
}

function AvailableBuilder({
  tableSetSources,
  clockSources,
  availableModels,
  settings,
}: {
  tableSetSources: SourceOption[];
  clockSources: SourceOption[];
  availableModels: BuilderModel[];
  settings: PricingSettings;
}) {
  const [mode, setMode] = useState<BuilderMode>(
    tableSetSources.length ? "set" : "clock",
  );
  const [activePart, setActivePart] = useState<PartPosition>("left");
  const [setParts, setSetParts] = useState<Record<PartPosition, string>>({
    left: tableSetSources[0]?.code ?? "",
    center:
      clockSources.find((s) => s.code === "10")?.code ?? clockSources[0].code,
    right:
      tableSetSources.find((s) => s.code === "24")?.code ??
      tableSetSources[0]?.code ??
      "",
  });
  const [clockCode, setClockCode] = useState(clockSources[0].code);
  const [numeralStyle, setNumeralStyle] = useState<NumeralStyle>("romen");
  const [measurementModes, setMeasurementModes] = useState<MeasurementModes>({
    panel: "standard",
    clock: "standard",
  });
  const [sizes, setSizes] = useState(() => ({
    panel: { ...settings.panelPresets[0] },
    rectangle: { ...settings.clockPresets[0] },
    circle: {
      width: settings.diameterPresets[0],
      height: settings.diameterPresets[0],
    },
  }));

  const selectedLeft = findSource(tableSetSources, setParts.left);
  const selectedCenter = findSource(clockSources, setParts.center);
  const selectedRight = findSource(tableSetSources, setParts.right);
  const selectedClock = findSource(clockSources, clockCode);
  const currentClock = mode === "set" ? selectedCenter : selectedClock;
  const shape = clockShapeFor(
    availableModels.find((p) => p.code === currentClock.code)!,
  );
  const dimensions = { panel: sizes.panel, clock: sizes[shape] };
  const kind = mode === "set" ? "set" : "saat";
  const pricingMode = selectedPricingMode(kind, measurementModes);
  const priceConfig = builderPriceConfig(kind, settings);
  const price = calculateSelectionPrice(
    kind,
    dimensions,
    shape,
    settings,
    priceConfig,
    pricingMode,
  );
  const selectedPriceRow = priceConfig.measurementPricing
    ? findSizePrice(
        priceConfig.measurementPricing.rows,
        kind,
        shape,
        dimensions,
      )
    : undefined;
  const activeNumeral = currentClock.parts
    ? { label: "Fotoğraftaki kadran" }
    : findChoice(numeralOptions, numeralStyle);

  const partBrowserOptions =
    activePart === "center" ? clockSources : tableSetSources;
  const partBrowserValue = setParts[activePart];
  const canUseWholeSet = tableSetSources.some(
    (source) => source.code === partBrowserValue,
  );
  const details: DetailLine[] = [
    ...(mode === "set"
      ? [
          { label: "Sol", value: selectedLeft.name },
          { label: "Sağ", value: selectedRight.name },
        ]
      : []),
    { label: "Saat", value: currentClock.name },
    { label: "Rakam", value: activeNumeral.label },
    ...(mode === "set"
      ? [
          {
            label: "İki tablo (her biri)",
            value: dimensionLabel(dimensions.panel),
          },
        ]
      : []),
    {
      label: "Saat ölçüsü",
      value: dimensionLabel(dimensions.clock, shape === "circle"),
    },
  ];
  const cartProduct: CartProduct = {
    slug: mode === "set" ? "ozel-set" : "ozel-saat",
    title:
      mode === "set"
        ? "Kişiye Özel Tablo ve Saat Seti"
        : currentClock.name + " Dekoratif Saat",
    image:
      currentClock.parts?.center ??
      clockSource(currentClock.code, numeralStyle),
    configuration: {
      source: "builder",
      kind,
      clock: currentClock.code,
      numeral: currentClock.parts ? "original" : numeralStyle,
      dimensions,
      pricingMode,
      ...(mode === "set"
        ? { left: selectedLeft.code, right: selectedRight.code }
        : {}),
    },
  };

  function updateSetPart(part: PartPosition, code: string) {
    setSetParts((currentParts) => ({ ...currentParts, [part]: code }));
  }

  function useWholeSet(code: string) {
    if (!tableSetSources.some((source) => source.code === code)) {
      return;
    }

    setSetParts({ left: code, center: code, right: code });
  }

  function shuffleSet() {
    const left =
      tableSetSources[Math.floor(Math.random() * tableSetSources.length)];
    const center =
      clockSources[Math.floor(Math.random() * clockSources.length)];
    const right =
      tableSetSources[Math.floor(Math.random() * tableSetSources.length)];
    setSetParts({ left: left.code, center: center.code, right: right.code });
  }

  function resetDesign() {
    setMode(tableSetSources.length ? "set" : "clock");
    setActivePart("left");
    setSetParts({
      left: tableSetSources[0]?.code ?? "",
      center:
        clockSources.find((s) => s.code === "10")?.code ?? clockSources[0].code,
      right:
        tableSetSources.find((s) => s.code === "24")?.code ??
        tableSetSources[0]?.code ??
        "",
    });
    setClockCode(clockSources[0].code);
    setMeasurementModes({ panel: "standard", clock: "standard" });
    setSizes({
      panel: { ...settings.panelPresets[0] },
      rectangle: { ...settings.clockPresets[0] },
      circle: {
        width: settings.diameterPresets[0],
        height: settings.diameterPresets[0],
      },
    });
    setNumeralStyle("romen");
  }

  return (
    <section
      className={`custom-builder-section product-mixer-section ${styles.studio}`}
      id="kendi-tasariminiz"
      aria-labelledby="custom-builder-title"
    >
      <div className="custom-builder-header product-mixer-header">
        <h2 id="custom-builder-title">
          Seçili WOYA parçalarıyla setinizi kişiselleştirin.
        </h2>
      </div>

      <form
        className="custom-builder-inner product-mixer-inner"
        aria-label="Kişiselleştirilmiş ürün seçimi"
        onSubmit={(event) => event.preventDefault()}
      >
        <aside className="custom-builder-panel builder-options-panel product-mixer-panel">
          <div
            className="mixer-mode-switch"
            role="group"
            aria-label="Ürün tipi"
          >
            <button
              className="mixer-mode-button"
              data-selected={mode === "set" ? "true" : undefined}
              type="button"
              aria-pressed={mode === "set"}
              disabled={!tableSetSources.length}
              onClick={() => setMode("set")}
            >
              <PanelsTopLeft size={18} aria-hidden="true" /> Tablo seti
            </button>
            <button
              className="mixer-mode-button"
              data-selected={mode === "clock" ? "true" : undefined}
              type="button"
              aria-pressed={mode === "clock"}
              onClick={() => setMode("clock")}
            >
              <Clock3 size={18} aria-hidden="true" /> Saat
            </button>
          </div>

          {mode === "set" ? (
            <>
              <div
                className="mixer-part-tabs"
                role="group"
                aria-label="Set parçası"
              >
                {(["left", "center", "right"] as PartPosition[]).map((part) => {
                  const source =
                    part === "left"
                      ? selectedLeft
                      : part === "center"
                        ? selectedCenter
                        : selectedRight;

                  return (
                    <button
                      className="mixer-part-tab"
                      data-selected={activePart === part ? "true" : undefined}
                      type="button"
                      aria-pressed={activePart === part}
                      key={part}
                      onClick={() => setActivePart(part)}
                    >
                      <span>{partLabels[part].short}</span>
                      <small>{source.name}</small>
                    </button>
                  );
                })}
              </div>

              <SourceGrid
                key={activePart}
                title={`${partLabels[activePart].title} seç`}
                helper={
                  activePart === "center" ? "Saat parçaları" : "Tablo panelleri"
                }
                part={activePart}
                options={partBrowserOptions}
                selectedCode={partBrowserValue}
                clockStyle={numeralStyle}
                onSelect={(code) => updateSetPart(activePart, code)}
              />

              <div className="mixer-action-row">
                <button
                  className="mixer-soft-button"
                  type="button"
                  disabled={!canUseWholeSet}
                  onClick={() => useWholeSet(partBrowserValue)}
                >
                  {canUseWholeSet ? "Takımı tamamla" : "Tek saat modeli"}
                </button>
                <button
                  className="mixer-icon-button"
                  type="button"
                  onClick={shuffleSet}
                  aria-label="Parçaları karıştır"
                  title="Parçaları karıştır"
                >
                  <Shuffle aria-hidden="true" size={17} />
                </button>
              </div>

              {!currentClock.parts && (
                <ChoiceGrid
                  legend="Saat rakamı"
                  name="set-clock-number"
                  options={numeralOptions}
                  value={numeralStyle}
                  onChange={setNumeralStyle}
                />
              )}
            </>
          ) : (
            <>
              <SourceGrid
                key="clock"
                title="Saat modelini seç"
                helper="Tüm saat merkezleri"
                part="center"
                options={clockSources}
                selectedCode={clockCode}
                clockStyle={numeralStyle}
                onSelect={setClockCode}
              />

              {!currentClock.parts && (
                <ChoiceGrid
                  legend="Rakam tipi"
                  name="clock-number"
                  options={numeralOptions}
                  value={numeralStyle}
                  onChange={setNumeralStyle}
                />
              )}
            </>
          )}

          <MeasurementControls
            kind={kind}
            shape={shape}
            value={dimensions}
            onChange={(v) =>
              setSizes((s) => ({ ...s, panel: v.panel, [shape]: v.clock }))
            }
            settings={settings}
            modes={measurementModes}
            onModesChange={setMeasurementModes}
          />
        </aside>

        <div className="builder-stage-column product-mixer-stage-column">
          <div className={styles.stageToolbar}>
            {mode === "clock" && <h3>{selectedClock.name}</h3>}
            <button
              className="mixer-icon-button"
              type="button"
              onClick={resetDesign}
              aria-label="Tasarımı sıfırla"
              title="Tasarımı sıfırla"
            >
              <RotateCcw size={17} aria-hidden="true" />
            </button>
          </div>
          <div
            className="builder-stage product-mixer-stage"
            aria-label="Canlı tasarım sahnesi"
            aria-live="polite"
          >
            <div
              className="builder-stage-canvas product-mixer-canvas"
              data-mode={mode}
              data-size="standard"
            >
              {mode === "set" ? (
                <div className="mixer-live-set" data-size="standard">
                  <button
                    type="button"
                    className="mixer-piece mixer-piece-side"
                    aria-label="Sol tabloyu değiştir"
                    aria-pressed={activePart === "left"}
                    onClick={() => setActivePart("left")}
                  >
                    <Image
                      src={partSource(selectedLeft, "left")}
                      alt={`${selectedLeft.name} sol tablo parçası`}
                      fill
                      sizes="(max-width: 480px) 26vw, (max-width: 800px) 140px, 230px"
                    />
                  </button>
                  <button
                    type="button"
                    className="mixer-piece mixer-piece-center"
                    aria-label="Saati değiştir"
                    aria-pressed={activePart === "center"}
                    onClick={() => setActivePart("center")}
                  >
                    <ClockArtwork
                      code={selectedCenter.code}
                      source={selectedCenter.parts?.center}
                      style={numeralStyle}
                      alt={`${selectedCenter.name} saat parçası`}
                      sizes="(max-width: 480px) 34vw, (max-width: 800px) 180px, 300px"
                    />
                  </button>
                  <button
                    type="button"
                    className="mixer-piece mixer-piece-side"
                    aria-label="Sağ tabloyu değiştir"
                    aria-pressed={activePart === "right"}
                    onClick={() => setActivePart("right")}
                  >
                    <Image
                      src={partSource(selectedRight, "right")}
                      alt={`${selectedRight.name} sağ tablo parçası`}
                      fill
                      sizes="(max-width: 480px) 26vw, (max-width: 800px) 140px, 230px"
                    />
                  </button>
                </div>
              ) : (
                <div className="mixer-clock-preview" data-number={numeralStyle}>
                  <ClockArtwork
                    code={selectedClock.code}
                    source={selectedClock.parts?.center}
                    style={numeralStyle}
                    alt={`${selectedClock.name} saat önizlemesi`}
                    sizes="(max-width: 480px) 195px, (max-width: 800px) 270px, 370px"
                  />
                </div>
              )}
            </div>
          </div>
          <div className={styles.stageCaption} aria-live="polite">
            {mode === "set" ? (
              [selectedLeft, selectedCenter, selectedRight].map(
                (source, index) => (
                  <span key={index}>
                    <small>{["Sol tablo", "Saat", "Sağ tablo"][index]}</small>
                    {source.name}
                    <small>
                      {dimensionLabel(
                        index === 1 ? dimensions.clock : dimensions.panel,
                        index === 1 && shape === "circle",
                      )}
                    </small>
                  </span>
                ),
              )
            ) : (
              <span>
                <small>Dekoratif saat</small>
                {selectedClock.name} · {activeNumeral.label}
                <small>
                  {dimensionLabel(dimensions.clock, shape === "circle")}
                </small>
              </span>
            )}
          </div>
        </div>

        <aside className="builder-order-panel product-mixer-order">
          <section
            className={`builder-order-block ${styles.total}`}
            aria-labelledby="builder-order-total"
          >
            <span id="builder-order-total">Sipariş Tutarı</span>
            <PriceSummary
              result={price}
              kind={kind}
              originalPrice={
                selectedPriceRow?.salePrice != null
                  ? selectedPriceRow.price
                  : null
              }
            />
          </section>

          <details className={styles.summary}>
            <summary>Seçiminizin detayları</summary>
            <OrderDetails details={details} />
          </details>

          <div className="builder-purchase-row mixer-purchase-row">
            <AddToCartButton
              className="builder-submit"
              product={cartProduct}
              disabled={price.price === null}
            />
          </div>
        </aside>
      </form>
    </section>
  );
}
