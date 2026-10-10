"use client";

import Link from "next/link";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const links = [
  ["Koleksiyon", "/koleksiyon"],
  ["Saatler", "/saatler"],
  ["Üçlü Setler", "/uclu-setler"],
  ["Tablolar", "/tablolar"],
  ["Kendi Tasarımınız", "/#kendi-tasariminiz"],
  ["İletişim", "/iletisim"],
  ["Hesabım", "/profil"],
] as const;

export function MobileMenu() {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && ref.current) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    }
    function onPointer(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        ref.current &&
        !ref.current.contains(event.target)
      ) {
        ref.current.open = false;
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <details
      className="mobile-menu"
      ref={ref}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        className="mobile-nav-tab"
        aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
      >
        {open ? (
          <X size={22} aria-hidden="true" />
        ) : (
          <Menu size={22} aria-hidden="true" />
        )}
      </summary>
      <nav className="mobile-menu-panel" aria-label="Mobil navigasyon">
        {links.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            onClick={() => {
              if (ref.current) ref.current.open = false;
            }}
          >
            {label}
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </details>
  );
}
