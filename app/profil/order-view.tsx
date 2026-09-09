"use client";
import Link from "next/link";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { ActionForm } from "./forms";
import { statusLabels } from "@/lib/admin/schema";
import { paymentLabels } from "@/lib/payments/schema";
import { kindLabels, requestLabels } from "@/lib/customer/schema";
import type { CustomerOrder, ServiceRequest } from "@/lib/customer/types";
import styles from "./account.module.css";
const money = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(
    n / 100,
  );
const date = (v: string) =>
  new Date(v).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
export function RequestThread({
  request,
  children,
}: {
  request: ServiceRequest;
  children?: React.ReactNode;
}) {
  return (
    <section className={styles.panel}>
      <h2>
        {kindLabels[request.kind]} · {requestLabels[request.status]}
      </h2>
      <ol className={styles.timeline}>
        {request.history.map((h, i) => (
          <li key={i}>
            {requestLabels[h.status as keyof typeof requestLabels] || h.status}
            <br />
            <small>{date(h.at)}</small>
          </li>
        ))}
      </ol>
      {request.messages.map((m) => (
        <div className={styles.message} key={m.id}>
          <strong>{m.author === "admin" ? "WOYA" : "Müşteri"}</strong>{" "}
          <small>{date(m.created_at)}</small>
          <p>{m.body}</p>
        </div>
      ))}
      {children}
    </section>
  );
}
function MessageForm({ reference, id }: { reference: string; id: string }) {
  const submission = useRef("");
  const router = useRouter();
  return (
    <ActionForm
      action="message"
      button="Mesaj gönder"
      values={(f) => {
        submission.current ||= crypto.randomUUID();
        return {
          reference,
          id,
          submissionId: submission.current,
          body: f.get("body"),
        };
      }}
      onSuccess={() => {
        submission.current = "";
        router.refresh();
      }}
    >
      <label>
        Mesajınız
        <textarea name="body" required rows={3} maxLength={3000} />
      </label>
    </ActionForm>
  );
}
export function OrderView({
  order,
  canClaim,
}: {
  order: CustomerOrder;
  canClaim: boolean;
}) {
  const submission = useRef("");
  const router = useRouter();
  return (
    <>
      <div className={styles.row}>
        <p className={styles.reference}>{order.reference}</p>
        <p>{date(order.created_at)}</p>
      </div>
      <p>
        {statusLabels[order.status]} ·{" "}
        {order.payment
          ? paymentLabels[order.payment.state]
          : "Çevrimiçi ödeme kaydı yok"}
      </p>
      {order.payment?.testMode && (
        <p className={styles.error}>
          Test işlemi. Gerçek satın alma değildir; ürün gönderimi yapılmaz.
        </p>
      )}
      <div className={styles.grid}>
        <section className={styles.panel}>
          <h2>Ürünler</h2>
          <ul className={styles.list}>
            {order.items.map((i, index) => (
              <li key={index}>
                <strong>{i.title}</strong>
                <p>
                  {i.quantity} adet ·{" "}
                  {i.unitPrice === null
                    ? "Tutar kaydedilmemiş"
                    : money(Math.round(i.unitPrice * 100) * i.quantity)}
                </p>
                <p className={styles.muted}>{i.options.join(" · ")}</p>
              </li>
            ))}
          </ul>
          {order.payment && (
            <dl className={styles.details}>
              <dt>Ürün toplamı</dt>
              <dd>{money(order.payment.amount - order.payment.shipping)}</dd>
              <dt>Kargo</dt>
              <dd>{money(order.payment.shipping)}</dd>
              <dt>Toplam</dt>
              <dd>{money(order.payment.amount)}</dd>
              {order.payment.receivedAmount !== undefined && (
                <>
                  <dt>Tahsil edilen toplam</dt>
                  <dd>{money(order.payment.receivedAmount)}</dd>
                </>
              )}
            </dl>
          )}
        </section>
        <section className={styles.panel}>
          <h2>Teslimat ve fatura</h2>
          <dl className={styles.details}>
            <dt>Alıcı</dt>
            <dd>{order.customer.name}</dd>
            <dt>Telefon</dt>
            <dd>{order.customer.phone}</dd>
            <dt>E-posta</dt>
            <dd>{order.customer.email}</dd>
            <dt>Teslimat</dt>
            <dd>{order.customer.address}</dd>
            <dt>Fatura</dt>
            <dd>
              {order.billing
                ? `${order.billing.companyName || order.billing.name}\n${order.billing.address}${order.billing.taxNumber ? `\n${order.billing.taxOffice} · ${order.billing.taxNumber}` : ""}`
                : "Eski kayıtta ayrı fatura adresi yok."}
            </dd>
          </dl>
          {order.documents?.length ? (
            order.documents.map((d) => (
              <p key={d.id}>
                <a href={`/api/belgeler/${d.id}`}>
                  PDF faturayı indir · {date(d.created_at)}
                </a>
              </p>
            ))
          ) : (
            <p className={styles.hint}>
              Fatura hazır olduğunda burada görünecek.
            </p>
          )}
          {order.refunds?.map((r, i) => (
            <p key={i}>
              Para iadesi: {money(Number(r.amount))} · {r.provider_reference} ·{" "}
              {date(r.performed_at)}
            </p>
          ))}
          {order.legal_snapshot ? (
            <details>
              <summary>Sipariş anındaki sözleşmeler</summary>
              <p>
                Sürüm: {order.legal_snapshot.version} · Onay:{" "}
                {date(order.legal_snapshot.acceptedAt)}
              </p>
              {["informationText", "termsText", "privacyText"].map((k) => (
                <p style={{ whiteSpace: "pre-wrap" }} key={k}>
                  {order.legal_snapshot!.store[k as "termsText"]}
                </p>
              ))}
            </details>
          ) : (
            <p>Bu eski siparişte saklanmış sözleşme bulunmuyor.</p>
          )}
          {order.note && <p>Sipariş notu: {order.note}</p>}
        </section>
        <section className={styles.panel}>
          <h2>Kargo bilgileri</h2>
          {order.shipment?.carrier && order.shipment.trackingNumber ? (
            <>
              <p>Kargo firması: {order.shipment.carrier}</p>
              <p>Takip numarası: {order.shipment.trackingNumber}</p>
              <p className={styles.hint}>
                Bu bilgiler WOYA tarafından girilmiştir. Canlı kargo hareketi
                entegrasyonu yoktur; numarayı kargo firmasının sitesinde
                sorgulayabilirsiniz.
              </p>
            </>
          ) : (
            <p>Henüz kargo takip bilgisi girilmedi.</p>
          )}
        </section>
        <section className={styles.panel}>
          <h2>Durum geçmişi</h2>
          <ol className={styles.timeline}>
            {order.history.map((h, i) => (
              <li key={i}>
                {statusLabels[h.status as keyof typeof statusLabels] ||
                  h.status}
                <br />
                <small>{date(h.at)}</small>
              </li>
            ))}
          </ol>
        </section>
      </div>
      {!order.linked && (
        <section className={styles.panel}>
          <h2>Siparişi hesabıma bağla</h2>
          {canClaim ? (
            <ActionForm
              action="claim"
              button="Hesabıma bağla"
              values={() => ({ reference: order.reference })}
              refresh
            >
              {null}
            </ActionForm>
          ) : (
            <p>
              Siparişteki e-posta adresiyle{" "}
              <Link href="/profil">giriş yapın</Link>, ardından misafir sipariş
              erişimini yeniden doğrulayın.
            </p>
          )}
        </section>
      )}
      <section className={styles.panel}>
        <h2>İptal, iade ve destek</h2>
        <p className={styles.hint}>
          Başvuru oluşturmak veya uygun bulunması otomatik sipariş iptali ya da
          para iadesi değildir. Talebiniz siparişin durumuna ve geçerli
          koşullara göre incelenir.
        </p>
        <ActionForm
          action="request"
          button="Başvuru oluştur"
          values={(f) => {
            submission.current ||= crypto.randomUUID();
            return {
              reference: order.reference,
              requestId: submission.current,
              kind: f.get("kind"),
              body: f.get("body"),
            };
          }}
          onSuccess={() => {
            submission.current = "";
            router.refresh();
          }}
        >
          <label>
            Başvuru türü
            <select name="kind">
              <option value="support">Destek</option>
              {order.payment?.state === "paid" &&
                !order.payment.testMode &&
                (["kargoda", "tamamlandi"].includes(order.status) ? (
                  <option value="return">İade</option>
                ) : order.status !== "iptal" ? (
                  <option value="cancel">İptal</option>
                ) : null)}
            </select>
          </label>
          <label>
            Açıklama
            <textarea name="body" rows={4} maxLength={3000} required />
          </label>
        </ActionForm>
      </section>
      <h2>Başvurular ve mesajlar</h2>
      {!order.requests.length ? (
        <p className={styles.empty}>Bu sipariş için başvuru bulunmuyor.</p>
      ) : (
        order.requests.map((r) => (
          <RequestThread request={r} key={`${r.id}-${r.messages.length}`}>
            <>
              {!["closed", "rejected"].includes(r.status) && (
                <MessageForm reference={order.reference} id={r.id} />
              )}
            </>
          </RequestThread>
        ))
      )}
    </>
  );
}
