# Pozvánka na rande

Statická stránka (HTML + CSS + JS, bez buildu) v štýle DateBloom: pozvánka na rande
**na Gran Canarii 15. 10. 2026**. Deň a miesto sú pevné (`CONFIG.date`, `CONFIG.place` v `app.js`),
ona vyberá čas a jedlo. Šesť krokov:

1. „Pôjdeš so mnou na rande?“ – „Dnes, na Gran Canarii 🌴“; tlačidlo **NIE** uteká pred myšou aj prstom a nemá žiadnu akciu.
2. „Počkaj, ty si naozaj povedala áno?? 😭“ – konfety.
3. „Deň už mám. O koľkej?“ – pevný dátum + výber času. V ten deň len časy aspoň o hodinu dopredu
   (podľa času v jej mobile), slot najbližšie k západu slnka (19:33) je označený 🌅.
   Po 21:30 sa ponúkne „čo najskôr“, po 23:00 a po 15. 10. už nič (zobrazí sa správa).
4. Typ jedla (morské plody, ryba, tapas, paella, papas arrugadas…) → **tu sa odosiela e-mail**.
5. „…buď pripravená dnes o 19:30, prídem po teba 🚗“.
6. „Dohoda o rande™ na Gran Canarii“ za 499 € (platí sa smiechom). „Zaplatiť a potvrdiť“ dá pečiatku
   ZAPLATENÉ, pošle krátky potvrdzujúci e-mail a ponúkne pridanie do kalendára (kanársky čas).

## E-mail

Odpovede posiela [FormSubmit](https://formsubmit.co) na adresu v `CONFIG.endpoint` v `app.js`.
Pri **prvom** odoslaní príde od FormSubmit aktivačný e-mail („Activate Form“), ktorý treba potvrdiť;
až potom chodia odpovede. Preto celú stránku najprv raz prejdi sám.

Po aktivácii FormSubmit pošle náhodný reťazec, ktorým sa dá e-mail v `CONFIG.endpoint`
nahradiť, aby adresa nebola viditeľná v zdrojovom kóde.

## Testovanie

- `?reset` na konci URL vymaže uložený postup v danom prehliadači.
- Lokálne: `python3 -m http.server` v tomto priečinku.
