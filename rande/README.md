# Pozvánka na rande

Statická stránka (HTML + CSS + JS, bez buildu) v štýle DateBloom. Šesť krokov:

1. „Pôjdeš so mnou na rande?“ – tlačidlo **NIE** uteká pred myšou aj prstom a nemá žiadnu akciu.
2. „Počkaj, ty si naozaj povedala áno?? 😭“ – konfety.
3. Deň + čas (kalendár s rýchlymi voľbami; minulé dni a pri dnešku časy skôr než o hodinu sú zablokované).
4. Typ jedla → **tu sa odosiela e-mail** (deň, čas, jedlo, koľkokrát ušlo NIE, ako dlho rozmýšľala).
5. „…buď pripravená zajtra / v sobotu o 19:00, prídem po teba 🚗“ – text sa skladá z výberu.
6. „Dohoda o rande™“ za 499 € (platí sa smiechom). „Zaplatiť a potvrdiť“ dá pečiatku ZAPLATENÉ, pošle krátky potvrdzujúci e-mail a ponúkne pridanie do kalendára.

## E-mail

Odpovede posiela [FormSubmit](https://formsubmit.co) na adresu v `CONFIG.endpoint` v `app.js`.
Pri **prvom** odoslaní príde od FormSubmit aktivačný e-mail („Activate Form“), ktorý treba potvrdiť;
až potom chodia odpovede. Preto celú stránku najprv raz prejdi sám.

Po aktivácii FormSubmit pošle náhodný reťazec, ktorým sa dá e-mail v `CONFIG.endpoint`
nahradiť, aby adresa nebola viditeľná v zdrojovom kóde.

## Testovanie

- `?reset` na konci URL vymaže uložený postup v danom prehliadači.
- Lokálne: `python3 -m http.server` v tomto priečinku.
