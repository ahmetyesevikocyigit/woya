"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  UserRound,
  Package,
  MapPin,
  ShieldCheck,
  ShoppingBag,
  Search,
  LogIn,
} from "lucide-react";
import styles from "./account.module.css";
export function AccountNav({ authenticated }: { authenticated: boolean }) {
  const pathname = usePathname();
  const links = authenticated
    ? [
        { href: "/profil", label: "Profilim", icon: UserRound },
        { href: "/profil/siparisler", label: "Siparişlerim", icon: Package },
        { href: "/profil/adresler", label: "Adreslerim", icon: MapPin },
        {
          href: "/profil/guvenlik",
          label: "Hesap güvenliği",
          icon: ShieldCheck,
        },
      ]
    : [
        { href: "/profil", label: "Giriş yap", icon: LogIn },
        { href: "/profil/kayit", label: "Kayıt ol", icon: UserRound },
      ];
  return (
    <nav className={styles.nav} aria-label="Hesap menüsü">
      <div className={styles.navPrimary}>
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={
              pathname === href ||
              (href !== "/profil" && pathname.startsWith(href + "/"))
                ? "page"
                : undefined
            }
          >
            <Icon size={19} strokeWidth={1.5} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </div>
      <div className={styles.navSecondary}>
        <Link
          href="/profil/misafir"
          aria-current={
            pathname.startsWith("/profil/misafir") ? "page" : undefined
          }
        >
          <Search size={18} strokeWidth={1.5} aria-hidden="true" />
          <span>Misafir sipariş takibi</span>
        </Link>
        <Link href="/sepet">
          <ShoppingBag size={18} strokeWidth={1.5} aria-hidden="true" />
          <span>Sepet</span>
        </Link>
      </div>
    </nav>
  );
}
