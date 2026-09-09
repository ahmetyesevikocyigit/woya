"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChartNoAxesCombined,
  Package,
  Layers,
  ClipboardList,
  FileText,
  Image,
  ExternalLink,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  Ruler,
  Settings,
  Bell,
} from "lucide-react";
const links = [
  ["/admin", "CMS Ana Sayfa", ChartNoAxesCombined],
  ["/admin/urunler", "Ürünler ve Fiyatlar", Package],
  ["/admin/fiyatlandirma", "Ölçü ve Fiyatlandırma", Ruler],
  ["/admin/kategoriler", "Kategoriler", Layers],
  ["/admin/siparisler", "Siparişler", ClipboardList],
  ["/admin/musteri-islemleri", "Müşteri İşlemleri", ClipboardList],
  ["/admin/magaza", "Mağaza Ayarları", Settings],
  ["/admin/bildirimler", "Bildirimler", Bell],
  ["/admin/icerik", "Site İçeriği", FileText],
  ["/admin/medya", "Görsel Kütüphanesi", Image],
  ["/admin/guvenlik", "Güvenlik", ShieldCheck],
] as const;
export function AdminNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  return (
    <>
      <div className="admin-mobile-bar">
        <Link href="/admin">WOYA / CMS</Link>
        <button
          onClick={() => setOpen(!open)}
          aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
          aria-expanded={open}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <button
          className="admin-menu-backdrop"
          aria-label="Menüyü kapat"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className="admin-sidebar" data-open={open}>
        <Link className="admin-wordmark" href="/admin">
          WOYA<span>İçerik ve mağaza yönetimi</span>
        </Link>
        <nav aria-label="Yönetim menüsü">
          {links.map(([href, title, Icon]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={
                (
                  href === "/admin"
                    ? pathname === href
                    : pathname.startsWith(href)
                )
                  ? "page"
                  : undefined
              }
            >
              <Icon size={19} />
              {title}
            </Link>
          ))}
        </nav>
        <div className="admin-account">
          <a href="/" target="_blank" rel="noreferrer">
            <ExternalLink size={17} />
            Mağazayı görüntüle
          </a>
          <span>Yönetici</span>
          <button
            onClick={async () => {
              try {
                const r = await fetch("/api/admin/auth", { method: "DELETE" });
                if (!r.ok) throw new Error();
                window.location.assign("/admin/giris");
              } catch {
                setError("Çıkış yapılamadı. Tekrar deneyin.");
              }
            }}
          >
            <LogOut size={17} />
            Güvenli çıkış
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      </aside>
    </>
  );
}
