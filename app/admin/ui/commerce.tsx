"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  storeSettingsSchema,
  emptyStoreSettings,
  missingStoreSettings,
  type StoreSettings,
} from "@/lib/commerce/schema";
const labels: Record<keyof StoreSettings, string> = {
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
export function CommercePanel() {
  const [data, setData] = useState<Summary>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      setData(await api("/api/admin/commerce"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  if (!data) return <p role="status">{error || "Yükleniyor…"}</p>;
  return (
    <>
      <p className="admin-notice">
        Eksik alanlar:{" "}
        {missingStoreSettings(data.settings.data)
          .map((k) => labels[k as keyof StoreSettings])
          .join(", ") || "Yok"}
        . Canlı tahsilat, sağlayıcı testleri doğrulandıktan sonra sunucudan
        açılır.
      </p>
      <form
        className="admin-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          setMessage("");
          const f = new FormData(e.currentTarget);
          const values: Record<string, unknown> = {};
          for (const key of Object.keys(emptyStoreSettings)) {
            const raw = String(f.get(key) || "");
            values[key] = [
              "shippingFee",
              "freeShippingThreshold",
              "productionDays",
              "deliveryDays",
            ].includes(key)
              ? raw === ""
                ? null
                : Math.round(
                    Number(raw) *
                      (["shippingFee", "freeShippingThreshold"].includes(key)
                        ? 100
                        : 1),
                  )
              : raw;
          }
          try {
            const settings = storeSettingsSchema.parse(values);
            await api("/api/admin/commerce?action=settings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                data: settings,
                version: data.settings.version,
              }),
            });
            setMessage("Ayarlar kaydedildi.");
            await load();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {Object.entries(labels).map(([key, label]) => {
          const k = key as keyof StoreSettings;
          const value = data.settings.data[k];
          const monetary = ["shippingFee", "freeShippingThreshold"].includes(k);
          const numeric = monetary || k.endsWith("Days");
          return (
            <label key={`${k}-${data.settings.version}`}>
              {label}
              {k.endsWith("Text") ? (
                <textarea
                  name={k}
                  rows={9}
                  maxLength={30000}
                  defaultValue={String(value ?? "")}
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
                  min={0}
                  step={monetary ? "0.01" : "1"}
                  defaultValue={
                    value === null
                      ? ""
                      : monetary
                        ? Number(value) / 100
                        : String(value)
                  }
                />
              )}
            </label>
          );
        })}
        <button disabled={busy}>Ayarları kaydet</button>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
      </form>
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
      <p>
        <Link href="/admin/fiyatlandirma">
          Kişiselleştirilmiş tasarım fiyatlarını kontrol edin
        </Link>
      </p>
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
        Belirsiz gönderimler tekrar önleme süresi dolduğunda durdurulur.
        Sağlayıcı kaydı kontrol edilmeden yeniden gönderilmez.
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
                <td>{m.state}</td>
                <td>{m.attempts}</td>
                <td>{m.error_code || "—"}</td>
              </tr>
            ))}
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
