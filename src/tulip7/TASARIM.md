# Tulip 7: prototip tasarım dosyası (v0.2, 2026-10-16: laleye özgü kurallar + görsel brief)

Homo Ludens için yeni oyun. *Flip 7*'nin (The Op Games, 2024) "bas ya da dur" (push-your-luck) çekirdeği, 1636–37 lale çılgınlığının meyhane ticaretine giydiriliyor. Kaynak araştırma: `tulips/Lale cilginligi oyun analizi.md`. Kısa, tek oturumluk, yapay zekâya karşı oynanan bir kart oyunu.

**Tek cümlelik fikir:** Bir kış akşamı meyhanede görmediğin soğanlar için kâğıt imzalıyorsun. Her yeni kâğıt kârını büyütüyor, ama aynı lale ikinci kez gelirse o akşamki bütün kâğıtların rüzgâra karışıyor.

**Neden bu eşleşme tutuyor (procedural rhetoric):** Flip 7'de en değerli sayılar destede en bol olanlardır, yani en çok kazandıran kart aynı zamanda en çok batıran karttır. 1637'de de durum buydu: en çok şişen ve en çok kâğıdı dolaşan şey nadir soğanlar değil, pound başına satılan sıradan *vodderij* idi (Gheele Croonen 50 kat, Switsers 30 kat). Oyuncu bunu vaaz dinleyerek değil, kartları sayarak öğrenir.

---

## 1. Çekirdek kurallar (Flip 7'den, değiştirilmeden)

Prototipte Flip 7'nin kural matematiğine dokunmuyoruz. Tema üstüne giydirilir, denge zaten test edilmiş.

- **Deste: 94 kart.** 79 sayı kartı (0'dan 1 adet; 1'den 12'ye kadar her sayıdan o sayı kadar), 6 değiştirici (+2, +4, +6, +8, +10, ×2), 9 aksiyon (3 Dondur, 3 Üç Çek, 3 İkinci Şans).
- **Tur:** Kartlar oyunculara sırayla tek tek açılır. Sırası gelen oyuncu **bas** (bir kart daha) ya da **dur** (puanını kasaya koy, turdan çık) der.
- **Patlama:** Önünde zaten olan bir sayı gelirse tur puanın 0 olur ve turdan çıkarsın.
- **Flip 7:** 7 farklı sayı toplayan oyuncu +15 bonus alır ve tur herkes için hemen biter.
- **Puan:** sayılar toplamı → ×2 varsa yalnızca sayı toplamını ikiye katlar → değiştiriciler eklenir → Flip 7 bonusu eklenir.
- **Aksiyonlar:** Dondur (hedef oyuncu puanını kasaya koyup turdan çıkar), Üç Çek (hedef üst üste 3 kart açar, patlarsa durur), İkinci Şans (bir sonraki tekrar kartı atılır, oyuncu hayatta kalır; aynı anda yalnızca bir tane tutulur). Dondur ve Üç Çek kendine de verilebilir.
- **Deste hafızası:** Masadaki kartlar tur sonuna kadar desteye dönmez, deste bitene kadar karıştırılmaz. Kart saymak strateji.
- **Bitiş:** Tur sonunda 200 puanı geçen varsa en yükseği kazanır.

---

## 2. Tema eşlemesi

| Flip 7 | Tulip 7 | Tarihsel dayanak |
|---|---|---|
| Tur | Bir meyhane akşamı (kolej toplantısı) | Kolejler 1636'da meyhanelerde toplanıyordu (Menniste Bruyloft, Toelast) |
| Sayı kartı | Görülmeden alınan bir soğan için kâğıt (sözleşme) | Ekim–mayıs arası ticaret tamamen kâğıt üzerindeydi (*windhandel*) |
| Bas | "Başkasının yaptığını yapacağım": bir kâğıt daha | Kolejlerdeki kalıplaşmış alıcı cümlesi |
| Dur | Akşamı kapat, *wijnkoop*'u öde, kâğıtlar bağlayıcı | İşlem ancak gece sonunda şarap parası ödenince kesinleşiyordu |
| Patlama (tekrar) | **Rüzgâr!** Aynı laleyi iki kez aldın, kâğıt zincirin karışır, o akşamki kârın yok olur | Çağdaşlar bu ticarete "rüzgâr ticareti" dedi |
| Flip 7 bonusu | **Lale kitabı tamam** (7 farklı varyete): +15 | Tüccar-yetiştiricilerin varyete albümleri |
| +2 … +10 | **Yan soğancık** (*afsetsel*) | Yan soğancıklar ayrıca satılıyordu |
| ×2 | **Kırık lale** (alevli desen): sayı toplamı ×2 | Değeri yaratan şey bir virüstü (Tulip breaking virus) |
| Dondur | **Wijnkoop**: hedefin anlaşması mühürlenir, kârını alıp masadan kalkar | Şarap parası işlemi bağlar |
| Üç Çek | **Seghsman**: sözcü hedefi üç pazarlığa daha sokar | Tahta usulünde fiyatı ilan eden arabulucu |
| İkinci Şans | **Rouwkoop**: pişmanlık parasını öde, tekrar eden kâğıttan cay | Onuru kurtarmak için ödenen cayma bedeli |
| 200 puan | 2.000 gulden kâğıt kârı (puan ×10 gösterilir) | Ölçek için: f1.100 = bir usta marangozun ~3 yıllık ücreti |

### Sayı kartları = varyeteler

**Kararım:** Kartın puanı soğanın fiyatı değil, **o kış kâğıt üzerinde ne kadar şiştiği**. Bol kart = çok el değiştiren ucuz soğan = çok şişen = çok riskli. Kartın üstünde küçük harfle gerçek fiyat da yazar, ama puanı belirleyen şişmedir.

| Puan (= kopya) | Varyete | Kartta yazan gerçek veri | Durum |
|---|---|---|---|
| 12 | Gheele Croonen | 0,41 → 20,5 gulden (2 Oca → 5 Şub 1637), 50 kat | Garber, belgeli |
| 11 | Switsers | 1 → 30, 30 kat; Van Cuyck'in pound'u f1.100 | Garber / Goldgar |
| 10 | Witte Croonen | 2,2 → 57, ~26 kat | Garber |
| 9 | Admirael de Man | 18 → 209, ~12 kat | Garber |
| 8 | Gheele ende Roote van Leyden | 17,5 → 136,5, ~8 kat | Garber |
| 7 | Gouda | Alkmaar f1.500 | Sıralama stilize |
| 6 | Parragon Schilder | Alkmaar f1.615 | Sıralama stilize |
| 5 | Bruyne Purper | Alkmaar f2.025 | Sıralama stilize |
| 4 | Admirael van der Eijck | Alkmaar f1.620 | Sıralama stilize |
| 3 | Admirael Liefkens | 5 Şub f2.968 | Sıralama stilize |
| 2 | Viceroy | Alkmaar f4.203 | Sıralama stilize |
| 1 | Admirael van Enchuysen | 5 Şub f4.900 | Sıralama stilize |
| 0 | **Semper Augustus** | Pauw satmadı (1624); 5 Şub f6.290 | Belgeli |

- 12–8 arası sıralama Garber'in artış oranlarına gerçekten uyuyor. 7–1 arası için artış serisi yok: "ne kadar nadirse o kadar az kâğıdı dolaşır" mantığıyla stilize edildi, oyunda "tarihsel sıralama" diye sunulmaz.
- **Semper Augustus = 0** bilinçli bir şaka ve bir ders: destede tek kopya, puanı yok, ama asla patlatmaz ve lale kitabını tamamlamaya sayar. Kart metni: "Dr. Pauw kept it. Nobody could buy it."

---

## 2b. Laleye özgü kurallar (v0.2, 2026-10-16)

Akşamın içindeki "bas ya da dur" aynen Flip 7. Üstüne bir **sezon katmanı** eklenir: akşamların üstünde ikinci bir şans oyunu. Tek bir akşamda batmak Flip 7'deki gibi patlamaktır. Bütün kış boyunca batmak ise 1637'deki gibi kâğıtta kalmaktır. 200 puan hedefi kalkar, oyun bir kış sezonu sürer.

### A. Kese mi, kâğıt mı? (çekirdek değişiklik; prototipte uygulanan hâli)
Durduğunda akşamın puanını (puan × 10 gulden) iki yerden birine koyarsın:
- **Kese (nakit):** Güvende, kimse alamaz.
- **Kâğıt (windhandel):** O akşamın **fiyat endeksinden satın alınır** ve endeks yükseldikçe değeri büyür (değer = gulden ÷ yazıldığı akşamın endeksi × bugünkü endeks). Aynı akşam yazıp satmak kâr getirmez; kazanç beklemekten gelir.
- **Satış:** Her akşamın başında (çöküş zarından sonra) bütün kâğıdı o akşamın endeksinden satabilirsin; %2,5 şarap parası (wijngeld) kesilir.
- Çöküş geldiğinde bütün kâğıt **%3,5**'e iner (Haarlem, Mayıs 1638 rouwkoop'u).
- İlk taslaktaki "kâğıt × çarpan" hâli çalışmadı: çöküş her oyunda kesin geldiği için kâğıt her zaman kese kadar ya da daha kötü kalıyordu.

Akşam başına tek karar, iki düğme: "Keseye koy: +30" / "Kâğıda yaz: +90". Dayanak: ekim–mayıs arası bütün ticaret teslimi yaza kalan kâğıttı. Alkmaar'daki gibi nakit satışlar ayrıydı.

### B. Fiyat tahtası ve takvim
Masanın üstünde akşamları gösteren bir şerit durur. Her akşamın tarihi, kâğıt çarpanı ve bir sonraki akşam için **çöküş riski** açıkça yazar. Çöküş bir sürpriz değil, okunabilen bir tehlikedir (araştırmanın Tulip Bubble eleştirisi).

| Akşam | Tarih (atmosfer) | Kâğıt çarpanı | Bir sonraki akşam çöküş riski | Akşamın haberi (belgeli) |
|---|---|---|---|---|
| 1 | Kasım ortası 1636 | ×1 | – | Soğanlar dikildi, artık yalnızca kâğıt satılıyor |
| 2 | 22 Kasım | ×1,5 | – | Van Halmael f12.000'lik mal aldı, yarısını peşin ödedi |
| 3 | Aralık başı | ×1,5 | – | Kleine Bank'ta lale davaları her ay artıyor |
| 4 | Aralık | ×2 | – | Bazı sözleşmeler beş kez el değiştirdi |
| 5 | 2 Ocak 1637 | ×2,5 | %10 | Gheele Croonen 0,41 gulden |
| 6 | Ocak ortası | ×3 | %20 | Yarım pound Witte Croonen ocak ortalaması f64 |
| 7 | Ocak sonu | ×4 | %35 | Pound goods yirmi, otuz katına çıktı |
| 8 | Şubat başı | ×5 | %60 | — |
| 9 | — | — | %100 | Çöküş kesin |

- Çarpanlar ve riskler **oyun dengesi için stilize**; eğrinin şekli Garber'in Ocak 1637 sıçramasından geliyor. Bot simülasyonuyla ayarlanacak (Kantar'daki gibi).
- Çöküş her akşamın başında zarla belirlenir. Hangi akşama denk gelirse gelsin haberi aynı: **"3 February, Haarlem: the sale did not go as expected. 1,250, then 1,100, then 1,000. No bid."** O anda herkesin kâğıdı %3,5'e iner, kâğıt kazıma animasyonu oynar.

### C. Alkmaar finali
Çöküşten sonra son bir akşam oynanır: **5 Şubat 1637, Alkmaar, Winckel'in yetimleri için müzayede.** Bu bir nakit tereke satışıdır: kâğıt seçeneği yoktur, akşamın puanı **keseye ×2** girer. Haarlem'in çöktüğü hafta Alkmaar'ın rekor fiyat görmesi gerçek bir paradoks; geride kalan oyuncuya son bir şans verir. Oyun sonu skoru: **kese + kâğıdın %3,5'i**, gulden olarak.

### D. Aksiyon kartlarına tarih ayarı
- **Wijnkoop (Dondur):** Hedef durur ve puanı zorla **kâğıda** yazılır. Erken kışta bu bir hediyedir (çarpan), geç kışta bir silahtır (çöküş riski). Aynı kart sezon içinde anlam değiştirir.
- **Seghsman (Üç Çek):** Değişmedi.
- **Rouwkoop (İkinci Şans):** Değişmedi; adı oyunun sonundaki %3,5 ile aynı kelime, kapanış kartı bunu açıklar ("You paid rouwkoop all winter in small coins. In 1638 everyone paid it.").

### E. Modlar
- **Kış (varsayılan):** A–D kuralları.
- **Klasik:** Saf Flip 7, 200 puan. Test ve karşılaştırma için.

### Sonra denenecek (v0'da yok)
- **Görülmeden alım:** Her akşamın ilk kartı kapalı gelir ("toprakta"). Durunca açılır (söküm). Tekrar çıkarsa o an patlarsın. Lale ticaretinin özü, ama şansı artırır.
- **Çiçekçilerin önerisi (24 Şubat 1637):** Alternatif uzlaşma: 30 Kasım'a kadar yazılan kâğıt tam, sonrası %10 ödenir. Erken kâğıdı ödüllendirir. Tarihte hiç yürürlüğe girmedi, kapanışta bu söylenir.
- **Kefil:** Wijnkoop'a karşı bir kez koruma ("I am not satisfied with the guarantor", Van Cuyck, 7 Şubat).
- **Veba:** Bir akşam bir rakip masaya gelmez.
- **Pamflet söylentileri:** Mackay'in hikâyeleri akşam haberleri arasında "söylenti" olarak; kapanışta "belge mi, pamflet mi?".

---

## 3. Oyuncu ve rakipler

- Tek oyunculu, tarayıcıda, 3 yapay zekâ rakibe karşı (toplam 4 kişi; Flip 7'nin en iyi oynandığı aralık).
- Mekân: Amsterdam, Oude Brugsteeg, **Menniste Bruyloft**. Ev sahibi ve kartları dağıtan anlatıcı: meyhaneci **Jan Theunisz** (matbaacı, dört dil bilen âlim; oynamaz, yorum yapar).
- Rakipler belgeli kişiler, her birinin basit bir risk kişiliği var. Yapay zekâ kuralı: "patlama ihtimali eşiği aşınca dur" + kişilik sapması + Wijnkoop/Seghsman'ı lidere oynama eğilimi.

| Rakip | Kim | Oyun tarzı |
|---|---|---|
| Joost van Cuyck | 29, Amsterdamlı; 7 Şubat'ta "kefilden memnun değilim" deyip caydı | Temkinli: erken durur, Rouwkoop'u sever |
| Andries de Busscher | 31, Haarlemli fıçıcı | Dengeli |
| Abraham van Meeckeren | Haarlemli bira üreticisi | Açgözlü: yüksek eşik, Seghsman'ı kendine bile oynar |
| (Alternatif) Ellert Fockesz van Resum | Enkhuizenli, meyhanecinin kayınpederi | Lideri hedef alan |

---

## 4. Tarih katmanı (prototipte hafif, kural değiştirmeyen)

1. **Kart arkası notları:** Her kartın küçük bir "i" ikonu; tıklanınca 1–2 cümle ve kaynak (ör. Gheele Croonen'in 50 katlık yükselişi, Garber 1989). Rakam yalnızca araştırma dosyasından.
2. **Akşamlar takvime bağlı:** Her tur bir tarih taşır, 23 Kasım 1636'dan başlayıp haftalık ilerler (ör. "Tuesday, 3 February 1637, Haarlem: the sale did not go as expected"). Takvim yalnızca atmosfer; kurallar değişmez.
3. **Jan Theunisz'in replikleri:** Patlama, lale kitabı, Rouwkoop gibi anlarda kısa, dönem tadında satırlar.
4. **Kapanış kartı "What really happened":** Oyun sonunda tek ekran: alıcılar Şubat 1637'de ödemeyi bıraktı, Eyaletler 27 Nisan'da sözleşmeleri askıya aldı, Haarlem 1638'de %3,5 rouwkoop ile kapattı. Oyuncunun kendi kâğıdı bu hesapla gösterilir ("Your 2,140 guilders of paper settled for 75."). Mit uyarısı: "Nobody drowned in a canal. That was a novel." Görsel: telif dışı Hendrik Pot, *Flora's Mallewagen* (Frans Hals Museum) ya da Jan Brueghel the Younger'ın maymunlu hicvi (Wikimedia, Kantar'daki Preziosi gibi).
5. **Paylaşım metni:** Borderlines tarzı; tur başına emoji dizisi (🌷 durdu, 💨 rüzgâr, 📖 lale kitabı).

### v1 için seçenekler
- Sezon katmanı artık v0'da (bkz. 2b). Kalanlar: **onur skoru** (Rouwkoop ve Wijnkoop kullanımı onuru düşürür) ve **günlük mod** (herkese aynı tohumlu deste, Borderlines gibi).

---

## 5. Ekran ve his

- **Masa:** Yukarıdan bakış, koyu ahşap meyhane masası, mum ışığı. Oyuncunun kartları altta, üç rakip üst ve yanlarda. Ortada deste ve atılanlar.
- **Görsel dil = Kantar'ın akrabası, ama daha canlı:** Kantar'ın kart sistemi (krem kart, renkli çerçeve, sol üstte numara rozeti, altta ad, şeffaf zeminde resimli obje) aynen alınır. Kapalıçarşı'nın koyu bakır-lacivert tonları yerine Haarlem'in bahar renkleri: canlı lale renkleri, Delft mavisi, açık meşe, gün ışığı. Arka plan: Menniste Bruyloft meyhanesi, ortası kartlar için boş bir masa.
- **Görseller ChatGPT'de üretilecek:** Liste, istemler ve dosya formatı `tulip7/ART-BRIEF.html`'de (28 görsel). Kart çerçevesi, kart arkası, fiyat tahtası ve bütün arayüz kodla çizilir; ChatGPT yalnızca resimli parçaları (13 lale, 2 değiştirici, 3 aksiyon, 4 ikon, 4 portre, 2 arka plan) yapar. Kantar'ın lale motifli mührü yeniden kullanılır.
- **Ayırt edilebilirlik şartı:** 13 lale küçük boyutta bile birbirinden ayrılmalı. Bu yüzden her varyetenin baskın rengi ve deseni farklı; ucuz soğanlar düz renk, nadirler alevli. Renkler tarihsel görünüme değil oynanabilirliğe göre (Semper Augustus hariç).
- **Kart sayacı (öğretici mod):** "Next card makes you go to the wind: 31%" göstergesi. Kantar'daki öğretmen modu gibi açılıp kapanır. Varsayılan: ilk oyunda açık, sonra kapalı.
- **Ses (Web Audio, dosya yok):** kart çevirme hışırtısı, Wijnkoop'ta kadeh tokuşturma, Rüzgâr'da bir esinti ve kâğıt savrulması, lale kitabında kitap kapanma sesi. Ses aç/kapa.
- **Animasyon:** Patlamada kartlar masadan rüzgârla savrulur. Bu oyunun imza anı.
- **Dil:** Oyun İngilizce (Homo Ludens standardı); bu dosya Türkçe.
- **Süre:** Bir oyun ~10–15 dakika (Flip 7'de 200 puan genelde 5–8 tur).

---

## 6. Prototip kapsamı (v0)

**İçinde:**
- Tek HTML dosyası, framework yok (`tulip7/prototype.html`).
- 94 kartlık tam deste, bütün Flip 7 kuralları (aksiyonların ilk dağıtımda çözülmesi, Üç Çek içinde aksiyon gelmesi, İkinci Şans'ın devri dahil).
- Kış modu: kese/kâğıt, fiyat tahtası, çöküş, Alkmaar finali, Wijnkoop ayarı. Klasik mod anahtarı.
- 3 yapay zekâ rakip, kişilikli eşik; kese/kâğıt kararı için basit beklenen değer kuralı (kâğıt × çarpan × kalan akşamlarda çökmeme olasılığı vs. kese), kişiliğe göre sapma.
- ChatGPT görselleri gelene kadar yer tutucu SVG laleler; paket gelince `art-pack` içinden yüklenir.
- Kart üstü tarih notları, tur tarihleri, kapanış kartı.
- Patlama ihtimali göstergesi (aç/kapa).
- Kurallar ekranı (3 kart: masa → bas/dur → özel kartlar).

**Dışında:** sezon modu, onur, pamfletler, günlük mod, kayıt/devam, analitik, mobil dokunma desteği, site entegrasyonu.

**Test edilecek soru:** Tema kuralları anlamayı kolaylaştırıyor mu, yoksa "Rüzgâr", "Wijnkoop", "Seghsman" gibi adlar yük mü? Yükse kartın üstüne İngilizce alt etiket (Freeze / Flip Three / Second Chance karşılığı bir açıklama) eklenir.

---

## 7. Teknik notlar

- Veri: `CARDS` (varyete, puan, kopya, gerçek fiyat, not, kaynak), `RIVALS` (ad, biyografi, eşik, hedefleme), `EVENINGS` (tarih + Jan Theunisz repliği), `FACTS` (kapanış).
- Yapay zekâ: kalan desteden tekrar olasılığı = Σ(elindeki sayıların kalan kopyaları) ÷ kalan kart. Eşik: Van Cuyck ~%20, De Busscher ~%30, Van Meeckeren ~%40; puan farkı açıldıkça eşik yükselir (geride olan risk alır).
- Tohumlu karıştırma (ileride günlük mod ve hata ayıklama için).
- Rakamlar yalnızca `tulips/Lale cilginligi oyun analizi.md`'den; uydurma rakam yok. Stilize olanlar dosyada "stilize" diye işaretli.

---

## 8. Açık sorular

1. **İsim ve hukuk:** Oyun mekaniği telifle korunmaz, ama "Tulip 7" adı "Flip 7" markasına çok yakın ve sitede yayımlanacak bir oyunda risk yaratabilir. Kural metni ve görseller zaten kendimizin olacak. Prototipte "Tulip 7" çalışma adı olarak kalabilir; yayından önce ad netleşmeli. Alternatifler: *Windhandel*, *Seven Tulips*, *The Tulip Book*. (Hukuki tavsiye değil; gerekirse bir avukata sorulmalı.)
2. **Puan = şişme mi, fiyat mı?** Şişme önerim tarihe ve Flip 7 matematiğine uyuyor, ama "Viceroy 2 puan" ilk bakışta tuhaf gelebilir. Alternatif: puanı fiyat sırasına göre ver ve kopyaları ters çevir; bu Flip 7'nin dengesini bozar.
3. **Rakip sayısı:** 3 rakip mi, oyuncu seçsin mi (2–5)?
4. **Mobil:** Bas/dur arayüzü telefona çok uygun. Polder'deki dokunma sorununa rağmen bu oyunda baştan dokunmatik desteklensin mi?
5. **Lale Devri:** Türkçe konuşan kitle için Osmanlı Lale Devri (1718–30) bir epilog kartı olarak eklensin mi? Araştırma iki dönemi karıştırmamayı söylüyor; ancak ayrı ve tarihli bir not olarak durabilir.
6. **Site sırası:** Kantar ve köprü oyunu sürerken bu oyun hangi sırada? Yalnızca prototip mi, yoksa No. 6 adayı mı?

---

## 9. Durum: prototip v0.1 (2026-10-17)

- **Dosyalar (`src/tulip7/`):** `prototype.html` (tek dosya, ~1,4 MB, görseller gömülü), kaynaklar `engine.js` (kurallar + yapay zekâ, DOM yok), `ui.html` (arayüz şablonu), `art.js` (WebP'ye çevrilmiş ChatGPT görselleri), `build.py` (üçünü birleştirir). Değişiklik kaynaklarda yapılır, sonra `python3 build.py`.
- **Uygulanan endeks ve risk (stilize, ayarlanabilir):** endeks ×1 / 1,25 / 1,5 / 2 / 2,5 / 3,5 / 5 / 7; çöküşün o akşamdan önce gelme olasılığı 0 / 0 / 0 / %4 / %8 / %12 / %20 / %35; VIII'den sonra kesin. Sonra Alkmaar (nakit ×2).
- **Bot simülasyonu (3.000 oyun):** Kış modu ortalama 7,6 akşam (Alkmaar dahil). Çöküş oyunların ~%12'sinde III–IV'ten sonra, ~%40'ında VIII'den sonra. Kazanma: temkinli Van Cuyck %31, iki dengeli toplam %46, açgözlü Van Meeckeren %23 (açgözlü ortalamada çok kazanıyor, ama çöküş onu sık yakalıyor). Klasik mod ortalama 8 tur.
- **Bilinen sade yanlar:** Yapay zekâ kâğıdı beklenen değerle yönetiyor, bu yüzden hepsi VII civarı satıyor; geç çöküş botları nadiren vuruyor. Erken çöküş asıl gerilimi yaratıyor. Mobilde rakipler alt alta diziliyor, dokunma testi yapılmadı. Kayıt/devam, analitik, site entegrasyonu yok.
- **Görsel:** Admirael van Enchuysen (1) pembe-macenta geldi, Parragon Schilder'e (6) yakın; kartın rozet rengi leylağa çekildi. Yeniden üretilirse `art.js` güncellenir.
- **Test:** Otomatik tarayıcıda (Chromium) iki kış, bir klasik ve bir mobil (390 px) oyun rastgele tıklamalarla sonuna kadar oynandı; konsol hatası yok, 94 kart her oyun sonunda eksiksiz.

## 10. v0.2 (2026-10-17)

**Lale renkleri (v2b, son hâli):** İlke: birbirine çok yakın renkli olanlardan zayıf görüneni, destede eksik kalan bir renkle değiştir; güzel olanlara dokunma. Dönemin üç sınıfı: *Rozen* (beyaz zemin, kırmızı-pembe), *Violetten* (beyaz zemin, mor), *Bizarden* (sarı zemin, kırmızı-kahve). Bol laleler sade, nadirler alevli. Değişen üç lale (istemler `NEW-TULIPS.html` ve ART-BRIEF v2'de):
- **t01 Admirael van Enchuysen → koyu menekşe, geniş beyaz kenarlar** (Violetten). Eskisi pembe-macentaya kaymıştı. Encyclopaedia Romana bu çeşidi Violetten sayıyor.
- **t06 Parragon Schilder → sarı zemin üstüne bronz-kahverengi alevler** (Bizarden). Eskisi krem üstüne macentaydı, Gouda ve Semper Augustus'la karışıyordu. Rengi kaynakta yok, stilize.
- **t09 Admirael de Man → düz koyu gül pembesi.** Destede beş kırmızı vardı, düz pembe yoktu; bol bir kart olduğu için sade. Stilize (kaynakta "Admirael"ler kırmızı çizgili sayılıyor).
- Bruyne Purper (düz mürdüm) aynen kalıyor: destedeki tek koyu lale. Gouda'nın rozeti açık pembeye çekildi (#F3A0BE), yeni pembe 9'dan ayrılsın diye.

**Kartlar:** Numara sol üstte büyük rozet, aynı rozet sağ altta da var; adın altında "12 in deck" satırı (numara = puan = destedeki kopya sayısı). Kurallarda açıklaması var.

**Uyarlama:** Oyunun içinden Flip 7 adı ve atfı kaldırıldı. Klasik mod "The tavern game" oldu.

**Kış modu:**
- Botlar riski farklı okuyor (`fear`: temkinli 1,3, dengeli 1,0, açgözlü 0,5; her oyunda ±%20 sapma). Açgözlü artık kâğıdını VII'ye taşıyabiliyor ve geç çöküşe yakalanabiliyor. 3.000 oyunda kazanma: temkinli %32,5, iki dengeli toplam %42,5, açgözlü %25.
- **Kaydet/devam:** Her akşamın başında (çöküş zarından sonra), Alkmaar'dan önce ve her klasik turdan önce `localStorage` (`tulip7.save.v1`). Açılışta "Continue your winter". Akşamın ortasında çıkılırsa o akşam baştan oynanır. 299 oyunluk testte devam ettirilen oyun kesintisiz oyunla aynı sonuca çıkıyor.
- **Mobil:** 700 px altında rakipler yan yana üç kompakt sütun (kısa ad, toplam, mini kartlar).

## 11. v0.3: oynanış (2026-10-17)

Görsel değişikliği iptal edildi (lale görselleri eski hâlinde; rozet renkleri de eski görsellere göre geri alındı). Sorun: oyun anlaşılmadan akıyordu, fiziksel kart oyununun "bir tane daha mı?" heyecanı yoktu. Yapılanlar:

**Risk ve gerilim**
- **Tehlike çipleri:** Sıra sendeyken elindeki her lalenin destede kaç kopyası kaldığı ("12 · 9 left") ve toplamda kaç kartın seni batıracağı ("17 of 82 papers would blow you away: 21%").
- **Masadaki para:** "On the table f370", büyük. Rakiplerde de "On the table".
- **Kapalı çekiş:** Kart önce kapalı gelir; bekleme süresi riskle uzar (%0'da ~0,25 sn, %30'da ~0,6 sn). Risk ≥%25 ise kart titrer ve kalp atışı sesi çalar. Risk ≥%30'ken kurtulunca "Phew!".
- **Lale kitabı:** Her oyuncunun altında 7 sayfalık şerit; topladığı farklı laleler renkli dolar. Rakiplerde küçük noktalar.

**Kış katmanı sadeleşti**
- Akşamda kazanılan her şey otomatik **kâğıda** yazılır (o akşamın endeksinden). Durunca kese/kâğıt seçimi yok.
- Tek kış kararı **akşam sonunda**: kâğıdı tut ya da hepsini bozdur (%2,5 şarap parası). Ekranda bir sonraki akşamın endeks artışı ve çöküş riski yazar. Akşamın içindeki "çek ya da dur"un kış ölçeğindeki aynısı.
- Wijnkoop artık yalnızca durdurur (kâğıda zorlama kalktı, çünkü her şey zaten kâğıda gidiyor).
- Denge değişmedi (3.000 bot oyunu: temkinli %32,6, dengeli toplam %42,4, açgözlü %25,1).

**Akış**
- Akşam başı penceresi kalktı: tarih kısa bir bildirimle gelir, haber tahtanın altındaki şeritte durur.
- Tur sonu penceresi kalktı: sonuçlar koltuklarda "+f370" çipi ve uçan rakam olarak görünür; kış modunda bozdurma kararı kontrol panelinde.
- Pencere olarak kalanlar: çöküş, Alkmaar, oyun sonu, kurallar.
- Butonlar her yeniden çizimde değişmesin diye kontrol paneli yalnızca içeriği değişince yenilenir (tıklama kaçmasın).

**Yaşayan rakipler ve rehber**
- Botlar kararlarını konuşma balonuyla söyler ("Another!", riskliyken "Fortune favours the bold!", "That'll do.", batınca "Ach!", bozdururken "Cashing in."). Riskli anda daha uzun düşünürler.
- **İlk oyun ipuçları** (elin üstünde sarı kutu, "Got it" ile kapanır, bir kez gösterilir, `tulip7.tips`): ilk sıra, ilk tehlike (≥%20), 5 lale, ilk aksiyon kartı, ilk "gone with the wind", ilk bozdurma kararı. Üst çubuktaki **Help** düğmesi ipuçlarını ve tehlike göstergesini birlikte açıp kapatır.

**Test:** Kış, klasik ve 390 px kış oyunları otomatik olarak sonuna kadar oynandı; hata yok, 94 kart tam; kaydet/devam 299 oyunda tutarlı.

## 12. v0.4: masa, kart tasarımı, animasyon, başarımlar (2026-10-18)

**Kaynak dosyalar değişti:** `ui.html` artık yalnızca CSS + iskelet; oyun kodu `game.js`'te. `build.py` = `ui.html` + `art.js` + `carpet.b64` + `engine.js` + `game.js` → `prototype.html`. ChatGPT'den gelen arayüz paketi için `python3 merge_pack.py tulip7-art-pack-ui.html` sonra `python3 build.py`.

1. **Patlama = yanma.** Kartlar alev alıp kömürleşir ve kül olur; kıvılcımlar yükselir, kül düşer; çatırtı sesi. Metinler "Gone with the wind" → **"Up in smoke"** ("windhandel" kelimesi Theunisz'in repliklerinde ve başarımda duruyor).
2. **Kartlar desteden gelir.** Her kart masanın ortasındaki desteden kişinin önüne uçar (kapalı), sonra olduğu yerde döner (açılır). Masa yeniden çizilse de kartlar yerinde kalsın diye koltuklar parça parça güncellenir.
3. **Arayüz görselleri:** `ART-BRIEF-UI.html` (7 görsel: kart arkası, kart çerçevesi, logo yazısı "Tulip 7", amblem, tepeden masa yüzeyi, Menniste Bruyloft tabelası, boş mum mühür). Hepsinin kodla çizilmiş yer tutucusu var; paket gelince otomatik yerine geçer (sahte görsellerle denendi).
4. **Tek masa hissi.** Oyun artık halı kaplı, meşe kenarlı tek bir masa: üç rakip masanın üst kenarında (portre + isim levhası + önlerindeki kartlar), ortada deste, yere atılanlar ve ev sahibi Jan Theunisz, altta senin yerin. Kontroller sağdaki panelde. Arka planda bulanık meyhane. Ses: hafif uğultu ve ara sıra kuş cıvıltısı (John Evelyn 1641'de Menniste Bruyloft'ta su gücüyle çalışan "kuş cıvıltıları" duymuş).
5. **Kart ön yüzü (standart düzen):** renkli dış kenar → krem parşömen çerçeve (çift altın çizgi) → sol üst ve sağ alt köşede renkli numara madalyonları → kemerli pencerede lale → altında isim → sol altta "12 in deck". Özel kartlar Delft mavisi çerçeveli, köşede simge, altta tek satır etki ("Stops a player", "Three more papers", "Saves one duplicate"); değiştiriciler altın ("+4 · adds 4", "×2 · doubles"). Rakiplerin küçük kartlarında yalnızca büyük numara + resim.
6. **Açılış ekranında kişiler:** 3 tüccar + ev sahibi portresi; tıklayınca arşiv bilgisi açılır (kaynak: Goldgar, History Today). Doğrulanan bilgiler: Van Cuyck 29, Amsterdamlı, 6 Şubat 1637'de Menniste Bruyloft'ta De Busscher'den bir pound Switsers'ı 1.100 guldene aldı (wijnkoop + yoksullar için iki şilin), 7 Şubat'ta "kefilden memnun değilim" dedi; 11 Şubat'ta bir tanık el sıkıştıklarını notere söyledi. De Busscher 31, Haarlemli fıçıcı, sanat koleksiyoncusu bir aileden; mor-beyaz çizgili bir laleye adı verilmiş; kayınbiraderi Alister van de Cruijs 1.200 gulden teminat vermiş. Van Meeckeren Haarlemli bira üreticisi, 400 guldenden fazla harcayan 37 kişiden biri. Theunisz matbaacı, liberal, dört dil bilen âlim; muhtemelen 1635–40 arası öldü (1636'da masada olması küçük bir serbestlik, oyunda söyleniyor).
   - **Düzeltme:** Van Halmael'in 22 Kasım 1636 alımı kaynakta "12.000 guldenlik başka mallar"; haber satırı buna göre düzeltildi (önceden "lale" diyordu).
7. **Özel kart duyurusu:** Wijnkoop, Seghsman, Rouwkoop her çıktığında ortada büyük kartla açıklama çıkar (ne yapar + tek cümle tarih + kim çekti; tıklayınca geçer, yoksa 3 sn). Broken tulip ve Offsets oyunda ilk çıktıklarında bir kez.
8. **Başarımlar (14, hepsi gerçek olaylara bağlı):** Dr Pauw's tulip (Semper Augustus çek), A tulip book, Pound goods (12+11+10 ile dur), Wine money (lideri Wijnkoop'la durdur), Regret money, The breaking virus (Broken tulip'le ≥60), Windhandel (bir akşamda ≥f600 yak), Five times sold (5 akşam üst üste tut), Not content with the guarantor (sürpriz çöküşten hemen önceki akşam bozdur), Three and a half per cent (çöküşe ≥f1.500 kâğıtla yakalan), The orphans' auction (Alkmaar'da ≥f1.000), One of the 37 (kışı ≥f4.000 ile bitir), A reasonably nice house (kışı birinci bitir), The Menniste Bruyloft (meyhane oyununu kazan). Kilitliyken koşul, açılınca tarih notu görünür; açılınca alt köşede bildirim. `localStorage: tulip7.ach`. Üst çubukta ve açılış/son ekranında düğme.

**Test:** Kış (1366 px), meyhane oyunu (1280 px) ve kış (390 px) otomatik olarak sonuna kadar oynandı: hata yok; duyurular, yanma, kapalı çekiş, bozdurma, başarımlar ve başarım sayfası görüldü. Brief sayfası ve paket birleştirme sahte görsellerle denendi.

## 13. Başarım çinileri (2026-10-18)

`ART-BRIEF-ACH.html`: 14 başarım + 1 boş "kilitli" taş için ChatGPT istemleri. Ortak format: **1630'ların renkli Hollanda duvar çinisi (majolika)**. O yıllarda Delft, Haarlem ve Rotterdam çinileri henüz mavi-beyaz değil, kobalt, okr, turuncu, bakır yeşili ve mangan moruyla renkliydi; laleler sevilen bir konuydu. Her taşta aynı çerçeve (ortada mavi çift halka, dört köşede aynı zambak süsü), halkanın içinde başarımın kendi sahnesi (Pauw tekliflere el kaldırıyor, kantarda soğan tartan tüccar, roemer kadehleriyle şerefe, yırtık sözleşmeye konan paralar, yel değirmeninin önünden uçan kâğıtlar, Haarlem belediyesinde terazide kâğıt ve birkaç sikke, Alkmaar müzayedesi, bira fıçıları yanında Van Meeckeren, basamaklı kalkanlı kanal evi, Menniste Bruyloft'un tabelası…). Yazı ve rakam yok.
- Oyun hazır: paket `merge_pack.py` ile birleşince başarım sayfası ve bildirim, mühür yerine çiniyi gösterir; kilitli başarımlar `ach_locked` taşını, o yoksa çininin gri hâlini gösterir (sahte görsellerle denendi).

## 14. Arayüz ve başarım görselleri oyunda (2026-10-23)

ChatGPT paketleri (`tulip7-art-pack-ui.html`, `tulip7-art-pack-ach.html`) `merge_pack.py` ile `art.js`'e eklendi (WebP, küçültülmüş; prototip ~2,7 MB).
- Kart arkası (Delft çini deseni, ortada lale): deste ve kapalı çekilen kartlar.
- Kart çerçevesi: bütün kartların parşömen zemini (köşelerde altın süsler); kodla çizilen çift altın çizgi kaldırıldı.
- Logo ("Tulip7", 7 lalenin sapı): üst çubuk ve açılış ekranı. Not: ChatGPT boşluksuz yazdı; bırakıldı.
- Amblem: tarayıcı sekmesi simgesi.
- Masa yüzeyi (tepeden halı): oyun masası.
- Meyhane tabelası: üst çubukta tarih satırının yanında ve açılış ekranında (masanın üstüne konunca isimleri örtüyordu).
- Mum mühür: başarım çinisi olmayan durumlar için yedek.
- 14 başarım çinisi + boş kilitli taş: başarım sayfası ve bildirim.
Test: üç tam otomatik oyun (kış 1366 px, meyhane 1280 px, kış 390 px), hata yok.
