# Pozvánka na rande

Statická stránka (HTML + CSS + JS, bez buildu) v štýle DateBloom. Šesť krokov:

1. „Pôjdeš so mnou na rande?“ – tlačidlo **NIE** uteká pred myšou aj prstom a nemá žiadnu akciu.
2. Deň (kalendár + rýchle voľby, minulé dni sú zablokované).
3. Čas (sloty, pri dnešku len aspoň hodinu dopredu, alebo vlastný čas).
4. Typ jedla.
5. Zhrnutie + nepovinný odkaz → odoslanie na e-mail.
6. Potvrdenie + pridanie do kalendára (Google / .ics).

## E-mail

Odpovede posiela [FormSubmit](https://formsubmit.co) na adresu v `CONFIG.endpoint` v `app.js`.
Pri **prvom** odoslaní príde od FormSubmit aktivačný e-mail („Activate Form“), ktorý treba potvrdiť;
až potom chodia odpovede. Preto celú stránku najprv raz prejdi sám.

Po aktivácii FormSubmit pošle náhodný reťazec, ktorým sa dá e-mail v `CONFIG.endpoint`
nahradiť, aby adresa nebola viditeľná v zdrojovom kóde.

## Testovanie

- `?reset` na konci URL vymaže uložený postup v danom prehliadači.
- Lokálne: `python3 -m http.server` v tomto priečinku.
