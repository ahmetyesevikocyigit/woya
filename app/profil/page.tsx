import { pageSession } from "@/lib/customer/auth";
import { LoginForm, ProfileForm } from "./forms";
import styles from "./account.module.css";
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ kapandi?: string; guncellendi?: string }>;
}) {
  const session = await pageSession();
  const q = await searchParams;
  return (
    <>
      <h1>{session ? "Profilim" : "Giriş yap"}</h1>
      {q.guncellendi === "1" && (
        <p role="status" className={styles.success}>
          Bilgileriniz güncellendi. Yeniden giriş yapın.
        </p>
      )}
      {q.kapandi === "1" && (
        <p role="status" className={styles.success}>
          Hesap kapatma talebiniz alındı. Saklama yükümlülükleri bulunan
          kayıtlar inceleme için korunur.
        </p>
      )}
      <section className={styles.panel}>
        {session && <h2>Kişisel bilgiler</h2>}
        {session ? <ProfileForm customer={session.customer} /> : <LoginForm />}
      </section>
    </>
  );
}
