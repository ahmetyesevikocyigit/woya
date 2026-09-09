"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { accountChanged } from "../components/cart-provider";
import type { Address, Customer } from "@/lib/customer/schema";
import styles from "./account.module.css";
export async function accountApi(action: string, body: unknown) {
  const response = await fetch(`/api/hesap/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "İşlem tamamlanamadı.");
  return result;
}
export function ActionForm({
  action,
  children,
  button = "Kaydet",
  values,
  onSuccess,
  refresh = false,
}: {
  action: string;
  children: ReactNode;
  button?: string;
  values?: (f: FormData) => unknown;
  onSuccess?: (r: Record<string, string>) => void;
  refresh?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const inFlight = useRef(false);
  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        if (inFlight.current) return;
        const form = e.currentTarget;
        const f = new FormData(form);
        inFlight.current = true;
        setBusy(true);
        setError("");
        setSuccess("");
        try {
          const result = await accountApi(
            action,
            values ? values(f) : Object.fromEntries(f),
          );
          setSuccess(result.message || "İşlem tamamlandı.");
          for (const input of Array.from(
            form.querySelectorAll<HTMLInputElement>('input[type="password"]'),
          ))
            input.value = "";
          onSuccess?.(result);
          if (refresh) router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Bağlantı kurulamadı.");
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        {children}
        <button className={styles.button} disabled={busy}>
          {busy ? "İşleniyor…" : button}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {success && (
        <p role="status" className={styles.success}>
          {success}
        </p>
      )}
    </form>
  );
}
export function EmailField({
  name = "email",
  label = "E-posta",
  value,
}: {
  name?: string;
  label?: string;
  value?: string;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type="email"
        autoComplete="email"
        maxLength={100}
        defaultValue={value}
        required
      />
    </label>
  );
}
export function PasswordField({
  name = "password",
  label = "Şifre",
  isNew = false,
}: {
  name?: string;
  label?: string;
  isNew?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        type="password"
        name={name}
        autoComplete={isNew ? "new-password" : "current-password"}
        minLength={isNew ? 12 : 1}
        maxLength={64}
        required
      />
      {isNew && (
        <small className={styles.hint}>
          En az 12 karakter. Türkçe karakterlerle en fazla 72 bayt.
        </small>
      )}
    </label>
  );
}
export function LoginForm() {
  return (
    <>
      <ActionForm
        action="login"
        button="Giriş yap"
        onSuccess={() => accountChanged()}
      >
        <EmailField />
        <PasswordField />
      </ActionForm>
      <div className={styles.links}>
        <Link href="/profil/kayit">Kayıt ol</Link>
        <Link href="/profil/sifremi-unuttum">Şifremi unuttum</Link>
        <Link href="/profil/dogrulama-gonder">Doğrulama bağlantısı iste</Link>
      </div>
    </>
  );
}
export function RegistrationForm() {
  return (
    <ActionForm action="register" button="Kayıt ol">
      <label>
        Ad
        <input
          name="firstName"
          autoComplete="given-name"
          required
          maxLength={29}
        />
      </label>
      <label>
        Soyad
        <input
          name="lastName"
          autoComplete="family-name"
          required
          maxLength={29}
        />
      </label>
      <EmailField />
      <PasswordField isNew />
      <p className={styles.hint}>
        <Link href="/yasal/kisisel-veriler-ve-gizlilik">
          Kişisel veriler ve gizlilik metnini
        </Link>{" "}
        inceleyebilirsiniz.
      </p>
    </ActionForm>
  );
}
export function EmailRequestForm({ action }: { action: "forgot" | "resend" }) {
  return (
    <ActionForm action={action} button="Bağlantı iste">
      <EmailField />
    </ActionForm>
  );
}
export function TokenForm({
  action,
}: {
  action: "verify" | "reset" | "email-verify" | "guest-verify";
}) {
  const [token, setToken] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const value =
      new URLSearchParams(location.hash.slice(1)).get("token") || "";
    setToken(value);
    history.replaceState(null, "", location.pathname);
    setLoaded(true);
  }, []);
  if (!loaded) return <p role="status">Bağlantı hazırlanıyor…</p>;
  if (done)
    return (
      <p role="status" className={styles.success}>
        İşlem tamamlandı. Giriş yapabilirsiniz.
      </p>
    );
  if (!token)
    return (
      <p className={styles.error}>
        Bağlantı bulunamadı. E-postanızdaki bağlantıyı yeniden açın veya yeni
        bağlantı isteyin.
      </p>
    );
  return (
    <ActionForm
      action={action}
      button={
        action === "reset"
          ? "Şifreyi sıfırla"
          : action === "guest-verify"
            ? "Siparişi görüntüle"
            : "E-postayı doğrula"
      }
      values={(f) => ({
        token,
        ...(["reset", "verify"].includes(action)
          ? { password: f.get("password") }
          : {}),
      })}
      onSuccess={(r) => {
        setToken("");
        setDone(true);
        if (["reset", "email-verify"].includes(action))
          accountChanged("/profil?guncellendi=1");
        else if (r.url) window.location.assign(r.url);
      }}
    >
      {action === "reset" ? (
        <PasswordField isNew />
      ) : action === "verify" ? (
        <PasswordField label="Kayıt sırasında belirlediğiniz şifre" />
      ) : (
        <p>İşlemi tamamlamak için aşağıdaki düğmeye basın.</p>
      )}
    </ActionForm>
  );
}
export function ProfileForm({ customer }: { customer: Customer }) {
  return (
    <ActionForm action="profile" refresh>
      <div className={styles.fieldGrid}>
        <label>
          Ad
          <input
            name="firstName"
            autoComplete="given-name"
            maxLength={29}
            required
            defaultValue={customer.firstName}
          />
        </label>
        <label>
          Soyad
          <input
            name="lastName"
            autoComplete="family-name"
            maxLength={29}
            required
            defaultValue={customer.lastName}
          />
        </label>
      </div>
      <label>
        Telefon
        <input
          name="phone"
          type="tel"
          autoComplete="tel"
          maxLength={20}
          defaultValue={customer.phone}
        />
      </label>
      <div className={styles.emailInfo}>
        <span>E-posta</span>
        <p>{customer.email}</p>
        <Link href="/profil/guvenlik">E-posta veya şifre değiştir</Link>
      </div>
    </ActionForm>
  );
}
export function Logout() {
  return (
    <ActionForm
      action="logout"
      button="Çıkış yap"
      onSuccess={() => accountChanged()}
    >
      {null}
    </ActionForm>
  );
}
export function SecurityForms() {
  const [revision, setRevision] = useState(0);
  return (
    <div className={styles.grid}>
      <section className={styles.panel}>
        <h2>Şifre değiştir</h2>
        <ActionForm action="password">
          <PasswordField label="Güncel şifre" />
          <PasswordField name="newPassword" label="Yeni şifre" isNew />
        </ActionForm>
      </section>
      <section className={styles.panel}>
        <h2>E-posta değiştir</h2>
        <ActionForm action="email" button="Yeni adresi doğrula">
          <PasswordField label="Güncel şifre" />
          <EmailField label="Yeni e-posta" />
          <p className={styles.hint}>
            Yeni adres doğrulanana kadar mevcut adresiniz kullanılır. Doğrulama
            tamamlanınca tüm oturumlar kapanır.
          </p>
        </ActionForm>
      </section>
      <section className={styles.panel}>
        <h2>Oturumlar</h2>
        <Sessions key={revision} />
        <ActionForm
          action="revoke"
          button="Diğer oturumları kapat"
          onSuccess={() => setRevision((n) => n + 1)}
        >
          {null}
        </ActionForm>
      </section>
      <section className={styles.panel}>
        <h2>Hesap kapatma talebi</h2>
        <ActionForm
          action="close"
          button="Kapatma talebi oluştur"
          values={(f) => ({
            password: f.get("password"),
            confirm: f.get("confirm") === "on",
          })}
          onSuccess={() => accountChanged("/profil?kapandi=1")}
        >
          <p className={styles.hint}>
            Giriş erişimi ve açık oturumlar kapatılır. Sipariş, ödeme ve başvuru
            kayıtları saklama yükümlülükleri değerlendirilmeden silinmez.
          </p>
          <PasswordField label="Güncel şifre" />
          <label className={styles.check}>
            <input type="checkbox" name="confirm" required />
            Hesabımın kapatılmasını talep ediyorum.
          </label>
        </ActionForm>
      </section>
    </div>
  );
}
function Sessions() {
  const [sessions, setSessions] =
    useState<{ created_at: string; expires_at: string; current: boolean }[]>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/hesap/security", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        if (alive) setSessions(d.sessions);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  return error ? (
    <p role="alert">Oturumlar alınamadı. Sayfayı yenileyin.</p>
  ) : !sessions ? (
    <p role="status">Oturumlar yükleniyor…</p>
  ) : (
    <ul className={styles.list}>
      {sessions.map((s, i) => (
        <li key={i}>
          {s.current ? "Bu oturum" : "Diğer oturum"}
          <p className={styles.hint}>
            Bitiş:{" "}
            {new Date(s.expires_at).toLocaleString("tr-TR", {
              timeZone: "Europe/Istanbul",
            })}
          </p>
        </li>
      ))}
    </ul>
  );
}
export function AddressBook({ addresses }: { addresses: Address[] }) {
  const [editing, setEditing] = useState<Address | null>(null);
  const creation = useRef("");
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  return (
    <>
      <div className={styles.actions}>
        <button
          className={styles.button}
          onClick={() => {
            creation.current = crypto.randomUUID();
            setEditing(null);
            setAdding(true);
          }}
        >
          Adres ekle
        </button>
      </div>
      <div className={styles.section}>
        {(adding || editing) && (
          <section className={styles.panel}>
            <h2>{editing ? "Adresi düzenle" : "Yeni adres"}</h2>
            <ActionForm
              key={editing?.id || "new"}
              action="address-save"
              values={(f) => ({
                ...(editing
                  ? { id: editing.id, version: editing.version }
                  : { creationId: creation.current }),
                data: Object.fromEntries(
                  ["label", "name", "phone", "address"].map((k) => [
                    k,
                    f.get(k),
                  ]),
                ),
                deliveryDefault: f.get("deliveryDefault") === "on",
                billingDefault: f.get("billingDefault") === "on",
              })}
              onSuccess={() => {
                setAdding(false);
                setEditing(null);
                router.refresh();
              }}
            >
              <label>
                Adres başlığı
                <input
                  name="label"
                  maxLength={40}
                  required
                  defaultValue={editing?.label}
                />
              </label>
              <label>
                Ad soyad
                <input
                  name="name"
                  autoComplete="name"
                  maxLength={60}
                  minLength={3}
                  required
                  defaultValue={editing?.name}
                />
              </label>
              <label>
                Telefon
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  maxLength={20}
                  minLength={10}
                  required
                  defaultValue={editing?.phone}
                />
              </label>
              <label>
                Açık adres
                <textarea
                  name="address"
                  autoComplete="street-address"
                  minLength={15}
                  maxLength={400}
                  rows={4}
                  required
                  defaultValue={editing?.address}
                />
                <small className={styles.hint}>
                  İl, ilçe, mahalle, cadde ve kapı numarası.
                </small>
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  name="deliveryDefault"
                  defaultChecked={editing?.deliveryDefault}
                />
                Varsayılan teslimat adresi
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  name="billingDefault"
                  defaultChecked={editing?.billingDefault}
                />
                Varsayılan fatura adresi
              </label>
            </ActionForm>
            <button
              className={styles.secondary}
              onClick={() => {
                setAdding(false);
                setEditing(null);
              }}
            >
              Vazgeç
            </button>
          </section>
        )}
      </div>
      {!addresses.length ? (
        <p className={styles.empty}>Kayıtlı adresiniz yok.</p>
      ) : (
        <div className={styles.grid}>
          {addresses.map((a) => (
            <section className={styles.panel} key={a.id}>
              <h2>{a.label}</h2>
              <p>
                {a.name}
                <br />
                {a.phone}
                <br />
                {a.address}
              </p>
              <p className={styles.hint}>
                {[
                  a.deliveryDefault ? "Varsayılan teslimat" : "",
                  a.billingDefault ? "Varsayılan fatura" : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className={styles.actions}>
                <button
                  className={styles.secondary}
                  onClick={() => {
                    setAdding(false);
                    setEditing(a);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Düzenle
                </button>
                <ActionForm
                  action="address-delete"
                  button="Sil"
                  values={() => ({ id: a.id, version: a.version })}
                  refresh
                >
                  {null}
                </ActionForm>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
export function GuestForm() {
  return (
    <>
      <ActionForm action="guest-access" button="Güvenli erişim bağlantısı iste">
        <label>
          Sipariş numarası
          <input name="reference" maxLength={80} required autoComplete="off" />
        </label>
        <EmailField label="Siparişteki e-posta adresi" />
      </ActionForm>
      <p className={styles.hint}>
        Sipariş hesabınıza bağlıysa giriş yapın. Eski misafir siparişini
        hesabınıza bağlamak için önce aynı e-posta ile giriş yapın, ardından
        buradan erişim bağlantısı isteyin.
      </p>
    </>
  );
}
