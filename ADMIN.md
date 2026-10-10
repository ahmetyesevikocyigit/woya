# WOYA Yönetim Paneli

## Günlük kullanım — 10 Ekim 2026

Canlı panel: https://woyatablo.com/admin

- **Ürünler ve Fiyatlar**: Ürünü arayıp açın. **Ürün ve görseller** bölümünde ad, açıklama, kategori ve görseller; **Ölçü ve fiyatlar** bölümünde normal/indirimli ölçü fiyatları; **Kişiselleştirme** bölümünde oluşturucu parçaları yönetilir.
- **Kişiselleştirme Fiyatları**: Set ve tekli saat tarifeleri ayrı bölümlerdedir. Özel ölçü m² tarifeleri ve ölçü seçenekleri ayrıca düzenlenir. Bunlar oluşturucu fiyatlarıdır; hazır ürünün kendi ölçü fiyatlarını değiştirmez.
- Kaydet ve yayınla / Değişiklikleri kaydet düğmesi açık fiyat düzenlemelerini de kaydeder. Bölüm değiştirirken girilmiş değerler korunur. Ölçü seçimleri arasında değiştirilen geçerli fiyatlar listeye alınır; geçersiz fiyatlar hata gösterir.
- Kayıtlı fiyatlar varsayılan olarak açık görünür. Seçeneklerden kaldırılmış eski ölçü satırları görünür ve korunur; fiyatı silmek ayrı bir işlemdir.
- Site ve mağaza ayarları sol menüde açılır. Mevcut içerik, görsel, ödeme, kargo, güvenlik ve sipariş araçları korunmuştur.
- Kod yayınları üretim verilerini sıfırlamaz. Veri değişikliği testleri yalnızca ayrı veritabanı ve yükleme klasörlerinde yapılır. Eski sürümden kaydetme girişimleri sürüm denetimiyle reddedilir.

## Durum ve sınırlar

PayTR iFrame ödeme akışı eklendi; varsayılan olarak kapalı ve test modundadır. Kurulum, gizli ortam değerleri, veritabanı migration'ı, bildirim adresi ve canlıya geçiş kontrolleri için [PAYTR.md](PAYTR.md) dosyasını okuyun. Bu kod değişikliği canlı ödeme aktivasyonu değildir. Entegrasyonlar ekranı ve eski sipariş talebi formu kapalı kalır; `/api/siparis-talebi` HTTP 410 döndürür. Sipariş geçmişi korunur.

7 Eylül 2026 tarihinde kullanıcının sonraki yayın onayıyla Vercel'e yayınlandı: https://woya-tablo.vercel.app. Yönetim girişi https://woya-tablo.vercel.app/admin/giris adresindedir; tek yönetici yalnızca parolayla giriş yapar. Neon PostgreSQL ve Vercel Blob production ortamına bağlandı. Başlangıçta 54 katalog kaydı, 5 kategori ve site içeriği aktarıldı; örnek sipariş oluşturulmadı. Parola sohbete veya repoya yazılmadı; yerel kullanıcının `~/.config/woya/admin-production.json` dosyasında yalnızca kendisinin okuyabileceği izinlerle saklanır.

Yeni/yerel kurulumlarda gerekli ortam değerleri olmadan `/admin/giris` kurulum bekleniyor ekranını gösterir; açık bir demo girişi yoktur. Mağaza, veritabanı tanımlı değilken mevcut katalogla çalışmayı sürdürür. Bağlantı tanımlanmış ama erişilemiyorsa eski/veri dışı kayıtlarla başarı taklidi yapılmaz.

PostgreSQL kayıtların asıl kaynağıdır. Aynı veritabanı katmanı hem Vercel hem VPS'te çalışır. Dosya depolamada `local` (VPS kalıcı diski) ve `blob` (Vercel Blob) sürücüleri vardır. Vercel üzerinde yerel dosya yazımı özellikle engellenir. PGlite yalnızca otomatik testlerde kullanılır; üretim veritabanı değildir.

## Kurulum

Şifre yönetimi için `db/002-admin-security.sql` migration'ı eklendi. `pnpm admin:setup` bu migration'ı da uygular ve yalnızca ilk seferde `ADMIN_PASSWORD_HASH` değerini veritabanına aktarır. Sonraki kurulum/yayınlar panelde değiştirilmiş şifreyi sıfırlamaz. Canlıya yeni kodu göndermeden önce migration uygulanmalıdır.

1. `.env.example` içindeki alanları mevcut `.env.local` dosyasına ekleyin. Mevcut dosyayı ezmeyin. Secret bilgileri sohbete veya Git'e koymayın.
2. PostgreSQL bağlantı adresini `DATABASE_URL` içine yazın. Mevcut Neon/Supabase/PostgreSQL kullanılabilir. Uzak bağlantıda sağlayıcının TLS ayarını koruyun (`sslmode=require` gibi); sertifika doğrulamasını devre dışı bırakmayın.
3. Veritabanınız yoksa VPS'te veya Docker bulunan geliştirme bilgisayarında `DB_PASSWORD` için güçlü, rastgele bir parola belirleyin. `docker compose --env-file .env.local up -d db` komutu yalnızca PostgreSQL'i başlatır. Veriler `woya_postgres` kalıcı volume'ünde saklanır. PostgreSQL yalnızca localhost'a açılır. Aynı makinede çalışan Next.js için `DATABASE_URL=postgres://woya:PAROLA@127.0.0.1:5432/woya` kullanılır. Paroladaki özel URL karakterlerini encode edin. `docker compose down -v` verileri siler; kullanmayın.
4. `pnpm admin:password` komutunu gerçek terminalde çalıştırın. Parola görünmeden alınır; en az 12 karakter olmalıdır. Çıktıdaki bcrypt hash ve rastgele session secret satırlarını `.env.local` içine ekleyin. Next.js ortam dosyasında bcrypt'in `$` karakterleri `\$` olarak kaçırılmalıdır; komut bunu hazır verir. Tek yönetici yalnızca parolayla giriş yapar; e-posta gerekmez. Varsayılan parola yoktur.
5. `APP_URL` tam origin olmalıdır: yerelde `http://localhost:3000`, VPS'te `https://alanadiniz.com`. Sonunda slash, yol veya birden fazla origin olmamalıdır. Form isteklerinin kaynağı buna göre doğrulanır.
6. `pnpm admin:setup` çalıştırın. Şema, mevcut ürünler ve satılabilir ürünlerin düzenlenebilir başlangıç fiyatları ilk kurulumda aktarılır. Stoklar boş bırakılır. Sonraki çalıştırmalar düzenlenen/silinen ürünleri geri yüklemez. Komut üretim build sırasında otomatik çalışmaz.
7. Mevcut canlı veritabanında fiyatı boş kalan ürünleri doldurmak için `pnpm catalog:prices` çalıştırın. Bu komut mevcut fiyatları korur, yalnızca boş satılabilir ürünleri 1.500 TL başlangıç fiyatıyla doldurur. Bilerek tüm satılabilir ürünleri aynı başlangıç fiyatına çekmek isterseniz `pnpm catalog:prices:overwrite` kullanın.
8. Görseller için aşağıdaki sürücülerden birini seçin. Ardından `pnpm dev` ile açın ve `/admin/giris` sayfasına gidin.

### VPS görsel diski

`STORAGE_DRIVER=local`, `UPLOAD_DIR=/var/lib/woya/uploads` kullanın. Klasörü Node uygulamasını çalıştıran kullanıcıya yazılabilir olacak şekilde oluşturun. Bu klasör release/proje klasörünün dışında kalmalı; konteyner kullanıyorsanız kalıcı volume olarak bağlanmalıdır. `UPLOAD_DIR` dışarıya doğrudan servis edilmez; yalnızca UUID adlı WebP dosyaları `/media/[name]` üzerinden okunur.

### Vercel'de geçici kullanım

`STORAGE_DRIVER=blob` ve `BLOB_READ_WRITE_TOKEN` tanımlayın. Blob deposu public olmalı; yalnızca ürün fotoğrafları içindir. Müşteri bilgileri Blob'a yazılmaz. VPS'e geçişte mevcut Blob bağlantıları çalışmaya devam eder; yeni görseller yerel sürücüye yazılabilir. Blob'u kapatmadan önce eski dosyaları taşıyıp ürün/içerik URL'lerini güncelleyin.

Mevcut production kaynakları: `woya-admin-db` (Neon Free, Frankfurt) ve `woya-product-images` (public Blob, Frankfurt). `APP_URL` ve `NEXT_PUBLIC_SITE_URL` değeri `https://woya-tablo.vercel.app`; depolama sürücüsü `blob`. Yönetici hash ve session secret, Vercel'de Secret türündedir. Doğrulanan yayın kimliği: `dpl_AV1qdcEejsnfG5ShRGLpEEwEC2df`. VPS'e geçerken yeni boş kurulum yapmak yerine production veritabanını ve görsellerini taşıyın; sonrasında alan adı/origin ayarlarını güncelleyin.

## Ekranlar

| URL                      | İşlev                                                                         |
| ------------------------ | ----------------------------------------------------------------------------- |
| `/admin/giris`           | Güvenli yönetici girişi                                                       |
| `/admin`                 | Ürün/sipariş sayıları ve hızlı işlemler                                       |
| `/admin/urunler`         | Arama, kategori/durum filtresi, sayfalama                                     |
| `/admin/urunler/yeni`    | Yeni ürün                                                                     |
| `/admin/urunler/[id]`    | Ürün, ölçü, yayın durumu ve görseller                                         |
| `/admin/kategoriler`     | Kategori ekleme/düzenleme/silme, aktiflik, sıra ve sayfa üyeliği              |
| `/admin/icerik`          | Hero, favoriler, iletişim, footer ve SSS                                      |
| `/admin/siparisler`      | Sipariş geçmişi, sunucuda arama/filtreleme ve sayfalama                       |
| `/admin/siparisler/[id]` | Müşteri, ürünler, iç not ve durum geçmişi                                     |
| `/admin/medya`           | Mevcut görseller ve kalıcı yükleme                                            |
| `/admin/guvenlik`        | Mevcut şifreyle şifre değiştirme, oturum özeti ve diğer oturumları kapatma    |
| `/admin/fiyatlandirma`   | Tablo/saat m² bedelleri, hazır ölçüler ve özel ölçü sınırları                 |
| `/sepet`                 | Ürün/adet yönetimi, güncel fiyatlar ve yapılandırıldığında PayTR ödeme geçişi |
| `/odeme`                 | Teslimat bilgileri ve sunucuda doğrulanan ödeme özeti                         |

## İş kuralları

- Ürün ve kategori pasifse ürün listelerden, detay sayfasından, aramadan ve eski model kişiselleştirme seçeneklerinden çıkar.
- Yeni ürün başlangıçta pasiftir. Satışa uygunluk ürün ve kategorinin aktifliğine bağlıdır; stok takibi kullanılmaz. Eski `stock` verileri uyumluluk için korunur ama listeleri, builder seçeneklerini veya sepeti engellemez. Tablo, saat ve setlerde hazır ölçüler ürünün satıcı tarafından girilen `price` / `salePrice` değerlerini kullanır. Yalnızca özel ölçüde global m² bedellerinden hesap yapılır. Saat şekli ürün formundan kare/dikdörtgen veya yuvarlak olarak seçilir.
- Öne çıkan ürünler listelerde önce görünür. Anasayfa Favoriler alanı ayrı yönetilir; en fazla üç kart, sıralama ve bağlantıları düzenlenebilir. Mevcut `FA / VO / Rİ / LER` başlık stili korunmuştur.
- Görseller en fazla 4 MB, JPG/PNG/WebP/AVIF olabilir. Sunucu dosyayı gerçekten decode eder, EXIF yönünü uygular, metadata'yı kaldırır ve en fazla 2400 px WebP üretir. SVG/HTML yüklenmez. Kapak sırası, alternatif metin ve yüzdeyle odak konumu düzenlenir. Bu bir görsel dosyası crop işlemi değil, görünüm odağıdır.
- Yeni set ve saat fotoğrafları ürün formundaki **Kendin Oluştur Parçaları** alanında hazırlanabilir. Kırpma onayı görselleri kütüphaneye ekler; ürün kaydedilip ürün ve kategorisi aktif olduğunda parçalar seçicide görünür. Eski hazırlanmış model parçaları korunur.
- Sepetler tarayıcıdadır. Açık veya terk edilmiş sepet analitiği yoktur; panel bu konuda sahte sayı göstermez.
- Yeni sipariş talebi oluşturulmaz. Eski kayıtların ürün/fiyat snapshot'ları korunur. Kişiselleştirme dahil fiyatlar sunucuda hesaplanır; PayTR başlangıcında aktiflik ve fiyat yeniden doğrulanır. Fiyat kontrolü tek başına ödeme değildir.
- Sipariş durumunu değiştirmek ödeme alındı anlamına gelmez. Ödeme yalnızca doğrulanmış PayTR bildirimiyle kaydedilir. Test ve ödemesi doğrulanmamış siparişler hazırlama/gönderim durumuna alınamaz. Stok rezervasyonu/düşümü veya e-posta/SMS bağlı değildir.
- Ürün silinince eski sipariş kalemleri korunur. Kullanılan kategori silinemez. Kayıt sürümü kontrol edilir; başka sekmede değişmiş ürün/içerik/sipariş üzerine sessizce yazılmaz.
- Doğrudan satış açılmadan önce ödeme sağlayıcısı, gerçek fiyatlar, işletmenin aydınlatma metni, saklama süresi ve yasal footer belgeleri tamamlanmalıdır.

## Panel sadeliği ve performans

### Fotoğraftan ürün parçaları

8 Eylül 2026: ürün ekleme/düzenleme ekranında **Fotoğraftan parçaları hazırla** eklendi. Bu çalışma henüz canlıya gönderilmedi.

1. `/admin/urunler/yeni` veya mevcut ürünün düzenleme ekranında ürün tipini set ya da saat seçin.
2. **Fotoğraftan parçaları hazırla** ile kapak fotoğrafını açın veya kütüphaneden başka bir fotoğraf yükleyin/seçin.
3. Set için sol tablo, saat ve sağ tablo sekmelerinde dört köşeyi ürünün dış çerçevesine yerleştirin. Köşeler sol üstten başlayarak saat yönünde numaralandırılır. Dokunarak/sürükleyerek, ok tuşlarıyla veya yüzde alanlarıyla ayarlanabilir. Yakınlaştırma %100–250 arasındadır.
4. Çıktı oranını seçin. Yuvarlak saatte yuvarlak kesim kullanın; köşeleri saati çevreleyen karenin köşelerine yerleştirin. Perspektif düzeltmesi seçtiğiniz düzlemsel alanı dikdörtgene taşır; örtülmüş detayları veya yansımaları yeniden oluşturmaz.
5. **Önizlemeleri hazırla** sonuçları gösterir; kalıcı dosya yazmaz. Köşe/oran/kaynak değişikliği eski önizlemeyi geçersiz kılar. **Parçaları ürüne uygula** onayından sonra **Değişiklikleri kaydet** ile ürünü kaydedin.

Asıl fotoğraf değiştirilmez. Onaylanan WebP parçalar mevcut Blob/VPS sürücüsünde ve görsel kütüphanesinde saklanır. Ürünü kaydetmeden ayrılırsanız parçalar kütüphanede kalır ama seçicide yayınlanmaz. Kırpma tanımları ürünün JSON kaydında saklanır; ek migration veya env gerekmez. Kırpma aracı yalnızca açıldığında yüklenir; mağazaya köşe koordinatları değil sadece parça bağlantıları gönderilir.

Yeni fotoğraflarda kadran fotoğraftaki haliyle kullanılır; hazırlanmış alternatif kadran bulunmadığından Normal/Minimal seçimi gösterilmez. Mevcut modellerdeki kadran seçenekleri değişmez. Parçaları kapatmak ürünü silmez; güncel sepet doğrulaması kapalı/silinmiş parçaları reddeder. Hazır fiyat ve özel ölçü m² kuralları korunur.

`POST /api/admin/crop`: yönetici oturumu, Origin kontrolü, 12 KB JSON limiti, saatte 120 işlem, geometrik doğrulama. Kaynaklar yalnızca güvenli yerel görseller veya veritabanı kütüphanesine kayıtlı public Blob bağlantılarıdır; yönlendirmeler engellenir. Kaynak en fazla 12 MB / 40 milyon piksel; işleme en fazla 2400 px, önizleme 420 px, kayıt 1024 px. Perspektif matrisi MIT lisanslı [perspective-transform](https://github.com/jlouthan/perspective-transform) ile hesaplanır; pikseller bilineer örneklenir. Yuvarlak kesimin dışı saydamdır.

Testler: `pnpm test:crop`, `pnpm test:admin`, `pnpm test:pricing`, `pnpm test:artwork`, `pnpm build`, `pnpm typecheck`, `pnpm test:admin:http`. Tarayıcıdaki etkileşim/görünüm kontrolü, kayıtlı tarayıcı erişim kısıtı nedeniyle tamamlanamadı.

### Diğer düzenlemeler

- Panel içeriği üstten hizalanır; uzun ürün adı yerine düzenleme ekranında sabit başlık kullanılır. Stok alanları, düşük stok ve son ürün bölümleri kaldırıldı. Ölçü satırlarının girişleri ve işlem düğmeleri aynı tabana hizalanır.
- Her Node sürecinde tek PostgreSQL bağlantı havuzu kullanılır. Admin okumaları ve oturum kontrolleri istekler arasında önbelleğe alınmaz. Ürün düzenleme tek kaydı okur; liste/kategori ekranları istemciye yalnızca kullandıkları alanları gönderir.
- Mağaza kataloğu ve site içeriği 300 saniyelik veri önbelleğini kullanır. Ürün, kategori, içerik ve fiyat kaydı/silmesi `woya-storefront` etiketini anında geçersiz kılar. Admin değişikliklerinin görünmesi için süre dolması beklenmez. Önbellek farklı veritabanları arasında paylaşılmaz.
- Sepet fiyat endpoint'i bu görüntüleme önbelleğini atlar; güncel fiyat ve aktiflik her istekte veritabanından doğrulanır. Ödeme sistemi halen bağlı değildir.
- Görsel seçici açılmadan kütüphane yüklenmez. Liste önizlemeleri Next Image ile boyutlandırılır; kütüphanede ilk 36 görsel gösterilir. Hero yalnızca mevcut, sonraki ve geçişteki önceki kareyi yükler; sonraki görsel yüklenmeden geçmez.
- Kontroller: `pnpm build`, `pnpm typecheck`, `pnpm test:pricing`, `pnpm test:admin`, `pnpm test:admin:http`. HTTP testleri önbellek yenilemeyi, önbellekten bağımsız sepet doğrulamasını, eski stok değerlerini ve sadeleşen admin ekranlarını kapsar. Tarayıcı erişim izni nedeniyle görsel kontrol tamamlanmadı. Bu değişiklikler canlıya gönderilmedi.

## Güvenlik ve işletim

- Tek yönetici rolü, bcrypt parola doğrulama, 8 saatlik sunucu oturumu, rastgele token'ın yalnızca SHA-256 özeti PostgreSQL'de saklanır. Cookie HttpOnly, SameSite=Strict ve üretimde Secure'dur. Çıkış DB oturumunu iptal eder.
- Her korumalı ekran ve her yönetim API işlemi sunucuda yetkilendirilir. Mutation'larda Origin kontrolü, Zod doğrulama, parametrik SQL ve boyut limitleri uygulanır. Giriş ve yükleme/talep/Trendyol istekleri PostgreSQL tabanlı limitlenir. Panel arama motoruna kapalıdır.
- Vercel'de platformun IP başlığı, diğer ortamlarda güvenli ortak limit kovası kullanılır. VPS'te gerçek IP başlığı körlemesine güvenilmez. Trafik arttığında reverse proxy üzerinde ek IP bazlı limit koyun; `/api/admin/auth` için özellikle önemlidir.
- Yönetim değişiklikleri `woya_audit` içinde kaydedilir; müşteri notları ve parolalar uygulama loglarına yazılmaz. İşletme politikasına göre eski talepleri/audit kayıtlarını periyodik temizleyin.
- Şifre `/admin/guvenlik` ekranından mevcut şifre doğrulanarak değiştirilir. Yeni şifre en az 12 karakter ve bcrypt sınırı nedeniyle en fazla 72 UTF-8 bayt olmalıdır. Yeni şifre ve tekrarı eşleşmelidir; mevcut şifre yeniden kullanılamaz. Bcrypt hash, sürüm artışı, tüm oturumların silinmesi ve audit kaydı tek transaction'dadır. Başarılı değişimde mevcut oturum da kapanır; yeni şifreyle giriş gerekir. Yeni şifre yerel dosyaya veya loglara yazılmaz; başlangıç bilgisi dosyası artık güncel olmayabilir.
- Diğer oturumları kapatma işlemi mevcut oturumu korur. Oturumlar credential sürümüne bağlıdır; veritabanı trigger'ı da şifre değiştikten sonra eski yayınların ilk şifreyle yeni oturum oluşturmasını engeller. API işlemleri yetki, Origin ve rate-limit kontrolü yapar. Şifre doğrulamasıyla eşzamanlı şifre değişimi arasındaki yarış veritabanı kilitleriyle korunur.
- Şifre unutulursa e-posta ile sıfırlama yoktur: yetkili sunucu/veritabanı erişimiyle yeni bcrypt hash atanmalı, credential sürümü artırılmalı ve tüm oturumlar aynı transaction'da silinmelidir. Yalnızca Vercel'deki eski `ADMIN_PASSWORD_HASH` değerini değiştirmek artık şifreyi sıfırlamaz.
- VPS: Node.js 22+ (test ortamı 24), PostgreSQL 17+, HTTPS reverse proxy ve process manager/systemd kullanın. Sunucuya kaynak klasörünün tamamını kopyalamayın; [VPS yayın rehberindeki](VPS_DEPLOYMENT.md) `pnpm vps:package` çıktısını yayınlayın. Dış dünyaya sadece 80/443 açın; Node/PostgreSQL portlarını iç ağda tutun. HTTPS üzerinde Secure cookie/HSTS politikasını reverse proxy'de etkinleştirin.
- Günlük `pg_dump` yedeği ve `UPLOAD_DIR` yedeği alın. Yedekler VPS dışında saklanmalı ve geri yükleme düzenli denenmelidir. `.env.local` dosyasını da şifreli ve erişimi sınırlı saklayın.

## Trendyol

`TRENDYOL_SUPPLIER_ID`, `TRENDYOL_API_KEY`, `TRENDYOL_API_SECRET` yalnızca server-side kullanılır. Servis `lib/integrations/trendyol.ts` içindedir. API sabit Trendyol hostuna, Basic Auth ile, 15 saniyelik timeout ve redirect engeliyle gider. Token/credential admin ekranına gönderilmez.

Entegrasyonlar ekranı kaldırıldı; sunucu servis katmanı ileride kullanılmak üzere korunuyor. Yetkili API bağlantı kontrolü yalnızca ilk onaylı ürün sayfasını okur ve adet döndürür. Otomatik import/senkronizasyon **uygulanmadı ve açık değildir**. Gerçek cevapla V2 content/variant, barkod, kategori ve stok/fiyat eşleştirmesi doğrulandıktan sonra idempotent aktarım eklenmelidir. Örnek ürünler Trendyol'dan gelmiş gibi gösterilmez.

Resmi başvurular: [Trendyol onaylı ürün servisi](https://developers.trendyol.com/v3.0/reference/filterapprovedproducts), [Vercel Blob sunucu yükleme](https://vercel.com/docs/vercel-blob/server-upload), [Postgres.js](https://github.com/porsager/postgres).

## Testler

```sh
pnpm typecheck
pnpm test:admin
pnpm test:pricing
pnpm build
pnpm test:admin:http
```

HTTP testi önce bir üretim build'i ister. Ayrı geçici PostgreSQL uyumlu PGlite örneği, otomatik seçilen boş portlar, rastgele test giriş bilgileri ve geçici görsel klasörü kullanır. Var olan veritabanını, canlıyı veya müşteri sepetini değiştirmez; sonunda sunucuları kapatır ve test yüklemelerini temizler. SQL/HTTP doğrulaması tarayıcı görsel/etkileşim testinin yerine geçmez.

Son doğrulama (7 Eylül 2026): TypeScript kontrolü ve üretim build'i başarılı; 6 veri/doğrulama testi ve 57 HTTP kontrolü geçti. Yalnızca parolayla giriş değişikliğinden sonra build ve 57 HTTP kontrolü tekrar geçti. Vercel üretim build'i başarılı. Yayından önce ve ana adrese geçişten sonra mağaza sayfaları, şifreli giriş, korumalı admin modülleri ve çıkış sunucu üzerinden doğrulandı. Anonim yönetim API isteği reddedildi; boş sipariş talebi doğrulama hatası verdi. Canlı veritabanı kayıt sayıları ve Blob erişimi doğrulandı. Tarayıcı erişimi izin vermediğinden görsel ve etkileşimli mobil/tablet/desktop kontrolü tamamlanamadı. VPS'e henüz yayın yapılmadı.

## Dosyalar

### Ölçü ve metrekare fiyatlandırması

- Ayarlar mevcut PostgreSQL `woya_content` tablosunda `id='pricing'` kaydına yazılır; ek migration veya env gerekmez. İlk kayıt sürüm 0 üzerinden oluşturulur; sonraki değişiklikler iyimser sürüm kontrolü ve audit kaydıyla yapılır. Site içeriği kaydından bağımsızdır.
- Başlangıçta gerçek m² bedelleri boş bırakılır. Bu bedeller yalnızca özel ölçü siparişleri için gereklidir; hazır ölçüler ürünün fiyatını/indirimli fiyatını kullanır. Standart fiyatı olmayan üründe m² bedeline otomatik geçilmez. Özel ölçü fiyatına ürünün standart indirimi uygulanmaz.
- Kendin Oluştur standart set ve tek saat bedelleri `/admin/fiyatlandirma` üzerinden `builderSetPrice` ve `builderClockPrice` olarak ayrı girilir. Başlangıçta boştur; seçilen kaynak setlerin toplam fiyatından parça fiyatı türetilmez ve hayali bedel atanmaz. Bu değerlerin eklenmesi veritabanı migrasyonu gerektirmez.
- Varsayılan tablo 50 × 70 cm, kare saat 60 × 60 cm, yuvarlak saat 60 cm çaptır. Hazır ölçüler ve 10–200 cm başlangıç sınırları admin tarafından değiştirilebilir; sistem 1–500 cm ve tek ondalık basamağa kadar giriş kabul eder. İlk hazır ölçü varsayılan seçimdir.
- Dikdörtgen alanı `en × boy / 10000`, yuvarlak saat alanı `π × (çap / 200)²` m²'dir. Set için aynı panel ölçüsü iki defa sayılır, saat alanı bir defa eklenir. Rakam stili veya karışık model için gizli/sabit ek ücret uygulanmaz. Tablo ve saat alt toplamları kuruşa yuvarlanıp toplanır.
- Katalogdaki fiyat satıcının ürün için girdiği standart fiyat/indirimli fiyattır. Satılabilir seed ürünlerde düzenlenebilir başlangıç fiyatı 1.500 TL'dir; 5 TL test ürünü hariç tutulur. Ürün kartındaki Ölçü Seç bağlantısı ürün detayına gider. Hazır ölçüler arasında geçiş bu fiyatı değiştirmez. Ölçü alanlarından herhangi birinde özel ölçü seçilirse seçim tamamı için alan hesabı yapılır; setin iki tablosu ortak ölçü kullanmaya devam eder. Yeni fiyat ayarları yeni sayfa yüklemelerinde ve tüm sunucu fiyat doğrulamalarında uygulanır.
- Sepet anahtarı ürün/model/ölçü/rakam ve standart/özel ölçü seçimini içerir; aynı sayısal ölçü özel olarak girildiğinde hazır seçimle birleştirilmez. Sunucu standart işaretlenmiş keyfi ölçüleri reddeder. Eski mod bilgisi olmayan satırlarda hazır ölçü eşleşmesi standart fiyatı, eşleşmeyen ölçü alan hesabını seçer. Eski ölçüsüz sepet satırları silinmez, yeniden ölçü seçilmesi istenir. Sepet fiyatları sayfa açılışında, adet değişiminde, odaklanmada ve açık sayfada 30 saniyede bir yenilenir.
- Ödeme sağlayıcısı ortam ayarlarına bağlıdır. Varsayılan katalog fiyatları ödeme akışını tek başına canlıya almaz; canlı veritabanında `catalog:prices` komutu çalıştırıldığında sunucu fiyat doğrulaması bu güncel kayıtları kullanır.
- Yeni modüller: `lib/{pricing,quote,cart-key,builder-catalog}.ts`, `app/api/sepet/fiyat/route.ts`, `app/admin/ui/pricing.tsx`, `app/components/{measurement-controls,measured-product,price-summary}.tsx`, ölçü CSS modülü ve `tests/pricing.test.ts`. Mevcut admin veri/API, ürün adaptörü, ürün detayı, builder ve sepet bileşenleri bunlara bağlandı.
- Doğrulama: 9 fiyatlandırma testi, 7 mevcut admin testi, 98 HTTP kontrolü geçti. HTTP testleri m² bedeli değişince aynı sepetin yeniden fiyatlanmasını, yetkisiz/farklı origin isteklerini, geçersiz ölçüleri, çakışan ayar kayıtlarını ve iki tablonun ortak ölçüsünü kapsar. Test veritabanı canlıdan ayrıdır. Tarayıcı localhost izni engellediği için görsel/etkileşimli ekran kontrolü tamamlanamadı.

Talep akışının ve Entegrasyonlar ekranının kaldırılmasından sonra üretim build'i, 6 veri testi ve güncellenmiş 55 HTTP kontrolü başarılı. Yeni kontroller kaldırılan API'nin kayıt oluşturmamasını, kaldırılan ekranın erişilememesini ve eski sipariş kayıtlarının yönetilebilir kalmasını doğrular.

- `app/admin/**`: korumalı panel, giriş, liste/form/bileşenler, modüle özel CSS, loading/error.
- `app/api/admin/**`: giriş/çıkış, yetkili CRUD, medya ve Trendyol kontrolü.
- `app/api/siparis-talebi/route.ts`, `app/media/[name]/route.ts`: kaldırılmış talep adresinin 410 yanıtı ve VPS görsel sunumu.
- `app/destek-talebi/route.ts`: destek formunu paneldeki iletişim numarasına yönlendirme.
- `lib/admin/{schema,db,auth,http,defaults,repository,storage}.ts`: tipler, doğrulama, güvenlik, veritabanı ve sürücüler.
- `lib/storefront.ts`, `lib/integrations/trendyol.ts`: mağaza veri adaptörü ve entegrasyon sınırı.
- `db/001-admin.sql`, `db/002-admin-security.sql`, `scripts/admin-{setup.ts,password.mjs}`, `compose.yaml`, `.env.example`: kurulum.
- `lib/admin/security.ts`, `lib/admin/security-schema.ts`, `app/api/admin/security/route.ts`, `app/admin/ui/security.tsx`: şifre değişimi, güvenlik ekranı ve oturum yönetimi.
- `app/{page.tsx,iletisim/page.tsx,sss/page.tsx,sepet/page.tsx,saatler/page.tsx,tablolar/page.tsx,urunler/page.tsx,urunler/[slug]/page.tsx,koleksiyon/page.tsx,sitemap.ts,robots.ts}`: kalıcı veriye bağlantı ve indeksleme.
- `app/data/products.ts`, `app/components/{product-card.tsx,product-detail-gallery.tsx,site-chrome.tsx,site-search.tsx,faq-section.tsx,custom-builder.tsx,cart-provider.tsx,cart-page-client.tsx}`: mevcut mağazayla entegrasyon. Kullanılmayan inquiry-form bileşeni/stili ve admin entegrasyon bileşeni silindi.
- `tests/admin.test.ts`, `tests/admin-http.ts`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `next.config.mjs`: doğrulama, bağımlılıklar ve güvenli medya/header ayarları.
