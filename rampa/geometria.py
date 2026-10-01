"""
Geometria rozbehovej rampy (roll-in) na kontajneri.

Súradnice v mm:
  X  - v smere jazdy (X = 0 je čelo kontajnera / začiatok zjazdu)
  Y  - šírka rampy (0 .. SIRKA)
  Z  - výška (Z = 0 je terén)

Všetky rozmery sú parametre v PARAM - zmena uhla, rádiusov alebo výšky
prepočíta celú konštrukciu, výkres aj kusovník.
"""
import math
from dataclasses import dataclass, field

PARAM = dict(
    VYSKA_KONTAJNERA=3000.0,   # výška kontajnera (strecha)
    VYSKA_PLOSINY=1200.0,      # výška plošiny nad strechou kontajnera
    DLZKA_PLOSINY=1200.0,      # hĺbka plošiny v smere jazdy
    SIRKA=1200.0,              # šírka jazdnej plochy = šírka preglejky
    UHOL=55.0,                 # sklon zjazdu [°] - max. 55°
    R_HORNY=1000.0,            # horný (vypuklý) rádius prechodu plošina -> zjazd
    R_SPODNY=4000.0,           # spodný (dutý) plynulý rádius prechodu do terénu
    JAKEL=50.0,                # jakel 50x50
    HRUBKA_STENY=3.0,          # hrúbka steny jaklu
    PREGLEJKA=18.0,            # hrúbka preglejky (jazdná plocha)
    ROZOSTUP_STLPIKOV=750.0,   # max. rozostup zvislých stĺpikov bočnice
    ROZOSTUP_PRIECNIKOV=350.0, # max. rozostup priečnikov pod preglejkou (po oblúku)
    URovne_PAZDIKOV=(1300.0, 2600.0),  # výšky vodorovných paždíkov v bočnici
    MIN_VYSKA_STLPIKA=200.0,   # kratšie stĺpiky sa už nerobia
    ZABRADLIE=1100.0,          # výška zábradlia nad jazdnou plochou plošiny
    SIRKA_KONTAJNERA=2438.0,
    DLZKA_KONTAJNERA=6058.0,
    HMOTNOST_KG_M=4.25,        # jakel 50x50x3 (EN 10219) kg/m
)


@dataclass
class Prut:
    skupina: str          # A plošina, B rampa, C zábradlie, D podpera
    nazov: str
    druh: str             # 'line' | 'arc'
    p0: tuple = None      # line: (x,y,z)
    p1: tuple = None
    hore: tuple = (0, 0, 1)   # smer "výšky" prierezu (pre natočenie jaklu)
    stred: tuple = None   # arc: (x, z) stred
    R: float = 0.0        # arc: polomer v osi prúta
    phi0: float = 0.0     # arc: počiatočný a koncový uhol [rad] (od +X v rovine XZ)
    phi1: float = 0.0
    y: float = 0.0        # arc: poloha Y osi
    poznamka: str = ""
    pos: int = 0

    @property
    def dlzka(self):
        if self.druh == "line":
            return math.dist(self.p0, self.p1)
        return abs(self.phi1 - self.phi0) * self.R


@dataclass
class Plech:
    skupina: str
    nazov: str
    x0: float; y0: float; z0: float
    dx: float; dy: float; dz: float
    poznamka: str = ""
    pos: int = 0


class Rampa:
    def __init__(self, **over):
        self.p = dict(PARAM, **over)
        p = self.p
        if p["UHOL"] > 55.0 + 1e-9:
            raise ValueError("Uhol zjazdu je obmedzený na max. 55°")
        self.H = p["VYSKA_KONTAJNERA"] + p["VYSKA_PLOSINY"]
        self.a = math.radians(p["UHOL"])
        self.b = p["JAKEL"]
        self.tp = p["PREGLEJKA"]
        self._profil()
        self.pruty: list[Prut] = []
        self.plechy: list[Plech] = []
        self._plosina()
        self._rampa()
        self._zabradlie()
        self._cislovanie()

    # ------------------------------------------------------------------ profil
    def _profil(self):
        H, a = self.H, self.a
        Rt, Rb = self.p["R_HORNY"], self.p["R_SPODNY"]
        self.C1 = (0.0, H - Rt)                       # stred horného rádiusu
        self.x1 = Rt * math.sin(a)                    # koniec horného rádiusu
        self.z1 = H - Rt * (1 - math.cos(a))
        self.z2 = Rb * (1 - math.cos(a))              # začiatok spodného rádiusu
        if self.z2 >= self.z1:
            raise ValueError("Rádiusy sú príliš veľké pre danú výšku a uhol")
        self.x2 = self.x1 + (self.z1 - self.z2) / math.tan(a)
        self.xe = self.x2 + Rb * math.sin(a)          # dotyk s terénom
        self.C3 = (self.xe, Rb)
        self.L_rovna = (self.z1 - self.z2) / math.sin(a)

    def z_offset(self, x, d):
        """Z krivky posunutej o d (kolmo) pod jazdnú plochu, v polohe x."""
        H, a = self.H, self.a
        Rt, Rb = self.p["R_HORNY"], self.p["R_SPODNY"]
        if x <= 0:
            return H - d
        r1 = Rt - d
        if x <= r1 * math.sin(a):
            return self.C1[1] + math.sqrt(r1 * r1 - x * x)
        r3 = Rb + d
        xt3 = self.xe - r3 * math.sin(a)
        if x <= xt3:
            x1o = r1 * math.sin(a)
            z1o = self.C1[1] + r1 * math.cos(a)
            return z1o - (x - x1o) * math.tan(a)
        dx = min(x - self.xe, 0.0)
        return Rb - math.sqrt(max(r3 * r3 - dx * dx, 0.0))

    def sklon(self, x, d=0.0):
        """Sklon krivky v polohe x [rad] (kladný = klesá)."""
        h = 1.0
        return math.atan2(self.z_offset(x - h, d) - self.z_offset(x + h, d), 2 * h)

    def x_pre_spodnu_hranu(self, z_hrana):
        """x na spodnom rádiuse, kde spodná hrana horného pásu má výšku z_hrana."""
        Rb = self.p["R_SPODNY"]
        r = Rb + self.tp + self.b
        c = (Rb - z_hrana) / r
        th = math.acos(min(c, 1.0))
        return self.xe - r * math.sin(th), th

    # ----------------------------------------------------------------- plošina
    def _plosina(self):
        b, h = self.b, self.b / 2
        S, Lp = self.p["SIRKA"], self.p["DLZKA_PLOSINY"]
        zk = self.p["VYSKA_KONTAJNERA"]
        zt = self.H - self.tp - h          # os horného rámu
        zb = zk + h                        # os spodného rámu
        xs = (-Lp + h, -h)
        ys = (h, S - h)
        A = "A"
        for z, nm in ((zt, "Plošina - horný rám pozdĺžny"), (zb, "Plošina - spodný rám pozdĺžny")):
            for y in ys:
                self.pruty.append(Prut(A, nm, "line", (-Lp, y, z), (0, y, z)))
        for z, nm in ((zt, "Plošina - horný rám priečny"), (zb, "Plošina - spodný rám priečny")):
            for x in xs:
                self.pruty.append(Prut(A, nm, "line", (x, b, z), (x, S - b, z), hore=(0, 0, 1)))
        # stĺpiky v rohoch
        for x in xs:
            for y in ys:
                self.pruty.append(Prut(A, "Plošina - stĺpik", "line", (x, y, zb + h), (x, y, zt - h),
                                       hore=(1, 0, 0)))
        # priečniky pod preglejkou
        n = math.ceil((Lp - b) / self.p["ROZOSTUP_PRIECNIKOV"])
        for i in range(1, n):
            x = xs[0] + (xs[1] - xs[0]) * i / n
            self.pruty.append(Prut(A, "Plošina - priečnik pod preglejku", "line",
                                   (x, b, zt), (x, S - b, zt)))
        # diagonály v bočných stenách a v zadnej/prednej stene
        for y in ys:
            self.pruty.append(Prut(A, "Plošina - diagonála bočná", "line",
                                   (xs[0] + h, y, zb + h), (xs[1] - h, y, zt - h), hore=(0, 1, 0),
                                   poznamka="zakrátiť na mieru"))
        for x in xs:
            self.pruty.append(Prut(A, "Plošina - diagonála čelná", "line",
                                   (x, b, zb + h), (x, S - b, zt - h), hore=(1, 0, 0),
                                   poznamka="zakrátiť na mieru"))
        # podperné nosníky cez šírku kontajnera (nesú plošinu na horných pozdĺžnikoch kontajnera)
        Wk = self.p["SIRKA_KONTAJNERA"]
        y0 = S / 2 - Wk / 2
        for x in xs:
            self.pruty.append(Prut("D", "Podperný nosník cez kontajner", "line",
                                   (x, y0, zk - h), (x, y0 + Wk, zk - h),
                                   poznamka="ukladať na horné pozdĺžniky kontajnera; odporúčané 100x50x4"))

    # ------------------------------------------------------------------- rampa
    def _rampa(self):
        p, a, b, h, tp = self.p, self.a, self.b, self.b / 2, self.tp
        S = p["SIRKA"]
        Rt, Rb = p["R_HORNY"], p["R_SPODNY"]
        dz = tp + h                       # os horného pásu pod jazdnou plochou
        ys = (h, S - h)
        B = "B"
        # koniec horného pásu: spodná hrana pásu sa dotkne terénu
        self.x_koniec_pasu, th_end = self.x_pre_spodnu_hranu(0.0)
        # koniec spodného pásu: spodná hrana horného pásu = vrch spodného pásu
        self.x_koniec_spodneho, _ = self.x_pre_spodnu_hranu(b)

        for y in ys:
            # horný pás - 3 diely: vypuklý oblúk, rovný úsek, dutý (plynulý) oblúk
            self.pruty.append(Prut(B, "Horný pás - horný oblúk (zakružiť)", "arc",
                                   stred=self.C1, R=Rt - dz, phi0=math.pi / 2, phi1=math.pi / 2 - a, y=y,
                                   poznamka=f"zakružiť v osi R{Rt - dz:.0f}"))
            r1 = Rt - dz
            P1 = (r1 * math.sin(a), y, self.C1[1] + r1 * math.cos(a))
            r3 = Rb + dz
            P2 = (self.xe - r3 * math.sin(a), y, Rb - r3 * math.cos(a))
            n = (-math.sin(a), 0, math.cos(a))
            self.pruty.append(Prut(B, "Horný pás - rovný úsek", "line", P1, P2, hore=n,
                                   poznamka=f"konce kolmo, sklon {p['UHOL']:.0f}°"))
            phi_end = 1.5 * math.pi - th_end
            self.pruty.append(Prut(B, "Horný pás - spodný plynulý oblúk (zakružiť)", "arc",
                                   stred=self.C3, R=r3, phi0=1.5 * math.pi - a, phi1=phi_end, y=y,
                                   poznamka=f"zakružiť v osi R{r3:.0f}"))
            # spodný pás na teréne
            self.pruty.append(Prut(B, "Spodný pás (na teréne)", "line",
                                   (0, y, h), (self.x_koniec_spodneho, y, h),
                                   poznamka="koniec zrezať pod horný pás"))

        # stĺpiky bočníc
        st = [h]
        x = h
        while True:
            x += p["ROZOSTUP_STLPIKOV"]
            if self.z_offset(x, tp + b) - b < p["MIN_VYSKA_STLPIKA"]:
                break
            st.append(x)
        # rovnomerné rozloženie medzi prvým a posledným
        if len(st) > 2:
            n = len(st) - 1
            st = [st[0] + (st[-1] - st[0]) * i / n for i in range(n + 1)]
        self.stanice = st
        top = {xx: self.z_offset(xx, tp + b) for xx in st}   # spodná hrana horného pásu
        self.vysky_stlpikov = top
        lv = list(p["URovne_PAZDIKOV"])
        for y in ys:
            for i, xx in enumerate(st):
                uhol = math.degrees(self.sklon(xx, tp + b))
                self.pruty.append(Prut(B, "Bočnica - stĺpik", "line", (xx, y, b), (xx, y, top[xx]),
                                       hore=(1, 0, 0),
                                       poznamka=f"hore rez {uhol:.1f}° (podľa pásu)" if uhol > 0.5 else "rezy kolmo"))
            # paždíky + diagonály v poliach
            for i in range(len(st) - 1):
                xi, xj = st[i], st[i + 1]
                spol = [h] + [l for l in lv if l + 150 < top[xj] - h]
                for l in spol[1:]:
                    self.pruty.append(Prut(B, "Bočnica - paždík", "line", (xi + h, y, l), (xj - h, y, l),
                                           hore=(0, 0, 1)))
                hran = spol + [None]
                for k in range(len(spol)):
                    zlo = spol[k] + (h if k > 0 else h)
                    zhi = (hran[k + 1] - h) if hran[k + 1] is not None else top[xi] - 10
                    zlo_j = zlo
                    self.pruty.append(Prut(B, "Bočnica - diagonála", "line",
                                           (xj - h, y, zlo_j), (xi + h, y, zhi), hore=(0, 1, 0),
                                           poznamka="zakrátiť na mieru (šablóna 1:1)"))

        # zadná stena rampy (rovina X = stanica 0) - paždíky a diagonály naprieč
        x0 = st[0]
        lvl = [h] + [l for l in lv if l + 150 < top[x0]] + [top[x0] - h]
        for k, l in enumerate(lvl):
            self.pruty.append(Prut(B, "Zadná stena - priečka", "line", (x0, b, l), (x0, S - b, l),
                                   hore=(1, 0, 0) if 0 < k < len(lvl) - 1 else (0, 0, 1)))
        for k in range(len(lvl) - 1):
            ya, yb = (b, S - b) if k % 2 == 0 else (S - b, b)
            self.pruty.append(Prut(B, "Zadná stena - diagonála", "line",
                                   (x0, ya, lvl[k] + h), (x0, yb, lvl[k + 1] - h), hore=(1, 0, 0),
                                   poznamka="zakrátiť na mieru"))
        # spodné priečky a priečne diagonály na ďalších staniciach
        for xx in st[1:]:
            self.pruty.append(Prut(B, "Spodná priečka", "line", (xx, b, h), (xx, S - b, h)))
            if top[xx] > 1200:
                self.pruty.append(Prut(B, "Priečna diagonála", "line",
                                       (xx, b, b), (xx, S - b, top[xx] - 60), hore=(1, 0, 0),
                                       poznamka="zakrátiť na mieru"))
        self.pruty.append(Prut(B, "Spodná priečka", "line",
                               (self.x_koniec_spodneho - h - 10, b, h), (self.x_koniec_spodneho - h - 10, S - b, h)))

        # priečniky pod preglejkou - po dĺžke horného pásu
        drz = []
        L1 = (Rt - dz) * a
        L2 = self.L_rovna
        L3 = (Rb + dz) * (a - th_end)
        Ltot = L1 + L2 + L3
        n = math.ceil(Ltot / p["ROZOSTUP_PRIECNIKOV"])
        for i in range(n + 1):
            s = min(max(Ltot * i / n, h), Ltot - h)
            drz.append(self._bod_na_pase(s, L1, L2, dz, th_end))
        self.priecniky = drz
        for (xx, zz, ang) in drz:
            nrm = (-math.sin(ang), 0, math.cos(ang))
            self.pruty.append(Prut(B, "Priečnik pod preglejku", "line", (xx, b, zz), (xx, S - b, zz),
                                   hore=nrm))

        # plechy: kotviace pätky a nábehový plech
        for xx in st + [self.x_koniec_spodneho - 60]:
            for y0 in (-100.0, S):
                self.plechy.append(Plech(B, "Kotviaca pätka 150x100x8", xx - 75, y0, 0, 150, 100, 8,
                                         poznamka="2x otvor Ø14, kotva M12 do betónu"))
        L_nab = self.xe - self.x_koniec_spodneho + 150
        self.plechy.append(Plech(B, f"Nábehový podkladný plech", self.x_koniec_spodneho - 50, 0, -5,
                                 L_nab, S, 5, poznamka="na betón, k nemu privariť koniec pásov"))

    def _bod_na_pase(self, s, L1, L2, dz, th_end):
        """Bod (x, z_os_priečnika, sklon) vo vzdialenosti s po osi horného pásu."""
        Rt, Rb = self.p["R_HORNY"], self.p["R_SPODNY"]
        a = self.a
        if s <= L1:
            r = Rt - dz
            phi = math.pi / 2 - s / r
            return (self.C1[0] + r * math.cos(phi), self.C1[1] + r * math.sin(phi), math.pi / 2 - phi)
        if s <= L1 + L2:
            r1 = Rt - dz
            x0 = r1 * math.sin(a); z0 = self.C1[1] + r1 * math.cos(a)
            t = s - L1
            return (x0 + t * math.cos(a), z0 - t * math.sin(a), a)
        r = Rb + dz
        t = s - L1 - L2
        phi = 1.5 * math.pi - a + t / r
        return (self.C3[0] + r * math.cos(phi), self.C3[1] + r * math.sin(phi), 1.5 * math.pi - phi)

    # --------------------------------------------------------------- zábradlie
    def _zabradlie(self):
        h = self.b / 2
        S, Lp = self.p["SIRKA"], self.p["DLZKA_PLOSINY"]
        z0 = self.H - self.tp
        ztop = self.H + self.p["ZABRADLIE"] - h
        zmid = self.H + self.p["ZABRADLIE"] / 2
        C = "C"
        rohy = [(-Lp + h, h), (-Lp + h, S - h), (-h, h), (-h, S - h)]
        for (x, y) in rohy:
            # stĺpik zábradlia - na vonkajšej strane horného rámu (privariť z boku)
            yy = y - self.b if y < S / 2 else y + self.b
            self.pruty.append(Prut(C, "Zábradlie - stĺpik", "line", (x, yy, z0 - 3 * self.b),
                                   (x, yy, ztop + h), hore=(1, 0, 0),
                                   poznamka="privariť z boku na horný rám plošiny"))
        for y in (h - self.b, S - h + self.b):
            for z in (ztop, zmid):
                self.pruty.append(Prut(C, "Zábradlie - madlo/medzimadlo bočné", "line",
                                       (-Lp + self.b, y, z), (-self.b, y, z)))
        for z in (ztop, zmid):
            self.pruty.append(Prut(C, "Zábradlie - madlo/medzimadlo zadné", "line",
                                   (-Lp + h, 0, z), (-Lp + h, S, z)))

    # --------------------------------------------------------------- kusovník
    def _cislovanie(self):
        kluc = {}
        pos = 0
        for q in self.pruty:
            k = (q.skupina, q.nazov, round(q.dlzka), q.druh, round(q.R))
            if k not in kluc:
                pos += 1
                kluc[k] = pos
            q.pos = kluc[k]
        for pl in self.plechy:
            k = ("P", pl.nazov, round(pl.dx), round(pl.dy))
            if k not in kluc:
                pos += 1
                kluc[k] = pos
            pl.pos = kluc[k]

    def kusovnik(self):
        riadky = {}
        for q in self.pruty:
            r = riadky.setdefault(q.pos, dict(pos=q.pos, skupina=q.skupina, nazov=q.nazov,
                                              profil=f"jakel {self.b:.0f}x{self.b:.0f}x{self.p['HRUBKA_STENY']:.0f}",
                                              dlzka=q.dlzka, ks=0, poznamka=q.poznamka))
            r["ks"] += 1
        for pl in self.plechy:
            r = riadky.setdefault(pl.pos, dict(pos=pl.pos, skupina=pl.skupina, nazov=pl.nazov,
                                               profil=f"plech {pl.dz:.0f} mm  {pl.dx:.0f}x{pl.dy:.0f}",
                                               dlzka=0, ks=0, poznamka=pl.poznamka))
            r["ks"] += 1
        out = sorted(riadky.values(), key=lambda r: r["pos"])
        for r in out:
            r["spolu_m"] = r["dlzka"] * r["ks"] / 1000.0
            if r["profil"].startswith("jakel"):
                r["kg"] = r["spolu_m"] * self.p["HMOTNOST_KG_M"]
            else:
                pl = next(p for p in self.plechy if p.pos == r["pos"])
                r["kg"] = pl.dx * pl.dy * pl.dz * 7.85e-6 * r["ks"]
        return out

    def suhrn(self):
        p = self.p
        return dict(
            vyska_plosiny=self.H, uhol=p["UHOL"], R_horny=p["R_HORNY"], R_spodny=p["R_SPODNY"],
            x_koniec_horneho_radiusu=self.x1, z_koniec_horneho_radiusu=self.z1,
            x_zaciatok_spodneho_radiusu=self.x2, z_zaciatok_spodneho_radiusu=self.z2,
            x_dotyk_teren=self.xe, dlzka_rovneho_useku=self.L_rovna,
            celkova_dlzka=self.xe + p["DLZKA_PLOSINY"],
        )
