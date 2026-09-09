"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { SiteContent } from "@/lib/admin/schema";
import { FormEnd, useSave } from "./shared";
import { ImageEditor } from "./images";
export function ContentForm({
  initial,
  version,
}: {
  initial: SiteContent;
  version: number;
}) {
  const [value, setValue] = useState(initial);
  const [tab, setTab] = useState("hero");
  const { busy, error, save } = useSave();
  function field<K extends keyof SiteContent>(key: K, v: SiteContent[K]) {
    setValue((p) => ({ ...p, [key]: v }));
  }
  const tabs = [
    ["hero", "Ana Sayfa"],
    ["favorites", "Favoriler"],
    ["contact", "İletişim"],
    ["footer", "Alt Bilgi"],
    ["faq", "Sık Sorulan Sorular"],
  ];
  return (
    <form
      className="admin-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save("content", { version, data: value }, "/admin/icerik");
      }}
    >
      <div className="admin-tabs" role="tablist" aria-label="İçerik bölümleri">
        {tabs.map(([id, title]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {title}
          </button>
        ))}
      </div>
      {tab === "hero" && (
        <div className="admin-editor-grid">
          <div>
            <h2>Ana Sayfa Metni</h2>
            <label>
              Başlık
              <input
                required
                maxLength={100}
                value={value.heroTitle}
                onChange={(e) => field("heroTitle", e.target.value)}
              />
            </label>
            <label>
              Açıklama
              <textarea
                rows={4}
                maxLength={500}
                value={value.heroText}
                onChange={(e) => field("heroText", e.target.value)}
              />
            </label>
            <label>
              Buton metni
              <input
                required
                maxLength={60}
                value={value.heroButton}
                onChange={(e) => field("heroButton", e.target.value)}
              />
            </label>
            <label>
              Buton bağlantısı
              <input
                required
                value={value.heroHref}
                onChange={(e) => field("heroHref", e.target.value)}
              />
            </label>
          </div>
          <aside>
            <h2>Ana Sayfa Görselleri</h2>
            <ImageEditor
              images={value.heroImages}
              onChange={(v) => field("heroImages", v)}
              max={8}
            />
          </aside>
        </div>
      )}
      {tab === "favorites" && (
        <>
          <div className="admin-toolbar">
            <h2>Favoriler</h2>
            <button
              type="button"
              disabled={value.favorites.length >= 3}
              onClick={() =>
                field("favorites", [
                  ...value.favorites,
                  {
                    title: "",
                    text: "",
                    image: "/images/products/woya/woya-01.webp",
                    alt: "",
                    href: "/koleksiyon",
                  },
                ])
              }
            >
              <Plus size={16} />
              Favori ekle
            </button>
          </div>
          <div className="admin-favorite-grid">
            {value.favorites.map((f, i) => {
              const change = (v: Partial<typeof f>) =>
                field(
                  "favorites",
                  value.favorites.map((item, n) =>
                    n === i ? { ...item, ...v } : item,
                  ),
                );
              return (
                <section key={i}>
                  <header>
                    <h3>Favori {i + 1}</h3>
                    <div className="admin-toolbar">
                      <button
                        type="button"
                        title="Öne taşı"
                        aria-label="Öne taşı"
                        disabled={i === 0}
                        onClick={() => {
                          const a = [...value.favorites];
                          [a[i - 1], a[i]] = [a[i], a[i - 1]];
                          field("favorites", a);
                        }}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        type="button"
                        title="Favoriyi kaldır"
                        aria-label="Favoriyi kaldır"
                        onClick={() =>
                          field(
                            "favorites",
                            value.favorites.filter((_, n) => i !== n),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </header>
                  <label>
                    Başlık
                    <input
                      value={f.title}
                      maxLength={80}
                      required
                      onChange={(e) => change({ title: e.target.value })}
                    />
                  </label>
                  <label>
                    Açıklama
                    <textarea
                      value={f.text}
                      maxLength={300}
                      onChange={(e) => change({ text: e.target.value })}
                    />
                  </label>
                  <label>
                    Bağlantı
                    <input
                      value={f.href}
                      required
                      onChange={(e) => change({ href: e.target.value })}
                    />
                  </label>
                  <ImageEditor
                    focus={false}
                    images={
                      f.image
                        ? [{ url: f.image, alt: f.alt, x: 50, y: 50 }]
                        : []
                    }
                    max={1}
                    onChange={(v) =>
                      change({ image: v[0]?.url ?? "", alt: v[0]?.alt ?? "" })
                    }
                  />
                </section>
              );
            })}
          </div>
        </>
      )}
      {tab === "contact" && (
        <div className="admin-narrow">
          <h2>İletişim Bilgileri</h2>
          {(
            [
              ["phone", "Telefon (+90532…)"],
              ["phoneDisplay", "Görünen telefon"],
              ["email", "E-posta"],
              ["instagram", "Instagram bağlantısı"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                value={value[key]}
                onChange={(e) => field(key, e.target.value)}
              />
            </label>
          ))}
          <label>
            Adres
            <textarea
              maxLength={600}
              rows={4}
              value={value.address}
              onChange={(e) => field("address", e.target.value)}
            />
          </label>
        </div>
      )}
      {tab === "footer" && (
        <>
          <h2>Alt Bilgi</h2>
          <label>
            Marka açıklaması
            <textarea
              value={value.footerText}
              maxLength={500}
              onChange={(e) => field("footerText", e.target.value)}
            />
          </label>
          <div className="admin-repeater">
            {value.footerLinks.map((link, i) => (
              <div className="admin-link-row" key={i}>
                <label>
                  Grup
                  <select
                    value={link.group}
                    onChange={(e) =>
                      field(
                        "footerLinks",
                        value.footerLinks.map((l, n) =>
                          i === n
                            ? {
                                ...l,
                                group: e.target.value as typeof link.group,
                              }
                            : l,
                        ),
                      )
                    }
                  >
                    {["Alışveriş", "Destek", "Yasal"].map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Metin
                  <input
                    value={link.label}
                    maxLength={80}
                    onChange={(e) =>
                      field(
                        "footerLinks",
                        value.footerLinks.map((l, n) =>
                          i === n ? { ...l, label: e.target.value } : l,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Bağlantı
                  <input
                    value={link.href}
                    onChange={(e) =>
                      field(
                        "footerLinks",
                        value.footerLinks.map((l, n) =>
                          i === n ? { ...l, href: e.target.value } : l,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  title="Yukarı taşı"
                  aria-label="Bağlantıyı yukarı taşı"
                  disabled={i === 0}
                  onClick={() => {
                    const a = [...value.footerLinks];
                    [a[i - 1], a[i]] = [a[i], a[i - 1]];
                    field("footerLinks", a);
                  }}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  title="Bağlantıyı sil"
                  aria-label="Bağlantıyı sil"
                  onClick={() =>
                    field(
                      "footerLinks",
                      value.footerLinks.filter((_, n) => n !== i),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={value.footerLinks.length >= 30}
            onClick={() =>
              field("footerLinks", [
                ...value.footerLinks,
                { group: "Alışveriş", label: "", href: "/" },
              ])
            }
          >
            <Plus size={17} />
            Bağlantı ekle
          </button>
        </>
      )}
      {tab === "faq" && (
        <>
          <div className="admin-toolbar">
            <h2>Sık Sorulan Sorular</h2>
            <button
              type="button"
              disabled={value.faqs.length >= 30}
              onClick={() =>
                field("faqs", [
                  ...value.faqs,
                  { id: crypto.randomUUID(), question: "", answer: "" },
                ])
              }
            >
              <Plus size={17} />
              Soru ekle
            </button>
          </div>
          {value.faqs.map((f, i) => (
            <section className="admin-faq-edit" key={f.id}>
              <header>
                <h3>Soru {i + 1}</h3>
                <div className="admin-toolbar">
                  <button
                    type="button"
                    title="Yukarı taşı"
                    aria-label="Soruyu yukarı taşı"
                    disabled={i === 0}
                    onClick={() => {
                      const a = [...value.faqs];
                      [a[i], a[i - 1]] = [a[i - 1], a[i]];
                      field("faqs", a);
                    }}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    title="Aşağı taşı"
                    aria-label="Soruyu aşağı taşı"
                    disabled={i === value.faqs.length - 1}
                    onClick={() => {
                      const a = [...value.faqs];
                      [a[i], a[i + 1]] = [a[i + 1], a[i]];
                      field("faqs", a);
                    }}
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    title="Soruyu sil"
                    aria-label="Soruyu sil"
                    onClick={() =>
                      field(
                        "faqs",
                        value.faqs.filter((_, n) => n !== i),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </header>
              <label>
                Soru
                <input
                  maxLength={300}
                  value={f.question}
                  onChange={(e) =>
                    field(
                      "faqs",
                      value.faqs.map((item, n) =>
                        n === i ? { ...item, question: e.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Yanıt
                <textarea
                  maxLength={2000}
                  rows={3}
                  value={f.answer}
                  onChange={(e) =>
                    field(
                      "faqs",
                      value.faqs.map((item, n) =>
                        n === i ? { ...item, answer: e.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
            </section>
          ))}
        </>
      )}
      <FormEnd busy={busy} error={error} />
    </form>
  );
}
