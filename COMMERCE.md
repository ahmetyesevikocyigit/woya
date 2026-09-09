# WOYA mağaza kurulumu

Mağaza ayarları: `/admin/magaza`. Tüm para alanları API/veritabanında tam kuruş, panelde TL olarak tutulur. Boş kargo/teslimat ayarları tahmin edilmez. Stok adedi kullanılmaz; aktif, fiyatı tanımlı ürünler satılır. Özel ölçü ve oluşturucu fiyatları `/admin/fiyatlandirma` altında yönetilir.

## Canlı tahsilat kapısı

`PAYTR_ENABLED=false` varsayılandır. `PAYTR_TEST_MODE=1` ile PayTR denemesi yapılır. Canlı satış ayrıca `COMMERCE_LIVE_VERIFIED=true` ve tamamlanmış mağaza/satıcı/sözleşme ayarlarını gerektirir. Bu işareti ancak gerçek PayTR test callback'i, belirlenen test alıcısına teslimat ve satış metinleri doğrulandıktan sonra sunucuda ayarlayın. Taksit ve vade farkı PayTR mağaza ayarlarından gelir; `no_installment=0,max_installment=0`. Sipariş bedeli ve imzalı tahsilat toplamı ayrı saklanır.

Tarayıcı dönüşü ödeme kanıtı değildir. Callback `/api/paytr/bildirim`, HMAC doğrulama ve DB işlemi tamamlanınca `OK` döner. Sonucu belirsiz ödemeler panelde görünür, yeni ödeme otomatik başlatılmaz. PayTR panelinde araştırılmalıdır.

## Kalıcı kayıtlar

`db/005-commerce.sql` eklemelidir ve tekrar çalıştırılabilir. Önce güncel yedeği geçici veritabanına geri yükleyin, migration'ı iki kez uygulayın; eski tabloların içerik özetlerini karşılaştırın. Üretimde aynı SQL'i tek işlemde uyguladıktan sonra `/etc/woya/approved-db.sha256` manifestini güncelleyin. Eski siparişlere geçmiş sözleşme/fatura/adres üretilmez.

Yeni siparişlerde ürün/ölçü/fiyat/adres snapshot'ları ve sipariş anındaki mağaza/sözleşme metinleri korunur. DB tetikleyicileri sonradan değiştirilmelerini engeller.

PDF faturalar `PRIVATE_DOCUMENT_DIR=/var/lib/woya/private-documents` altında 0600 olarak saklanır. Public medya deposundan ayrıdır. `/api/belgeler/:id` yetkili yönetici veya sipariş sahibi/eposta ile doğrulanmış ilgili misafire indirme izni verir. Boyut 10 MB, dosya imzası PDF; attachment, no-store, nosniff, CSP sandbox. Günlük yedeğe özel dosyalar dahil edilir. Yarım kalan yüklemeler sadece özel depoda sahipsiz dosya bırakabilir; kayıtla eşleşmeyen dosyalar incelemeden silinmez.

İade başvurusunun uygun bulunması para iadesi değildir. Para PayTR panelinde iade edildikten sonra yönetici tutar, referans ve tarih kaydeder. Tekrar anahtarı/referansı aynı iadeyi çoğaltmaz; toplam tahsilatı aşan kayıt reddedilir. Site PayTR iade API'sini çağırmaz.

## GüzelHosting SMTP

Gönderici: `WOYA <info@woyatablo.com>`. `EMAIL_TRANSPORT=smtp`, `SMTP_HOST=mt-nitrox.guzelhosting.com`, `SMTP_PORT=465`, `SMTP_USER=info@woyatablo.com`, `SMTP_PASSWORD`, `CUSTOMER_EMAIL_FROM` ve rastgele 32+ karakter `MAIL_WORKER_SECRET` yalnızca `/etc/woya/runtime.json` içinde tutulur. SMTP parolası mevcut posta kutusu parolasıdır. SSL/TLS ve sertifika kontrolü zorunludur. Destek yanıt ve mağaza bildirim adresleri paneldedir. Resend hesabı veya alan adı doğrulaması gerekmez.

Gelen posta MX/A ve gönderen SPF/DKIM kayıtları GüzelHosting'in aktif DNS alanında doğrulanmalıdır. Mağazanın kök A kaydı VPS'te kalır; posta sunucusunun adresi bununla karıştırılmaz.

Doğrulama/reset/misafir erişim mesajları mevcut kısa ömürlü token akışı üzerinden anında gönderilir. Sipariş bildirimleri sipariş işlemiyle aynı transaction'da outbox'a yazılır. `woya-mail.timer` her dakika localhost'taki gizli anahtarlı işçi endpoint'ini tetikler; her çağrı en fazla üç kayıt işler.

Outbox payload ve olay anahtarı değişmez. Lease ve SKIP LOCKED çift çalışanı önler. Açık SMTP 4xx retleri ve ileti gönderilmeden önceki bağlantı hataları en fazla 23 saat tekrar denenir. Sunucunun mesajı kabul edip etmediği belli olmayan bağlantı kopmaları veya gönderim sırasında işçi kesintisi `unknown` durumuna alınır ve otomatik tekrar edilmez. Sabit Message-ID izlemeye yardım eder; SMTP'de aynı iletinin tekrar gönderilmeyeceği garantisi değildir.

`sent` yalnızca GüzelHosting SMTP sunucusunun mesajı kabul ettiğini belirtir; alıcının gelen kutusuna teslim kanıtı değildir. Teslim/geri dönme takibi GüzelHosting Track Delivery ve info posta kutusunda yapılır. SMTP, Resend tarzı imzalı teslim webhook'u sunmaz. `failed/unknown` kayıtları `/admin/magaza` ekranındadır; belirsiz kayıtlar sağlayıcı teslim kayıtları kontrol edilmeden tekrar gönderilmez. Eski Resend adaptörü yalnızca geriye uyumluluk için korunmuştur; SMTP seçiliyken kullanılmaz.

## Yayın

`.github/workflows/commerce.yml` Linux üzerinde test, tarayıcı testleri, webpack derleme ve standalone paket üretir. Üretim işi yalnızca main için çalışır. VPS GitHub'dan kaynak kodu derlemez; son main SHA'sıyla eşleşen doğrulanmış paketi bekler. GitHub secrets `WOYA_DEPLOY_KEY`, `WOYA_HOST_KEY`; variable `WOYA_HOST`.

SSH hesabı `woya-deploy` sadece forced command ile `release <sha> <digest>` yüklemesi yapabilir. Shell, port/agent/X11 forwarding ve diğer dizinlere yükleme yoktur. Paket boyutu/sınırları ve tar yolları kontrol edilir; çıkarma root olarak yapılmaz. Yalnızca WOYA servisleri ve release yolları değiştirilir. DB manifest kapısı, stage sağlık testi ve önceki sürüme dönüş korunur. `/api/health` DB ve canlı REVISION bilgisini doğrular. Dağıtım duraklatma: `/etc/woya/deploy-paused`.

## Doğrulama

`pnpm typecheck`, mevcut test komutları, `pnpm test:commerce`, `pnpm test:smtp`, `pnpm build --webpack`, `pnpm test:admin:http`, `pnpm test:payments:http`, `pnpm test:customer:browser`.

Yerel/CI testleri yalnızca geçici DB ve sahte sağlayıcılar kullanır. Bunların geçmesi gerçek PayTR testini veya gerçek e-posta teslimatını kanıtlamaz. Kurulum tutanağına gerçek sağlayıcı doğrulamaları ayrıca kaydedilmelidir.
