"""
Generátor výkresovej dokumentácie rozbehovej rampy.

Použitie:
    python3 generuj.py                 # uhol 55°
    python3 generuj.py --uhol 45       # iný sklon (max. 55°)
    python3 generuj.py --uhol 50 --r-spodny 4500 --vystup vystup_50

Výstupy (priečinok vystup/):
    rampa_3D.step          - 3D model pre Fusion 360 (File > Open / Upload)
    rampa_pohlady_1-1.dxf  - 2D pohľady 1:1 (Fusion: Insert > Insert DXF do skice)
    rampa_vykres.pdf       - výkres pre zváračov (A3, 4 listy)
    kusovnik.csv           - kusovník / zoznam rezov
    parametre.json         - parametre a vypočítané body (pre Fusion skript)
"""
import argparse
import csv
import json
import math
import os
from datetime import date

import numpy as np

from geometria import Rampa
from kreslenie import (Kresba, Vrstva, nakresli_konstrukciu, jazdna_plocha_bok, teren)

MM = 1 / 25.4


# =========================================================== STEP (CadQuery)
def export_step(r: Rampa, cesta):
    import cadquery as cq
    b, t = r.b, r.p["HRUBKA_STENY"]

    def jakel_line(q):
        p0, p1 = np.array(q.p0, float), np.array(q.p1, float)
        L = float(np.linalg.norm(p1 - p0))
        d = (p1 - p0) / L
        u = np.array(q.hore, float); u = u - d * np.dot(u, d)
        if np.linalg.norm(u) < 1e-6:
            u = np.cross(d, [0, 1, 0]) if abs(d[1]) < 0.9 else np.cross(d, [1, 0, 0])
        u /= np.linalg.norm(u)
        out = cq.Solid.makeBox(b, b, L, pnt=cq.Vector(-b / 2, -b / 2, 0))
        inn = cq.Solid.makeBox(b - 2 * t, b - 2 * t, L + 2, pnt=cq.Vector(-b / 2 + t, -b / 2 + t, -1))
        s = out.cut(inn)
        pl = cq.Plane(origin=cq.Vector(*p0), xDir=cq.Vector(*u), normal=cq.Vector(*d))
        return s.moved(cq.Location(pl))

    def jakel_arc(q):
        cx, cz = q.stred
        P = cq.Vector(cx + q.R * math.cos(q.phi0), q.y, cz + q.R * math.sin(q.phi0))
        rad = (cq.Vector(cx, q.y, cz) - P).normalized()
        tang = cq.Vector(-math.sin(q.phi0), 0, math.cos(q.phi0))
        pl = cq.Plane(origin=P, xDir=rad, normal=tang)
        wo = cq.Workplane(pl).rect(b, b).val()
        wi = cq.Workplane(pl).rect(b - 2 * t, b - 2 * t).val()
        ang = math.degrees(q.phi1 - q.phi0)
        a0, a1 = cq.Vector(cx, q.y, cz), cq.Vector(cx, q.y + 1, cz)
        s = cq.Solid.revolve(wo, [wi], abs(ang), a0, a1)
        # kontrola smeru otáčania - stred oblúka musí ležať na očakávanom mieste
        pm = (q.phi0 + q.phi1) / 2
        exp = cq.Vector(cx + q.R * math.cos(pm), q.y, cz + q.R * math.sin(pm))
        if (s.Center() - exp).Length > 0.2 * q.R * abs(q.phi1 - q.phi0):
            s = cq.Solid.revolve(wo, [wi], abs(ang), a1, a0)
        return s

    farby = {"A": cq.Color(0.20, 0.45, 0.80), "B": cq.Color(0.85, 0.30, 0.20),
             "C": cq.Color(0.95, 0.75, 0.10), "D": cq.Color(0.40, 0.40, 0.40)}
    mena = {"A": "A_Plosina", "B": "B_Rampa", "C": "C_Zabradlie", "D": "D_Podpery"}
    root = cq.Assembly(name="Rozbehova_rampa")
    sub = {g: cq.Assembly(name=mena[g]) for g in mena}
    pocet = {}
    for q in r.pruty:
        s = jakel_line(q) if q.druh == "line" else jakel_arc(q)
        pocet[q.pos] = pocet.get(q.pos, 0) + 1
        sub[q.skupina].add(s, name=f"Poz{q.pos:02d}_{pocet[q.pos]}", color=farby[q.skupina])
    for pl in r.plechy:
        s = cq.Solid.makeBox(pl.dx, pl.dy, pl.dz, pnt=cq.Vector(pl.x0, pl.y0, pl.z0))
        pocet[pl.pos] = pocet.get(pl.pos, 0) + 1
        sub[pl.skupina].add(s, name=f"Poz{pl.pos:02d}_{pocet[pl.pos]}", color=cq.Color(0.6, 0.6, 0.6))
    for g in mena:
        root.add(sub[g])

    # preglejka (jazdná plocha) - presná geometria s oblúkmi
    p = r.p
    H, a, Rt, Rb, tp, Lp, S = r.H, r.a, p["R_HORNY"], p["R_SPODNY"], r.tp, p["DLZKA_PLOSINY"], p["SIRKA"]
    th = math.acos(Rb / (Rb + tp))     # spodná hrana preglejky sa dotkne terénu

    def bod(c, R, phi):
        return (c[0] + R * math.cos(phi), c[1] + R * math.sin(phi))
    C1, C3 = r.C1, r.C3
    pe_top = bod(C3, Rb, 1.5 * math.pi - th)
    pe_bot = bod(C3, Rb + tp, 1.5 * math.pi - th)
    w = (cq.Workplane("XZ")
         .moveTo(-Lp, H).lineTo(0, H)
         .threePointArc(bod(C1, Rt, math.pi / 2 - a / 2), bod(C1, Rt, math.pi / 2 - a))
         .lineTo(*bod(C3, Rb, 1.5 * math.pi - a))
         .threePointArc(bod(C3, Rb, 1.5 * math.pi - (a + th) / 2), pe_top)
         .lineTo(*pe_bot)
         .threePointArc(bod(C3, Rb + tp, 1.5 * math.pi - (a + th) / 2), bod(C3, Rb + tp, 1.5 * math.pi - a))
         .lineTo(*bod(C1, Rt - tp, math.pi / 2 - a))
         .threePointArc(bod(C1, Rt - tp, math.pi / 2 - a / 2), (0, H - tp))
         .lineTo(-Lp, H - tp).close()
         .extrude(-S))
    root.add(w, name="E_Preglejka_18mm", color=cq.Color(0.80, 0.65, 0.45, 0.6))

    # kontajner - len referencia (priehľadný)
    Wk, Lk, Hk = p["SIRKA_KONTAJNERA"], p["DLZKA_KONTAJNERA"], p["VYSKA_KONTAJNERA"]
    kont = cq.Workplane("XY").box(Lk, Wk, Hk, centered=False).translate((-Lk, S / 2 - Wk / 2, 0))
    root.add(kont, name="REF_Kontajner", color=cq.Color(0.3, 0.3, 0.3, 0.25))
    root.save(cesta)


# ================================================================ DXF výstup
def do_dxf(kresby_s_posunom, cesta):
    import ezdxf
    doc = ezdxf.new("R2010", setup=True)
    doc.units = ezdxf.units.MM
    farby = {Vrstva.RAM: 7, Vrstva.PLOCHA: 30, Vrstva.KONT: 8, Vrstva.TEREN: 8, Vrstva.KOTY: 3,
             Vrstva.TEXT: 7, Vrstva.OS: 1, Vrstva.PLECH: 9, Vrstva.POS: 5}
    for n, c in farby.items():
        doc.layers.add(n, color=c)
    doc.linetypes.add("DASHED2", pattern=[15.0, 10.0, -5.0]) if "DASHED2" not in doc.linetypes else None
    msp = doc.modelspace()
    for k, (dx, dy) in kresby_s_posunom:
        for pr in k.prim:
            if pr[0] == "poly":
                _, pts, vr, fill, closed, lw, ls = pr
                if lw == 0:
                    continue
                pts = [(x + dx, y + dy) for x, y in pts]
                e = msp.add_lwpolyline(pts, close=closed, dxfattribs={"layer": vr})
                if ls == "--":
                    e.dxf.linetype = "DASHED"
            elif pr[0] == "arc":
                _, c, rr, a0, a1, vr, lw, ls = pr
                e = msp.add_arc((c[0] + dx, c[1] + dy), rr, a0, a1, dxfattribs={"layer": vr})
                if ls == "--":
                    e.dxf.linetype = "DASHED"
            elif pr[0] == "circle":
                _, c, rr, vr, lw = pr
                msp.add_circle((c[0] + dx, c[1] + dy), rr, dxfattribs={"layer": vr})
            elif pr[0] == "text":
                _, p, s, vr, h, rot, ha, va, bold, box = pr
                align = {("center", "center"): "MIDDLE_CENTER", ("left", "center"): "MIDDLE_LEFT",
                         ("right", "center"): "MIDDLE_RIGHT", ("left", "bottom"): "BOTTOM_LEFT",
                         ("center", "bottom"): "BOTTOM_CENTER", ("left", "top"): "TOP_LEFT"}.get((ha, va), "MIDDLE_CENTER")
                for i, riadok in enumerate(s.split("\n")):
                    msp.add_text(riadok, height=h * 0.8, rotation=rot, dxfattribs={"layer": vr}).set_placement(
                        (p[0] + dx, p[1] + dy - i * h * 1.4), align=ezdxf.enums.TextEntityAlignment[align])
    doc.saveas(cesta)


# ================================================================ matplotlib
def vykresli(ax, k: Kresba):
    from matplotlib.patches import Arc, Polygon, Circle
    sc = k.mierka
    pt = 72 * MM
    for pr in k.prim:
        if pr[0] == "poly":
            _, pts, vr, fill, closed, lw, ls = pr
            col = {Vrstva.KOTY: "#1a6e2e", Vrstva.PLOCHA: "#a0522d", Vrstva.KONT: "#777777",
                   Vrstva.POS: "#1f3f9f", Vrstva.TEREN: "#555555"}.get(vr, "black")
            if fill is not None and closed:
                ax.add_patch(Polygon(pts, closed=True, facecolor=fill, edgecolor=col if lw else "none",
                                     linewidth=lw * pt, linestyle=ls, zorder=2))
            else:
                xs, ys = zip(*pts)
                if closed:
                    xs, ys = xs + (xs[0],), ys + (ys[0],)
                ax.plot(xs, ys, color=col, linewidth=lw * pt, linestyle=ls, zorder=3,
                        solid_capstyle="butt")
        elif pr[0] == "arc":
            _, c, rr, a0, a1, vr, lw, ls = pr
            col = {Vrstva.KOTY: "#1a6e2e", Vrstva.PLOCHA: "#a0522d"}.get(vr, "black")
            ax.add_patch(Arc(c, 2 * rr, 2 * rr, theta1=a0, theta2=a1, color=col, linewidth=lw * pt,
                             linestyle=ls, zorder=3))
        elif pr[0] == "circle":
            _, c, rr, vr, lw = pr
            ax.add_patch(Circle(c, rr, facecolor="white", edgecolor="#1f3f9f", linewidth=lw * pt, zorder=4))
        elif pr[0] == "text":
            _, p, s, vr, h, rot, ha, va, bold, box = pr
            col = {Vrstva.KOTY: "#1a6e2e", Vrstva.POS: "#1f3f9f"}.get(vr, "black")
            ax.text(p[0], p[1], s, fontsize=h / sc * 72 * MM / 0.75, rotation=rot, ha=ha, va=va,
                    color=col, fontweight="bold" if bold else "normal", zorder=5, rotation_mode="anchor",
                    bbox=dict(facecolor="white", edgecolor="black", linewidth=0.4, pad=2) if box else
                    (dict(facecolor="white", edgecolor="none", pad=0.5, alpha=0.85) if vr in (Vrstva.KOTY,) else None),
                    linespacing=1.25)


def umiestni(fig, k, x_mm, y_mm, xmin, xmax, ymin, ymax, titulok=None):
    sc = k.mierka
    w, h = (xmax - xmin) / sc, (ymax - ymin) / sc
    ax = fig.add_axes([x_mm / 420, y_mm / 297, w / 420, h / 297])
    ax.set_xlim(xmin, xmax); ax.set_ylim(ymin, ymax)
    ax.axis("off")
    vykresli(ax, k)
    if titulok:
        fig.text((x_mm + w / 2) / 420, (y_mm + h + 3) / 297, f"{titulok}   M 1:{sc:.0f}",
                 ha="center", va="bottom", fontsize=11, fontweight="bold")
    return ax


def ramik(fig, r, list_c, nazov_listu, pocet_listov):
    from matplotlib.patches import Rectangle
    ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 420); ax.set_ylim(0, 297); ax.axis("off")
    ax.add_patch(Rectangle((20, 10), 390, 277, fill=False, linewidth=1.0))
    x0, y0, w, hh = 230, 10, 180, 36
    ax.add_patch(Rectangle((x0, y0), w, hh, fill=True, facecolor="white", linewidth=0.8, zorder=10))
    for yy in (y0 + 12, y0 + 24):
        ax.plot([x0, x0 + w], [yy, yy], color="black", linewidth=0.5, zorder=11)
    ax.plot([x0 + 120, x0 + 120], [y0, y0 + 24], color="black", linewidth=0.5, zorder=11)
    t = dict(zorder=12, va="center")
    ax.text(x0 + 3, y0 + 30, "ROZBEHOVÁ RAMPA (ROLL-IN) NA KONTAJNERI – OCEĽOVÁ KONŠTRUKCIA", fontsize=8.5,
            fontweight="bold", **t)
    ax.text(x0 + 3, y0 + 18, nazov_listu, fontsize=9, fontweight="bold", **t)
    ax.text(x0 + 3, y0 + 6, f"Jakel {r.b:.0f}x{r.b:.0f}x{r.p['HRUBKA_STENY']:.0f} – S235 | výška plošiny "
            f"{r.H:.0f} | sklon {r.p['UHOL']:.0f}° | rozmery v mm", fontsize=7, **t)
    ax.text(x0 + 123, y0 + 18, f"List {list_c}/{pocet_listov}", fontsize=8, **t)
    ax.text(x0 + 123, y0 + 6, f"Dátum: {date.today():%d.%m.%Y}", fontsize=7, **t)
    return ax


# =================================================================== listy
def poz(r, nazov):
    """čísla pozícií podľa začiatku názvu (pre odkazy v poznámkach)"""
    c = sorted({q.pos for q in r.pruty if q.nazov.startswith(nazov)} |
               {p.pos for p in r.plechy if p.nazov.startswith(nazov)})
    return ", ".join(str(x) for x in c)


def list_bok(r, fig):
    sc = 30
    k = Kresba("bok", sc)
    p = r.p
    H, Hk, Lp = r.H, p["VYSKA_KONTAJNERA"], p["DLZKA_PLOSINY"]
    # kontajner - referencia
    k.poly([(-2600, 0), (0, 0), (0, Hk), (-2600, Hk)], Vrstva.KONT, closed=False, lw=0.35, ls="--")
    k.text((-1800, Hk / 2), "KONTAJNER\n(referencia)", Vrstva.KONT, h=k.th * 1.2)
    teren(k, -2600, r.xe + 700)
    nakresli_konstrukciu(k, r, "bok", filter_fn=lambda q: q.skupina != "D", plechy=True)
    jazdna_plocha_bok(k, r)
    th = k.th
    # zvislé kóty
    k.kota((-Lp - 300, 0), (-Lp - 300, Hk), -3 * th, smer="v")
    k.kota((-Lp - 300, Hk), (-Lp - 300, H), -3 * th, smer="v")
    k.kota((-Lp - 300, 0), (-Lp - 300, H), -7 * th, smer="v", text=f"{H:.0f}  (výška plošiny)")
    k.kota((-Lp, H), (-Lp, H + p["ZABRADLIE"]), 2.5 * th, smer="v")
    # vodorovné kóty
    k.kota((-Lp, H), (0, H), 4 * th, smer="h")
    zb = -3.5 * th
    k.kota((0, 0), (r.x1, 0), zb, smer="h")
    k.kota((r.x1, 0), (r.x2, 0), zb, smer="h")
    k.kota((r.x2, 0), (r.xe, 0), zb, smer="h")
    k.kota((0, 0), (r.xe, 0), zb - 3 * th, smer="h", text=f"{r.xe:.0f}  (dĺžka zjazdu)")
    k.kota((-Lp, 0), (r.xe, 0), zb - 6 * th, smer="h", text=f"{r.xe + Lp:.0f}  (celková dĺžka)")
    # body dotyku
    for (x, z, nm) in ((r.x1, r.z1, "T1"), (r.x2, r.z2, "T2"), (r.xe, 0, "T3")):
        k.circle((x, z), 0.35 * th, Vrstva.KOTY)
        k.text((x + 1.2 * th, z + 1.0 * th), f"{nm} [{x:.0f}; {z:.0f}]", Vrstva.KOTY, ha="left")
    k.kota((r.x2 + 200, 0), (r.x2 + 200, r.z2), 2 * th, smer="v")
    k.kota((r.x1 + 250, r.z2), (r.x1 + 250, r.z1), 2 * th, smer="v")
    # uhol
    ad = p["UHOL"]
    xm = (r.x1 + r.x2) / 2; zm = (r.z1 + r.z2) / 2
    k.line((xm, zm), (xm + 1300, zm), Vrstva.KOTY, lw=0.18, ls="--")
    k.kota_uhol((xm, zm), -ad, 0, 1000, f"{ad:.0f}°  (max. 55°)")
    # rádiusy
    k.kota_r(r.C1, p["R_HORNY"], 90 - ad / 2, f"R{p['R_HORNY']:.0f}", von=-0.2)
    k.kota_r(r.C3, p["R_SPODNY"], 270 - ad / 2 - 4, f"R{p['R_SPODNY']:.0f} plynulý", von=-0.25)
    k.text((-Lp / 2, H + 2.0 * th), "PLOŠINA 1200x1200", h=th * 1.1, bold=True)
    k.text((r.x2 + 900, r.z2 + 1600), f"preglejka {r.tp:.0f} mm\nšírka {p['SIRKA']:.0f}", Vrstva.TEXT, ha="left")
    umiestni(fig, k, 28, 52, -2700, r.xe + 900, -1100, H + p["ZABRADLIE"] + 250, "BOČNÝ POHĽAD")
    # poznámky
    fig.text(28 / 420, 49 / 297,
             "T1, T2 = dotykové body rádiusov a rovného úseku, T3 = plynulý dotyk s terénom (súradnice [x; z] od čela kontajnera a terénu).\n"
             "Sklon je parametrický (max. 55°) – pri inej hodnote spustiť generuj.py --uhol XX, výkres a kusovník sa prepočítajú.",
             fontsize=7, va="top")


def list_bocnica(r, fig):
    sc = 30
    k = Kresba("bocnica", sc)
    th = k.th
    y0 = r.b / 2
    teren(k, -300, r.xe + 500)
    sel = lambda q: q.skupina == "B" and (q.druh == "arc" and q.y < 600 or q.druh == "line" and q.p0[1] < 600 and q.p1[1] < 600
                                          and abs(q.p0[1] - q.p1[1]) < 1)
    nakresli_konstrukciu(k, r, "bok", filter_fn=sel, plechy=False)
    jazdna_plocha_bok(k, r)
    # pozície
    hotove = set()
    for q in r.pruty:
        if not sel(q) or q.pos in hotove:
            continue
        hotove.add(q.pos)
        if q.druh == "line":
            m = ((q.p0[0] + q.p1[0]) / 2, (q.p0[2] + q.p1[2]) / 2)
        else:
            pm = (q.phi0 + q.phi1) / 2
            m = (q.stred[0] + q.R * math.cos(pm), q.stred[1] + q.R * math.sin(pm))
        smer = (1, 1) if m[1] > 900 else (1, -1)
        if "Spodný pás" in q.nazov:
            m = (m[0] - 600, m[1]); smer = (0.3, -1)
        k.pozicia(m, q.pos, smer)
    # rozostup stĺpikov
    st = r.stanice
    for i in range(len(st)):
        a = 0 if i == 0 else st[i - 1]
        if i == 0:
            k.kota((0, 0), (st[0], 0), -3 * th, smer="h")
        else:
            k.kota((st[i - 1], 0), (st[i], 0), -3 * th, smer="h")
    k.kota((st[-1], 0), (r.x_koniec_spodneho, 0), -3 * th, smer="h")
    k.kota((0, 0), (r.x_koniec_pasu, 0), -6 * th, smer="h", text=f"{r.x_koniec_pasu:.0f}  (koniec horného pásu)")
    for xx in st:
        k.kota((xx, r.b), (xx, r.vysky_stlpikov[xx]), 1.6 * th, smer="v")
    k.text((r.xe - 300, 900), "nábehová zóna:\nplech + kliny,\npozri pozn. 6", Vrstva.TEXT, ha="center")
    umiestni(fig, k, 30, 62, -500, r.xe + 600, -800, r.H + 300, "BOČNICA RAMPY – ŠABLÓNA (2 ks, zrkadlovo rovnaké)")

    # tabuľka stĺpikov
    axt = fig.add_axes([255 / 420, 60 / 297, 150 / 420, 70 / 297]); axt.axis("off")
    rows = [["stĺpik", "x osi [mm]", "dĺžka [mm]", "horný rez"]]
    for i, xx in enumerate(st):
        sk = math.degrees(r.sklon(xx, r.tp + r.b))
        rows.append([f"S{i + 1}", f"{xx:.0f}", f"{r.vysky_stlpikov[xx] - r.b:.0f}", f"{sk:.1f}°" if sk > 0.5 else "kolmo"])
    tb = axt.table(cellText=rows, loc="upper left", cellLoc="center", colWidths=[0.18, 0.27, 0.27, 0.28])
    tb.auto_set_font_size(False); tb.set_fontsize(7.5); tb.scale(1, 1.25)
    fig.text(255 / 420, 52 / 297,
             "Postup: bočnicu vyznačiť 1:1 na rovnej podlahe (DXF), zvariť obe bočnice na sebe,\n"
             f"potom spojiť priečkami (poz. {poz(r, 'Zadná stena - priečka')}, {poz(r, 'Spodná priečka')}, {poz(r, 'Priečnik pod preglejku')}) "
             "a diagonálami. Dĺžky diagonál zakrátiť na mieru.",
             fontsize=7, va="top")


def list_pohlady(r, fig):
    import matplotlib.pyplot as plt  # noqa
    p = r.p
    sc = 40
    # pohľad zhora
    k = Kresba("zhora", sc)
    th = k.th
    Wk = p["SIRKA_KONTAJNERA"]; S = p["SIRKA"]; Lp = p["DLZKA_PLOSINY"]
    k.poly([(-2000, S / 2 - Wk / 2), (0, S / 2 - Wk / 2), (0, S / 2 + Wk / 2), (-2000, S / 2 + Wk / 2)], Vrstva.KONT,
           closed=False, lw=0.35, ls="--")
    k.text((-1700, S / 2 + Wk / 2 - 250), "kontajner", Vrstva.KONT)
    nakresli_konstrukciu(k, r, "zhora", plechy=True)
    k.kota((-Lp, S), (0, S), 3 * th, smer="h")
    k.kota((0, S), (r.xe, S), 3 * th, smer="h")
    k.kota((r.xe + 200, 0), (r.xe + 200, S), 4 * th, smer="v", text=f"{S:.0f} (šírka jazdnej plochy)")
    k.kota((-1900, S / 2 - Wk / 2), (-1900, S / 2 + Wk / 2), -2 * th, smer="v")
    umiestni(fig, k, 30, 180, -2300, r.xe + 900, S / 2 - Wk / 2 - 200, S / 2 + Wk / 2 + 900, "POHĽAD ZHORA (bez preglejky)")

    # pohľad zozadu
    k2 = Kresba("zozadu", sc)
    th = k2.th
    teren(k2, -S - 900, 900)
    k2.poly([(-(S / 2 + Wk / 2), 0), (-(S / 2 + Wk / 2), p["VYSKA_KONTAJNERA"]),
             (-(S / 2 - Wk / 2), p["VYSKA_KONTAJNERA"]), (-(S / 2 - Wk / 2), 0)], Vrstva.KONT, closed=False, ls="--")
    nakresli_konstrukciu(k2, r, "zozadu", filter_fn=lambda q: q.skupina != "D" or True, plechy=False)
    k2.kota((-S, r.H), (0, r.H), 3 * th, smer="h")
    k2.kota((0, 0), (0, r.H), -3 * th, smer="v")
    k2.kota((0, p["VYSKA_KONTAJNERA"]), (0, r.H), -1.5 * th, smer="v")
    # pozície - bubliny v dvoch stĺpcoch vľavo/vpravo, bez prekrývania
    hot, body = set(), []
    for q in r.pruty:
        if q.nazov.startswith(("Zadná stena", "Plošina", "Zábradlie", "Podperný")) and q.pos not in hot and q.druh == "line":
            hot.add(q.pos)
            body.append(((-(q.p0[1] + q.p1[1]) / 2, (q.p0[2] + q.p1[2]) / 2), q.pos))
    body.sort(key=lambda t: t[0][1])
    posl = {-1: -1e9, 1: -1e9}
    for i, (m, cislo) in enumerate(body):
        strana = -1 if i % 2 == 0 else 1
        x = -S - 700 if strana < 0 else 700
        y = max(m[1], posl[strana] + 2.6 * th)
        posl[strana] = y
        k2.line(m, (x - strana * 0.9 * th, y), Vrstva.POS, lw=0.18)
        k2.circle((x, y), 0.9 * th, Vrstva.POS)
        k2.text((x, y), str(cislo), Vrstva.POS, h=0.9 * th, bold=True)
    umiestni(fig, k2, 30, 22, -S - 1300, 1300, -400, r.H + p["ZABRADLIE"] + 300, "POHĽAD ZOZADU (od plošiny)")

    # izometria
    ax = fig.add_axes([170 / 420, 50 / 297, 240 / 420, 145 / 297], projection="3d")
    farby = {"A": "#2f6fca", "B": "#d24a2f", "C": "#e3b30f", "D": "#666666"}
    for q in r.pruty:
        if q.druh == "line":
            xs, ys, zs = zip(q.p0, q.p1)
        else:
            ph = np.linspace(q.phi0, q.phi1, 30)
            xs = q.stred[0] + q.R * np.cos(ph); zs = q.stred[1] + q.R * np.sin(ph); ys = np.full_like(xs, q.y)
        ax.plot(xs, ys, zs, color=farby[q.skupina], linewidth=1.3)
    # preglejka
    xs = np.linspace(-Lp, r.xe, 120)
    zs = np.array([r.z_offset(x, 0) for x in xs])
    X, Y = np.meshgrid(xs, [0, S]); Z = np.vstack([zs, zs])
    ax.plot_surface(X, Y, Z, color="#c9a46a", alpha=0.25, linewidth=0)
    ax.set_box_aspect((r.xe + Lp + 800, 2600, r.H + 1100))
    ax.set_xlim(-Lp - 400, r.xe + 400); ax.set_ylim(-700, 1900); ax.set_zlim(0, r.H + 1100)
    ax.view_init(elev=22, azim=-58)
    ax.set_axis_off()
    fig.text(290 / 420, 196 / 297, "IZOMETRIA", ha="center", fontsize=11, fontweight="bold")
    fig.text(290 / 420, 54 / 297, "modrá A – plošina | červená B – rampa | žltá C – zábradlie | sivá D – podpery",
             ha="center", fontsize=7)


def list_kusovnik(r, fig):
    kus = r.kusovnik()
    ax = fig.add_axes([24 / 420, 100 / 297, 380 / 420, 182 / 297]); ax.axis("off")
    rows = [["poz.", "skup.", "názov", "profil / rozmer", "dĺžka v osi [mm]", "ks", "spolu [m]", "kg", "poznámka"]]
    m_j = kg = 0
    for x in kus:
        rows.append([x["pos"], x["skupina"], x["nazov"], x["profil"], f"{x['dlzka']:.0f}" if x["dlzka"] else "–",
                     x["ks"], f"{x['spolu_m']:.2f}" if x["dlzka"] else "–", f"{x['kg']:.1f}", x["poznamka"]])
        if x["dlzka"]:
            m_j += x["spolu_m"]
        kg += x["kg"]
    rows.append(["", "", "SPOLU", "", "", "", f"{m_j:.1f} m", f"{kg:.0f} kg", "+ 10 % na prerezy / odpad"])
    tb = ax.table(cellText=rows, cellLoc="left", bbox=[0, 0, 1, 1],
                  colWidths=[0.035, 0.035, 0.22, 0.13, 0.08, 0.03, 0.06, 0.05, 0.36])
    tb.auto_set_font_size(False); tb.set_fontsize(6.2)
    for (i, j), c in tb.get_celld().items():
        c.set_linewidth(0.3)
        if i == 0 or i == len(rows) - 1:
            c.set_text_props(fontweight="bold")
    p = r.p
    pozn = [
        "TECHNICKÉ POZNÁMKY",
        f"1. Materiál: jakel {r.b:.0f}x{r.b:.0f}x{p['HRUBKA_STENY']:.0f} (EN 10219, S235JRH), plechy S235. Zvary kútové a=3 mm, obvodové, súvislé.",
        f"2. Horný pás: poz. {poz(r, 'Horný pás - horný')} zakružiť na polomer v osi R{p['R_HORNY'] - r.tp - r.b / 2:.0f}, poz. {poz(r, 'Horný pás - spodný')} na R{p['R_SPODNY'] + r.tp + r.b / 2:.0f} "
        "(zakružovačka profilov). Pás musí byť plynulý – spoje na tupo, prebrúsiť zarovno.",
        f"3. Priečniky pod preglejku (poz. {poz(r, 'Priečnik pod preglejku')}) vrchom zarovno s horným pásom, rozostup max. {p['ROZOSTUP_PRIECNIKOV']:.0f} mm po oblúku.",
        f"4. Preglejka {r.tp:.0f} mm protišmyková; v rádiusoch skladať z tenších vrstiev (spodný R: 2x9 mm, horný R: 3x6 mm). Skrutky do jaklu samorezné.",
        "5. Plošina (A) a rampa (B) sa zvárajú samostatne, na mieste spojiť M12 skrutkami cez susedné stĺpiky (x = 0). Zábradlie (C) privariť na horný rám.",
        f"6. Nábeh: horný pás končí tam, kde jeho spodná hrana dosadne na terén; posledný úsek do nuly riešiť podkladným plechom (poz. {poz(r, 'Nábehový')}) a drevenými klinmi + nábehový plech 3 mm.",
        "7. Kotvenie: rampa na betónové pätky/pás (terén je hlina!), pätky M12; plošina kotviť ku kontajneru cez rohové prvky (twistlock / zvarené príložky) – NIE na tenký plech strechy.",
        "8. Podperné nosníky (D) ukladať na horné pozdĺžniky kontajnera, poloha plošiny podľa skutočnosti. Odporúčaný silnejší profil 100x50x4.",
        "9. Povrchová úprava: odmastiť, základná farba + vrchná (alebo žiarový zinok). Ostré hrany zabrúsiť.",
        "10. Konštrukcia vo výške 4,2 m pre verejnosť – pred výrobou nechať overiť statikom (zaťaženie, vietor, kotvenie). Výkres je pracovný podklad.",
    ]
    fig.text(24 / 420, 95 / 297, "\n".join(pozn), fontsize=7.2, va="top", linespacing=1.45)


def export_pdf(r, cesta):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages
    plt.rcParams["font.family"] = "DejaVu Sans"
    listy = [("Bočný pohľad – hlavné rozmery", list_bok), ("Bočnica rampy – šablóna, pozície", list_bocnica),
             ("Pohľad zhora, zozadu, izometria", list_pohlady), ("Kusovník a technické poznámky", list_kusovnik)]
    pngs = []
    with PdfPages(cesta) as pdf:
        for i, (nm, fn) in enumerate(listy, 1):
            fig = plt.figure(figsize=(420 * MM, 297 * MM))
            ramik(fig, r, i, nm, len(listy))
            fn(r, fig)
            pdf.savefig(fig)
            png = cesta.replace(".pdf", f"_list{i}.png")
            fig.savefig(png, dpi=110)
            pngs.append(png)
            plt.close(fig)
    return pngs


def export_dxf(r, cesta):
    k1 = Kresba("bok", 25)
    teren(k1, -2600, r.xe + 700)
    p = r.p
    k1.poly([(-2600, 0), (0, 0), (0, p["VYSKA_KONTAJNERA"]), (-2600, p["VYSKA_KONTAJNERA"])], Vrstva.KONT, closed=False, ls="--")
    nakresli_konstrukciu(k1, r, "bok", filter_fn=lambda q: q.skupina != "D")
    jazdna_plocha_bok(k1, r)
    k1.kota((-p["DLZKA_PLOSINY"] - 300, 0), (-p["DLZKA_PLOSINY"] - 300, r.H), -3 * k1.th, smer="v")
    k1.kota((0, 0), (r.xe, 0), -3 * k1.th, smer="h")
    k1.text((0, r.H + 2000), f"BOCNY POHLAD 1:1 - sklon {p['UHOL']:.0f} st., R{p['R_HORNY']:.0f} / R{p['R_SPODNY']:.0f}",
            h=120, ha="left")
    k2 = Kresba("zhora", 25)
    nakresli_konstrukciu(k2, r, "zhora")
    k2.text((0, p["SIRKA"] + 600), "POHLAD ZHORA 1:1", h=120, ha="left")
    k3 = Kresba("zozadu", 25)
    nakresli_konstrukciu(k3, r, "zozadu")
    k3.text((-p["SIRKA"], r.H + 1700), "POHLAD ZOZADU 1:1", h=120, ha="left")
    do_dxf([(k1, (0, 0)), (k2, (0, -4500)), (k3, (r.xe + 3500, 0))], cesta)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--uhol", type=float, default=55.0)
    ap.add_argument("--r-horny", type=float, default=1000.0)
    ap.add_argument("--r-spodny", type=float, default=4000.0)
    ap.add_argument("--vyska-kontajnera", type=float, default=3000.0)
    ap.add_argument("--vyska-plosiny", type=float, default=1200.0)
    ap.add_argument("--sirka", type=float, default=1200.0)
    ap.add_argument("--vystup", default="vystup")
    ap.add_argument("--bez-step", action="store_true")
    a = ap.parse_args()
    r = Rampa(UHOL=a.uhol, R_HORNY=a.r_horny, R_SPODNY=a.r_spodny, VYSKA_KONTAJNERA=a.vyska_kontajnera,
              VYSKA_PLOSINY=a.vyska_plosiny, SIRKA=a.sirka)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), a.vystup)
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "kusovnik.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["poz", "skupina", "nazov", "profil", "dlzka_os_mm", "ks", "spolu_m", "kg", "poznamka"])
        for x in r.kusovnik():
            w.writerow([x["pos"], x["skupina"], x["nazov"], x["profil"], f"{x['dlzka']:.0f}", x["ks"],
                        f"{x['spolu_m']:.2f}", f"{x['kg']:.1f}", x["poznamka"]])
    with open(os.path.join(out, "parametre.json"), "w", encoding="utf-8") as f:
        json.dump(dict(parametre={k: v for k, v in r.p.items()}, body=r.suhrn(),
                       stanice_stlpikov=r.stanice), f, ensure_ascii=False, indent=2)
    export_dxf(r, os.path.join(out, "rampa_pohlady_1-1.dxf"))
    pngs = export_pdf(r, os.path.join(out, "rampa_vykres.pdf"))
    if not a.bez_step:
        export_step(r, os.path.join(out, "rampa_3D.step"))
    print("Hotovo:", out)
    print(json.dumps({k: round(v, 1) for k, v in r.suhrn().items()}, ensure_ascii=False, indent=1))
    return pngs


if __name__ == "__main__":
    main()
