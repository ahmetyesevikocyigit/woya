"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  storeSettingsSchema,
  emptyStoreSettings,
  missingStoreSettings,
  deliveryAnnouncement,
  type StoreSettings,
} from "@/lib/commerce/schema";
const emailStates: Record<string, string> = {
  queued: "Sırada",
  sending: "Gönderiliyor",
  retry: "Yeniden denenecek",
  sent: "Posta sunucusu kabul etti",
  delivered: "Teslim edildi",
  failed: "Gönderilemedi",
  unknown: "Sonuç belirsiz — teslim kaydını kontrol edin",
  bounced: "Geri döndü",
  complained: "Spam bildirimi",
};
const labels: Record<keyof StoreSettings, string> = {
  totalDeliveryDays: "Toplam teslim süresi (iş günü)",
  shippingFee: "Kargo bedeli (TL)",
  freeShippingThreshold: "Ücretsiz kargo eşiği (TL; yoksa boş bırakın)",
  productionDays: "Üretim süresi (iş günü)",
  deliveryDays: "Kargo teslim süresi (iş günü)",
  replyTo: "Destek / yanıt e-postası",
  notificationEmail: "Yeni sipariş bildirim e-postası",
  sellerName: "Resmî satıcı unvanı",
  sellerTaxOffice: "Vergi dairesi",
  sellerTaxNumber: "Vergi / kimlik numarası",
  sellerAddress: "Resmî adres",
  sellerPhone: "Satıcı telefon",
  returnAddress: "İade adresi",
  legalVersion: "Sözleşme sürümü",
  termsText: "Mesafeli satış sözleşmesi",
  informationText: "Ön bilgilendirme metni",
  privacyText: "Kişisel veriler ve gizlilik metni",
};
type Summary = {
  settings: { data: StoreSettings; version: number };
  emails: {
    id: string;
    event_key: string;
    state: string;
    error_code: string;
    attempts: number;
  }[];
  missingPrices: { id: string; title: string }[];
  payments: { order_id: string; merchant_oid: string; state: string }[];
};
async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || "İşlem tamamlanamadı.");
  return body;
}
const sections = [
  {
    id: "kargo",
    title: "Kargo ve teslimat",
    keys: ["shippingFee", "freeShippingThreshold", "totalDeliveryDays"],
  },
  { id: "iade", title: "İade", keys: ["returnAddress"] },
  {
    id: "firma",
    title: "Firma bilgileri",
    keys: [
      "sellerName",
      "sellerTaxOffice",
      "sellerTaxNumber",
      "sellerAddress",
      "sellerPhone",
    ],
  },
  {
    id: "yasal",
    title: "Sözleşmeler",
    keys: ["legalVersion", "termsText", "informationText", "privacyText"],
  },
  {
    id: "eposta",
    title: "E-posta adresleri",
    keys: ["replyTo", "notificationEmail"],
  },
] as const;
export function CommercePanel({
  initialSection = "kargo",
  notifications = false,
}: {
  initialSection?: string;
  notifications?: boolean;
}) {
  const [data, setData] = useState<Summary>();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [section, setSection] = useState(
    sections.some((s) => s.id === initialSection) ? initialSection : "kargo",
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  function install(summary: Summary) {
    setData(summary);
    setDraft(
      Object.fromEntries(
        Object.entries(summary.settings.data).map(([k, v]) => [
          k,
          v === null
            ? ""
            : ["shippingFee", "freeShippingThreshold"].includes(k)
              ? String(Number(v) / 100)
              : String(v),
        ]),
      ),
    );
    setDirty(false);
  }
  useEffect(() => {
    let active = true;
    api("/api/admin/commerce")
      .then((result) => {
        if (active) install(result);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  if (!data)
    return <p role={error ? "alert" : "status"}>{error || "Yükleniyor…"}</p>;
  if (notifications) return <CommerceNotifications data={data} />;
  const active = sections.find((s) => s.id === section)!;
  const missing = missingStoreSettings(data.settings.data);
  return (
    <>
      <nav className="admin-settings-tabs" aria-label="Mağaza ayarları">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={section === s.id}
            onClick={() => {
              setSection(s.id);
              setMessage("");
            }}
          >
            {s.title}
          </button>
        ))}
      </nav>
      <div className="admin-settings-layout">
        <form
          className="admin-form admin-settings-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            setMessage("");
            const values = Object.fromEntries(
              Object.keys(emptyStoreSettings).map((k) => {
                const raw = draft[k] ?? "";
                return [
                  k,
                  ["shippingFee", "freeShippingThreshold"].includes(k)
                    ? raw === ""
                      ? null
                      : Math.round(Number(raw) * 100)
                    : k.endsWith("Days")
                      ? raw === ""
                        ? null
                        : Number(raw)
                      : raw,
                ];
              }),
            );
            try {
              const result = storeSettingsSchema.safeParse(values);
              if (!result.success) {
                const keys = result.error.issues.map(
                  (i) => String(i.path[0]) as keyof StoreSettings,
                );
                const target = sections.find((s) =>
                  s.keys.some((k) => keys.includes(k)),
                );
                if (target) setSection(target.id);
                throw new Error(
                  `Şu alanları kontrol edin: ${[...new Set(keys.map((k) => labels[k]))].join(", ")}.`,
                );
              }
              await api("/api/admin/commerce?action=settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  data: result.data,
                  version: data.settings.version,
                }),
              });
              // The write endpoint increments the version atomically; no second request can mask a successful save.
              install({
                ...data,
                settings: {
                  data: result.data,
                  version: data.settings.version + 1,
                },
              });
              setMessage(
                "Değişiklikler kaydedildi. Site güncel ayarları kullanıyor.",
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>{active.title}</h2>
          {section === "kargo" && (
            <p>
              Ücretsiz kargo eşiği ürün toplamına uygulanır. Toplam teslim
              süresi, üretim ve kargoyu birlikte kapsar.
            </p>
          )}
          {section === "firma" && (
            <p>
              Bu bilgiler siparişin satıcı bilgilerine ve sözleşme kaydına
              eklenir. Daha sonra tamamlayabilirsiniz.
            </p>
          )}
          {section === "iade" && (
            <p>
              Kabul edilen iadelerin gönderileceği adresi buradan belirleyin.
            </p>
          )}
          <fieldset disabled={busy} className="admin-settings-fields">
            {active.keys.map((k) => {
              const monetary =
                k === "shippingFee" || k === "freeShippingThreshold";
              const numeric = monetary || k.endsWith("Days");
              const multiline = k.endsWith("Text") || k.endsWith("Address");
              return (
                <label key={k}>
                  {labels[k]}
                  {multiline ? (
                    <textarea
                      name={k}
                      rows={k.endsWith("Text") ? 10 : 4}
                      maxLength={k.endsWith("Text") ? 30000 : 500}
                      value={draft[k] ?? ""}
                      onChange={(e) => {
                        setDraft((d) => ({ ...d, [k]: e.target.value }));
                        setDirty(true);
                        setMessage("");
                      }}
                    />
                  ) : (
                    <input
                      name={k}
                      type={
                        numeric
                          ? "number"
                          : k === "replyTo" || k === "notificationEmail"
                            ? "email"
                            : "text"
                      }
                      min={k === "totalDeliveryDays" ? 1 : 0}
                      max={numeric ? (monetary ? 1000000 : 455) : undefined}
                      step={monetary ? "0.01" : 1}
                      maxLength={
                        k === "sellerTaxNumber"
                          ? 11
                          : k === "legalVersion"
                            ? 100
                            : 500
                      }
                      value={draft[k] ?? ""}
                      onChange={(e) => {
                        setDraft((d) => ({ ...d, [k]: e.target.value }));
                        setDirty(true);
                        setMessage("");
                      }}
                    />
                  )}
                </label>
              );
            })}
          </fieldset>
          {section === "kargo" &&
            data.settings.data.totalDeliveryDays === null &&
            data.settings.data.productionDays !== null && (
              <p className="admin-muted">
                Önceki süreler: üretim {data.settings.data.productionDays} iş
                günü, kargo {data.settings.data.deliveryDays ?? "—"} iş günü.
                Toplam süre girildiğinde sitede bu süre gösterilir.
              </p>
            )}
          {error && (
            <p className="admin-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="admin-success" role="status">
              {message}
            </p>
          )}
          <div className="admin-form-end">
            <span className="admin-muted">
              {dirty ? "Kaydedilmemiş değişiklikler var." : "Kayıtlı ayarlar"}
            </span>
            <button className="admin-primary" disabled={busy || !dirty}>
              {busy ? "Kaydediliyor…" : "Değişiklikleri kaydet"}
            </button>
          </div>
        </form>
        <aside className="admin-settings-aside">
          <h2>Sitede görünen</h2>
          <p>{deliveryAnnouncement(data.settings.data)}</p>
          <p>
            {data.settings.data.freeShippingThreshold === null
              ? "Ücretsiz kargo eşiği tanımlanmadı."
              : `${(data.settings.data.freeShippingThreshold / 100).toLocaleString("tr-TR")} TL ve üzeri ücretsiz kargo`}
          </p>
          <h2>Satış hazırlığı</h2>
          {missing.length ? (
            <ul>
              {missing.map((k) => (
                <li key={k}>{labels[k as keyof StoreSettings]}</li>
              ))}
            </ul>
          ) : (
            <p>Mağaza bilgileri tamamlandı.</p>
          )}
          <p className="admin-muted">
            Eksik bilgileri bölüm bölüm kaydedebilirsiniz. Canlı ödeme, PayTR
            testi tamamlandıktan sonra açılır.
          </p>
          <Link className="admin-inline-link" href="/admin/urunler">
            Ürün fiyatlarını düzenle
          </Link>
          <Link className="admin-inline-link" href="/admin/fiyatlandirma">
            Özel tasarım fiyatlarını düzenle
          </Link>
        </aside>
      </div>
    </>
  );
}
function CommerceNotifications({ data }: { data: Summary }) {
  return (
    <>
      <h2>Fiyatı eksik aktif ürünler</h2>
      {data.missingPrices.length ? (
        data.missingPrices.map((p) => (
          <p key={p.id}>
            <Link href={`/admin/urunler/${p.id}`}>{p.title}</Link>
          </p>
        ))
      ) : (
        <p>Eksik ürün fiyatı yok.</p>
      )}
      <h2>Kontrol bekleyen ödemeler</h2>
      {data.payments.map((p) => (
        <p key={p.merchant_oid}>
          <Link href={`/admin/siparisler/${p.order_id}`}>{p.merchant_oid}</Link>{" "}
          · {p.state}
        </p>
      ))}
      {!data.payments.length && <p>Kontrol bekleyen ödeme yok.</p>}
      <h2>Son 100 e-posta</h2>
      <p>
        Posta sunucusunun kabulü gelen kutusuna teslim edildiği anlamına gelmez.
        Belirsiz gönderimler otomatik tekrarlanmaz; GüzelHosting teslim kaydı
        kontrol edilir.
      </p>
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Olay</th>
              <th>Durum</th>
              <th>Deneme</th>
              <th>Hata</th>
            </tr>
          </thead>
          <tbody>
            {data.emails.map((m) => (
              <tr key={m.id}>
                <td>{m.event_key}</td>
                <td>{emailStates[m.state] || m.state}</td>
                <td>{m.attempts}</td>
                <td>{m.error_code || "—"}</td>
              </tr>
            ))}
            {!data.emails.length && (
              <tr>
                <td colSpan={4}>Henüz e-posta kaydı yok.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
type OrderExtras = {
  documents: { id: string; created_at: string }[];
  refunds: {
    id: string;
    amount: number;
    provider_reference: string;
    reason: string;
  }[];
};
export function OrderCommerce({ orderId }: { orderId: string }) {
  const [data, setData] = useState<OrderExtras>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submissionId, setSubmissionId] = useState("");
  async function load() {
    setData(await api(`/api/admin/commerce?orderId=${orderId}`));
  }
  useEffect(() => {
    setSubmissionId(crypto.randomUUID());
    void load().catch((e) => setError(e.message));
  }, [orderId]);
  return (
    <section>
      <h2>Faturalar</h2>
      {data?.documents.map((d) => (
        <p key={d.id}>
          <a href={`/api/belgeler/${d.id}`}>
            PDF faturayı indir ·{" "}
            {new Date(d.created_at).toLocaleDateString("tr-TR")}
          </a>
        </p>
      ))}
      <form
        className="admin-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const f = new FormData(e.currentTarget).get("invoice") as File;
          if (!f?.size) return;
          setBusy(true);
          setError("");
          try {
            await api(`/api/admin/commerce?action=invoice&orderId=${orderId}`, {
              method: "POST",
              headers: { "Content-Type": "application/pdf" },
              body: f,
            });
            await load();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          PDF fatura (en fazla 10 MB)
          <input required type="file" name="invoice" accept="application/pdf" />
        </label>
        <button disabled={busy}>Faturayı yükle ve bildir</button>
      </form>
      <h2>PayTR para iadesi kayıtları</h2>
      {data?.refunds.map((r) => (
        <p key={r.id}>
          {(Number(r.amount) / 100).toLocaleString("tr-TR")} TL ·{" "}
          {r.provider_reference} · {r.reason}
        </p>
      ))}
      <p>
        Önce iadeyi PayTR panelinde gerçekleştirin. Bu form tamamlanan işlemi
        kaydeder ve müşteriye bildirir.
      </p>
      <form
        className="admin-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const form = e.currentTarget;
          const f = new FormData(form);
          setBusy(true);
          setError("");
          try {
            await api("/api/admin/commerce?action=refund", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId,
                submissionId,
                amount: Math.round(Number(f.get("amount")) * 100),
                providerReference: f.get("reference"),
                reason: f.get("reason"),
                performedAt: new Date(String(f.get("date"))).toISOString(),
                confirmed: f.get("confirmed") === "on",
              }),
            });
            setSubmissionId(crypto.randomUUID());
            form.reset();
            await load();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          İade tutarı (TL)
          <input required name="amount" type="number" min="0.01" step="0.01" />
        </label>
        <label>
          PayTR işlem referansı
          <input required name="reference" minLength={3} maxLength={100} />
        </label>
        <label>
          İşlem tarihi
          <input required name="date" type="datetime-local" />
        </label>
        <label>
          İade açıklaması
          <textarea required name="reason" minLength={3} maxLength={1000} />
        </label>
        <label>
          <input type="checkbox" name="confirmed" required /> İade PayTR
          panelinde tamamlandı.
        </label>
        <button disabled={busy}>Tamamlanan iadeyi kaydet</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
