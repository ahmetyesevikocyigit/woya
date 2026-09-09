"use client";
import { OrderCommerce } from "./commerce";
import { CustomerService } from "./customer-service";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Funnel } from "lucide-react";
import { orderStatuses, statusLabels, type Order } from "@/lib/admin/schema";
import { date, Empty, FormEnd, money, useSave } from "./shared";
import { paymentLabels } from "@/lib/payments/schema";
export function OrdersTable({
  orders,
  remote,
}: {
  orders: Order[];
  remote?: { total: number; page: number; q: string; status: string };
}) {
  const router = useRouter();
  const [query, setQuery] = useState(remote?.q ?? "");
  const [status, setStatus] = useState(remote?.status ?? "");
  const [page, setPage] = useState(1);
  const rows = remote
    ? orders
    : orders.filter(
        (o) =>
          (!status || o.status === status) &&
          `${o.reference} ${o.customer.name} ${o.customer.phone}`
            .toLocaleLowerCase("tr")
            .includes(query.toLocaleLowerCase("tr")),
      );
  const total = remote?.total ?? rows.length;
  const pages = Math.max(1, Math.ceil(total / 20));
  const current = remote?.page ?? Math.min(page, pages);
  function go(page: number) {
    if (remote)
      router.push(
        `/admin/siparisler?${new URLSearchParams({ q: query, status, page: String(page) })}`,
      );
    else setPage(page);
  }
  return (
    <>
      <form
        className="admin-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          go(1);
        }}
      >
        <input
          type="search"
          aria-label="Sipariş ara"
          placeholder="Sipariş no, müşteri veya telefon"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Sipariş durumu"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tüm durumlar</option>
          {orderStatuses.map((s) => (
            <option key={s} value={s}>
              {statusLabels[s]}
            </option>
          ))}
        </select>
        {remote && (
          <button type="submit">
            <Funnel size={16} />
            Filtrele
          </button>
        )}
      </form>
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Sipariş</th>
              <th>Müşteri</th>
              <th>Adet</th>
              <th>Durum</th>
              <th>Ödeme</th>
              <th>Tarih</th>
            </tr>
          </thead>
          <tbody>
            {(remote ? rows : rows.slice((current - 1) * 20, current * 20)).map(
              (o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/admin/siparisler/${o.id}`}>
                      {o.reference}
                    </Link>
                  </td>
                  <td>
                    {o.customer.name}
                    <small>{o.customer.phone}</small>
                  </td>
                  <td>{o.items.reduce((n, i) => n + i.quantity, 0)}</td>
                  <td>{statusLabels[o.status]}</td>
                  <td>
                    {o.payment ? (
                      <>
                        {o.payment.testMode && <strong>TEST · </strong>}
                        {paymentLabels[o.payment.state]}
                        <small>{money(o.payment.amount / 100)}</small>
                      </>
                    ) : (
                      "Çevrimiçi ödeme yok"
                    )}
                  </td>
                  <td>{date(o.createdAt)}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      {!rows.length && <Empty>Henüz bu filtreye uygun sipariş yok.</Empty>}
      <div className="admin-pagination">
        <span>
          {total} sipariş · {current}/{pages}
        </span>
        <button disabled={current === 1} onClick={() => go(current - 1)}>
          Önceki
        </button>
        <button disabled={current === pages} onClick={() => go(current + 1)}>
          Sonraki
        </button>
      </div>
    </>
  );
}
export function OrderDetail({ order }: { order: Order }) {
  const [status, setStatus] = useState(order.status);
  const [carrier, setCarrier] = useState(order.shipment?.carrier || "");
  const [trackingNumber, setTrackingNumber] = useState(
    order.shipment?.trackingNumber || "",
  );
  const [note, setNote] = useState(order.internalNote);
  const { busy, error, save } = useSave();
  const allPriced = order.items.every((i) => i.unitPrice !== null);
  const total = order.items.reduce(
    (n, i) => n + (i.unitPrice ?? 0) * i.quantity,
    0,
  );
  return (
    <>
      <div className="admin-notice">
        {order.payment ? (
          <>
            {order.payment.testMode
              ? "TEST İŞLEMİ · Ürün göndermeyin. "
              : "PayTR · "}
            {paymentLabels[order.payment.state]}.{" "}
            {order.payment.paidAt && (
              <>İşlem tarihi: {date(order.payment.paidAt)}. </>
            )}
            {order.payment.state === "review" &&
              "PayTR mağaza panelinden işlemi kontrol edin; otomatik sipariş onayı verilmedi. "}
            {order.payment.state === "paid" &&
              order.status === "iptal" &&
              "Sipariş iptal edilmiş ancak ödeme alınmış. İptal, otomatik para iadesi yapmaz; PayTR üzerinden kontrol edin."}
          </>
        ) : (
          "Bu kayıt için çevrimiçi ödeme alınmadı."
        )}
      </div>
      <div className="admin-editor-grid">
        <div>
          <h2>Ürün Kalemleri</h2>
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th>Adet</th>
                  <th>Birim fiyat</th>
                  <th>Ara toplam</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((i, index) => (
                  <tr key={index}>
                    <td>
                      {i.title}
                      {i.options.map((o, n) => (
                        <small key={n}>{o}</small>
                      ))}
                    </td>
                    <td>{i.quantity}</td>
                    <td>{money(i.unitPrice)}</td>
                    <td>
                      {money(
                        i.unitPrice === null ? null : i.unitPrice * i.quantity,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="admin-total">
            Kayıt anındaki ürün toplamı:{" "}
            <strong>{allPriced ? money(total) : "Tutar belirtilmemiş"}</strong>
          </p>
          {order.payment && (
            <p className="admin-total">
              Kargo: {money(order.payment.shipping / 100)} · Sipariş toplamı:{" "}
              <strong>{money(order.payment.amount / 100)}</strong>
              {order.payment.receivedAmount !== undefined && (
                <>
                  {" "}
                  · PayTR işlem tutarı:{" "}
                  {money(order.payment.receivedAmount / 100)}
                </>
              )}
            </p>
          )}
          <h2>Müşteri Notu</h2>
          <p className="admin-pre">{order.note || "Not eklenmemiş."}</p>
          <h2>Durum Geçmişi</h2>
          <ol className="admin-timeline">
            {order.history.map((h, i) => (
              <li key={i}>
                <strong>
                  {statusLabels[h.status as Order["status"]] ?? h.status}
                </strong>
                <span>{date(h.at)}</span>
              </li>
            ))}
          </ol>
        </div>
        <aside>
          <h2>Müşteri Bilgileri</h2>
          <dl className="admin-details">
            <dt>Ad soyad</dt>
            <dd>{order.customer.name}</dd>
            <dt>Telefon</dt>
            <dd>
              <a href={`tel:${order.customer.phone.replace(/[^+0-9]/g, "")}`}>
                {order.customer.phone}
              </a>
            </dd>
            <dt>E-posta</dt>
            <dd>{order.customer.email || "Belirtilmedi"}</dd>
            <dt>Adres</dt>
            <dd className="admin-pre">
              {order.customer.address || "Belirtilmedi"}
            </dd>
          </dl>
          {order.billing && (
            <>
              <h2>Fatura Adresi</h2>
              <p className="admin-pre">
                {order.billing.companyName || order.billing.name}
                {order.billing.taxNumber && (
                  <small>
                    {order.billing.taxOffice} · {order.billing.taxNumber}
                  </small>
                )}
                <br />
                {order.billing.address}
              </p>
            </>
          )}
          <form
            className="admin-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save(
                "orders",
                {
                  id: order.id,
                  data: {
                    status,
                    internalNote: note,
                    version: order.version,
                    shipment: { carrier, trackingNumber },
                  },
                },
                `/admin/siparisler/${order.id}`,
              );
            }}
          >
            <label>
              Sipariş durumu
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Order["status"])}
              >
                {orderStatuses.map((s) => (
                  <option key={s} value={s}>
                    {statusLabels[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Kargo firması
              <input
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                maxLength={80}
              />
            </label>
            <label>
              Takip numarası
              <input
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                maxLength={100}
              />
            </label>
            <label>
              İç not (müşteriye gösterilmez)
              <textarea
                rows={5}
                maxLength={5000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <FormEnd busy={busy} error={error} />
          </form>
        </aside>
      </div>
      {order.legalSnapshot && (
        <details>
          <summary>
            Sipariş anındaki sözleşmeler · {order.legalSnapshot.version}
          </summary>
          <p>Onay: {date(order.legalSnapshot.acceptedAt)}</p>
          {["informationText", "termsText", "privacyText"].map((k) => (
            <p className="admin-pre" key={k}>
              {order.legalSnapshot!.store[k as "termsText"]}
            </p>
          ))}
        </details>
      )}
      <OrderCommerce orderId={order.id} />
      <CustomerService orderId={order.id} />
    </>
  );
}
