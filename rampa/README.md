# Rozbehová rampa (roll-in) na kontajneri – oceľová konštrukcia

Plošina na kontajneri (3000 + 1200 = **4200 mm**), zjazd **55°** (parametrický, max. 55°),
horný rádius R1000, **spodný plynulý rádius R4000** s dotykom na terén, šírka jazdnej plochy **1200 mm**,
rám z jaklov **50x50x3**.

## Súbory (`vystup/`)
| súbor | na čo |
|---|---|
| `rampa_vykres.pdf` | výkres pre zváračov, A3, 4 listy (bočný pohľad s kótami, šablóna bočnice s pozíciami, pohľady + izometria, kusovník + poznámky) |
| `rampa_3D.step` | 3D model pre **Fusion 360** (File → Open / Upload). Každý jakel je samostatné telo `PozXX_n`, skupiny A plošina / B rampa / C zábradlie / D podpery, preglejka, kontajner ako referencia |
| `rampa_pohlady_1-1.dxf` | 2D pohľady 1:1 (bok, zhora, zozadu) – Fusion: Insert → Insert DXF do skice; aj na tlač šablóny bočnice 1:1 |
| `kusovnik.csv` | zoznam rezov (Excel, oddeľovač `;`) |
| `parametre.json` | parametre a vypočítané body T1/T2/T3 |
| `rampa_vykres_list*.png` | náhľady listov |

## Fusion 360 – parametrický uhol
`fusion360/RampaParametricka/` → Utilities → Add-Ins → Scripts and Add-Ins → **+** → vybrať priečinok → Run.
Vytvorí užívateľské parametre (`uhol`, `r_horny`, `r_spodny`, `vyska_kontajnera`, `vyska_plosiny`, …) a skicu profilu,
kde sú kóty naviazané na parametre – uhol **nie je zamknutý**, mení sa v Modify → Change Parameters.
Na konci ponúkne import `rampa_3D.step`.

## Iný uhol / rádius
```
pip install cadquery ezdxf matplotlib numpy
python3 generuj.py --uhol 50 --r-spodny 4500 --vystup vystup_50
```
Prepočíta sa geometria, rozmiestnenie stĺpikov, výkres, kusovník aj STEP. Uhol nad 55° generátor odmietne.
