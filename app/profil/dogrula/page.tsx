import Link from "next/link";
import { TokenForm } from "../forms";
export const metadata = { title: "E-postayı doğrula" };
export default function Page() {
  return (
    <>
      <h1>E-postayı doğrula</h1>
      <TokenForm action="verify" />
      <p style={{ marginTop: 24 }}>
        <Link href="/profil/sifremi-unuttum">Şifremi unuttum</Link>
      </p>
      <p style={{ marginTop: 24 }}>
        <Link href="/profil/dogrulama-gonder">
          Yeni doğrulama bağlantısı iste
        </Link>
      </p>
      <p style={{ marginTop: 24 }}>
        <Link href="/profil">Girişe dön</Link>
      </p>
    </>
  );
}
