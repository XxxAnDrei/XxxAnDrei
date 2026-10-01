"""
2D pohľady (bočný, zhora, zozadu) ako zoznam primitív, ktoré sa dajú vykresliť
do PDF (matplotlib) aj do DXF (ezdxf) - oba výstupy tak majú rovnakú geometriu.
"""
import math
import numpy as np


# ------------------------------------------------------------------ primitívy
class Vrstva:
    RAM = "RAM"
    PLOCHA = "JAZDNA_PLOCHA"
    KONT = "KONTAJNER"
    TEREN = "TEREN"
    KOTY = "KOTY"
    TEXT = "TEXT"
    OS = "OSI"
    PLECH = "PLECHY"
    POS = "POZICIE"


class Kresba:
    def __init__(self, nazov, mierka):
        self.nazov = nazov
        self.mierka = mierka
        self.prim = []
        self.th = 2.5 * mierka          # výška textu v mm modelu (2,5 mm na papieri)

    def poly(self, pts, vrstva=Vrstva.RAM, fill=None, closed=True, lw=0.35, ls="-"):
        self.prim.append(("poly", [tuple(p) for p in pts], vrstva, fill, closed, lw, ls))

    def line(self, p, q, vrstva=Vrstva.RAM, lw=0.25, ls="-"):
        self.prim.append(("poly", [tuple(p), tuple(q)], vrstva, None, False, lw, ls))

    def arc(self, c, r, a0, a1, vrstva=Vrstva.RAM, lw=0.35, ls="-"):
        """oblúk, uhly v stupňoch, proti smeru hodín od a0 po a1"""
        self.prim.append(("arc", tuple(c), r, a0, a1, vrstva, lw, ls))

    def text(self, p, s, vrstva=Vrstva.TEXT, h=None, rot=0.0, ha="center", va="center", bold=False, box=False):
        self.prim.append(("text", tuple(p), s, vrstva, h or self.th, rot, ha, va, bold, box))

    def circle(self, c, r, vrstva=Vrstva.POS, lw=0.25):
        self.prim.append(("circle", tuple(c), r, vrstva, lw))

    # ---------------------------------------------------------------- kóty
    def kota(self, p1, p2, odsadenie, text=None, smer=None):
        """Lineárna kóta. smer: 'h' vodorovná, 'v' zvislá, None zarovnaná."""
        p1, p2 = np.array(p1, float), np.array(p2, float)
        if smer == "h":
            d = np.array([1.0, 0.0])
        elif smer == "v":
            d = np.array([0.0, 1.0])
        else:
            d = (p2 - p1) / np.linalg.norm(p2 - p1)
        n = np.array([-d[1], d[0]])
        hodnota = abs(np.dot(p2 - p1, d))
        # body na kótovacej čiare
        base = p1 + n * odsadenie
        q1 = base
        q2 = base + d * np.dot(p2 - p1, d)
        sgn = 1 if odsadenie >= 0 else -1
        e = 0.6 * self.th
        for p, q in ((p1, q1), (p2, q2)):
            off = np.dot(q - p, n)
            self.line(p + n * sgn * 0.3 * self.th * (1 if abs(off) > self.th else 0), q + n * sgn * e, Vrstva.KOTY, lw=0.18)
        self.line(q1 - d * e, q2 + d * e * np.sign(np.dot(p2 - p1, d)), Vrstva.KOTY, lw=0.18)
        t = 0.5 * self.th
        for q in (q1, q2):          # šikmé značky
            v = (d + n) / math.sqrt(2) * t
            self.line(q - v, q + v, Vrstva.KOTY, lw=0.5)
        mid = (q1 + q2) / 2 + n * sgn * 0.7 * self.th
        rot = math.degrees(math.atan2(d[1], d[0]))
        if rot > 90.1 or rot < -89.9:
            rot -= 180 * np.sign(rot)
        self.text(mid, text if text is not None else f"{hodnota:.0f}", Vrstva.KOTY, rot=rot)

    def kota_uhol(self, stred, a0, a1, r, text):
        self.arc(stred, r, a0, a1, Vrstva.KOTY, lw=0.18)
        am = math.radians((a0 + a1) / 2)
        self.text((stred[0] + (r + self.th) * math.cos(am), stred[1] + (r + self.th) * math.sin(am)), text, Vrstva.KOTY)
        for a in (a0, a1):
            ar = math.radians(a)
            p = (stred[0] + r * math.cos(ar), stred[1] + r * math.sin(ar))
            v = (0.4 * self.th * math.cos(ar + math.pi / 4), 0.4 * self.th * math.sin(ar + math.pi / 4))
            self.line((p[0] - v[0], p[1] - v[1]), (p[0] + v[0], p[1] + v[1]), Vrstva.KOTY, lw=0.5)

    def kota_r(self, stred, r, uhol, text, von=1.0):
        a = math.radians(uhol)
        p = (stred[0] + r * math.cos(a), stred[1] + r * math.sin(a))
        q = (stred[0] + (r + von * 4 * self.th) * math.cos(a), stred[1] + (r + von * 4 * self.th) * math.sin(a))
        self.line(stred, q, Vrstva.KOTY, lw=0.18, ls="--")
        self.circle(stred, 0.3 * self.th, Vrstva.KOTY)
        t = 0.5 * self.th
        self.line((p[0] - t, p[1] - t), (p[0] + t, p[1] + t), Vrstva.KOTY, lw=0.5)
        self.text(q, text, Vrstva.KOTY, ha="left" if math.cos(a) >= 0 else "right")

    def pozicia(self, p, cislo, smer=(1, 1)):
        r = 0.9 * self.th
        d = np.array(smer, float); d /= np.linalg.norm(d)
        c = np.array(p) + d * 3.0 * self.th
        self.line(p, c - d * r, Vrstva.POS, lw=0.18)
        self.circle(tuple(c), r, Vrstva.POS)
        self.text(tuple(c), str(cislo), Vrstva.POS, h=0.9 * self.th, bold=True)


# ----------------------------------------------------------------- projekcia
def _rohy_prierezu(p, os, hore, b):
    os = np.array(os, float); os /= np.linalg.norm(os)
    u = np.array(hore, float)
    u = u - os * np.dot(u, os)
    if np.linalg.norm(u) < 1e-6:
        u = np.cross(os, [0, 1, 0]) if abs(os[1]) < 0.9 else np.cross(os, [1, 0, 0])
    u /= np.linalg.norm(u)
    w = np.cross(os, u)
    h = b / 2
    return [p + u * su * h + w * sw * h for su in (-1, 1) for sw in (-1, 1)]


def _hull(pts):
    pts = sorted(set((round(x, 3), round(y, 3)) for x, y in pts))
    if len(pts) <= 2:
        return pts
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0:
            up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]


POHLADY = {
    # (os vodorovná, os zvislá, smer hĺbky - väčšia hodnota = ďalej od pozorovateľa)
    "bok": ((0, 1.0), (2, 1.0), (1, 1.0)),      # x doprava, z hore, pozorovateľ na -Y
    "zhora": ((0, 1.0), (1, 1.0), (2, -1.0)),   # x doprava, y hore (pozorovateľ zhora)
    "zozadu": ((1, -1.0), (2, 1.0), (0, 1.0)),  # pozorovateľ za plošinou (-X), pozerá v smere jazdy
}


def premietni(pt, pohlad):
    (ih, sh), (iv, sv), (id_, sd) = POHLADY[pohlad]
    return (pt[ih] * sh, pt[iv] * sv), pt[id_] * sd


def obrys_pruta(q, b, pohlad):
    """vráti (polygón, hĺbka) alebo pre oblúk v bočnom pohľade None"""
    if q.druh == "line":
        p0, p1 = np.array(q.p0, float), np.array(q.p1, float)
        rohy = _rohy_prierezu(p0, p1 - p0, q.hore, b) + _rohy_prierezu(p1, p1 - p0, q.hore, b)
    else:
        rohy = []
        n = 24
        for i in range(n + 1):
            phi = q.phi0 + (q.phi1 - q.phi0) * i / n
            for r in (q.R - b / 2, q.R + b / 2):
                for dy in (-b / 2, b / 2):
                    rohy.append(np.array([q.stred[0] + r * math.cos(phi), q.y + dy, q.stred[1] + r * math.sin(phi)]))
    pr = [premietni(c, pohlad) for c in rohy]
    hl = float(np.mean([d for _, d in pr]))
    return _hull([p for p, _ in pr]), hl


def obrys_plechu(pl, pohlad):
    rohy = [np.array([pl.x0 + i * pl.dx, pl.y0 + j * pl.dy, pl.z0 + k * pl.dz]) for i in (0, 1) for j in (0, 1) for k in (0, 1)]
    pr = [premietni(c, pohlad) for c in rohy]
    return _hull([p for p, _ in pr]), float(np.mean([d for _, d in pr]))


def nakresli_konstrukciu(k: Kresba, r, pohlad, filter_fn=None, plechy=True):
    b = r.b
    polozky = []
    for q in r.pruty:
        if filter_fn and not filter_fn(q):
            continue
        if q.druh == "arc" and pohlad == "bok":
            hl = q.y
            polozky.append((hl, "arcbok", q))
        else:
            poly, hl = obrys_pruta(q, b, pohlad)
            polozky.append((hl, "poly", poly))
    if plechy:
        for pl in r.plechy:
            poly, hl = obrys_plechu(pl, pohlad)
            polozky.append((hl, "plech", poly))
    # maliarsky algoritmus - najvzdialenejšie najprv
    polozky.sort(key=lambda t: -t[0])
    for hl, typ, obj in polozky:
        if typ == "poly":
            k.poly(obj, Vrstva.RAM, fill="white")
        elif typ == "plech":
            k.poly(obj, Vrstva.PLECH, fill="#d9d9d9")
        else:
            q = obj
            a0, a1 = sorted((math.degrees(q.phi0), math.degrees(q.phi1)))
            # výplň oblúka (pre zakrytie) ako polygón
            n = 40
            vonk = [(q.stred[0] + (q.R + b / 2) * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
                     q.stred[1] + (q.R + b / 2) * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]
            vnut = [(q.stred[0] + (q.R - b / 2) * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
                     q.stred[1] + (q.R - b / 2) * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n, -1, -1)]
            k.poly(vonk + vnut, Vrstva.RAM, fill="white", lw=0)
            k.arc(q.stred, q.R + b / 2, a0, a1)
            k.arc(q.stred, q.R - b / 2, a0, a1)
            for a in (a0, a1):
                ar = math.radians(a)
                k.line((q.stred[0] + (q.R - b / 2) * math.cos(ar), q.stred[1] + (q.R - b / 2) * math.sin(ar)),
                       (q.stred[0] + (q.R + b / 2) * math.cos(ar), q.stred[1] + (q.R + b / 2) * math.sin(ar)), lw=0.35)


def jazdna_plocha_bok(k: Kresba, r):
    """preglejka v bočnom pohľade (vrchná a spodná hrana)"""
    p = r.p
    H, a = r.H, r.a
    Rt, Rb, t = p["R_HORNY"], p["R_SPODNY"], r.tp
    Lp = p["DLZKA_PLOSINY"]
    ad = math.degrees(a)
    for d, lw in ((0, 0.7), (t, 0.35)):
        k.line((-Lp, H - d), (0, H - d), Vrstva.PLOCHA, lw=lw)
        k.arc(r.C1, Rt - d, 90 - ad, 90, Vrstva.PLOCHA, lw=lw)
        x1o = (Rt - d) * math.sin(a); z1o = r.C1[1] + (Rt - d) * math.cos(a)
        x2o = r.xe - (Rb + d) * math.sin(a); z2o = Rb - (Rb + d) * math.cos(a)
        k.line((x1o, z1o), (x2o, z2o), Vrstva.PLOCHA, lw=lw)
        if d == 0:
            k.arc(r.C3, Rb, 270 - ad, 270, Vrstva.PLOCHA, lw=lw)
        else:
            # spodná hrana preglejky končí na nábehovom plechu
            th = math.acos(min((Rb - 0.0) / (Rb + d), 1))
            k.arc(r.C3, Rb + d, 270 - ad, 270 - math.degrees(th), Vrstva.PLOCHA, lw=lw)


def teren(k: Kresba, x0, x1, z=0.0):
    k.line((x0, z), (x1, z), Vrstva.TEREN, lw=0.5)
    s = 1.2 * k.th
    x = x0
    while x < x1 - s:
        k.line((x, z), (x + s * 0.7, z - s * 0.7), Vrstva.TEREN, lw=0.18)
        x += s
