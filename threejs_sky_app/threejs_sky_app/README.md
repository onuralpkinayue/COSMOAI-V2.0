# Three.js Sky Viewer + SNIa Focus (offline vendor)

Bu paket:
- Sky view (PointerLock / kafa çevirme)
- Galaxy icon points + SNIa icon sprites
- SNIa tıkla -> sağ panelde cutout + sadece o CID'nin galaksileri + kesikli ok çizgileri + Mpc (yaklaşık)
- Arkaplan siyah + starfield sky sphere + ground texture

## Kurulum
1) Bu klasöre gir:
   cd threejs_sky_app_pack

2) Vendor dosyalarını indir (Windows PowerShell):
   powershell -ExecutionPolicy Bypass -File .\download_vendor.ps1

> Kurumsal ağ CDN blokluyorsa, bu indirme adımı için farklı ağ gerekebilir.
> Vendor dosyaları zaten varsa `vendor/` klasörünü aynı isimlerle kopyalaman yeterli.

3) Çalıştır:
   python server.py
   Tarayıcı: http://localhost:8000/index.html

## Kontroller
- Sky view: L ile mouse "bakışı kilitle/çöz" (kafa çevirme)
- Tıkla: SNIa ikonuna tıkla -> focus moduna geçer
- Hover: 2 sn bekle -> tooltip
- R: reset

## Not
Dataset SN RA/Dec içermediği için SNIa ikonları,
ilgili CID'nin en yakın host galaksisinin (min separation_arcmin) konumuna yerleştirilir.


## v2 değişiklikleri
- Yeni 'Göster' menüsü: SNIa / Galaksi / İkisi
- Bant seçimi (u,g,r,i,z) + 'Bant parlaklık' slider (en parlak X%)
- Focus modunda SN merkeze alınır (gruplar translate edilir) -> galaksiler + kesikli çizgiler görünür
