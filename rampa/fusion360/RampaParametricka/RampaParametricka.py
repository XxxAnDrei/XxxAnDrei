# Fusion 360 skript: parametrický profil rozbehovej rampy + import 3D rámu (STEP)
#
# Inštalácia: Utilities > Add-Ins > Scripts and Add-Ins > "+" (My Scripts)
#             > vybrať priečinok RampaParametricka > Run
#
# Vytvorí:
#   * užívateľské parametre (Modify > Change Parameters):
#       uhol, r_horny, r_spodny, vyska_kontajnera, vyska_plosiny, dlzka_plosiny, sirka, preglejka, jakel
#   * skicu "Profil_jazdnej_plochy" v rovine XZ - plošina, horný rádius, rovný zjazd,
#     spodný plynulý rádius s dotykom na terén. Všetky kóty sú naviazané na parametre,
#     uhol NIE JE uzamknutý - zmeň "uhol" v Change Parameters a profil sa prepočíta.
#   * plochu jazdnej dráhy (extrúzia profilu na šírku "sirka") - telo "Jazdna_plocha"
#   * voliteľne import rampa_3D.step (oceľový rám vygenerovaný skriptom generuj.py)
#
# Pozn.: oceľový rám v STEP je vygenerovaný pre konkrétny uhol (55°). Pri inom uhle
# ho pregeneruj:  python3 generuj.py --uhol 50  a importuj znova.

import math
import traceback

import adsk.core
import adsk.fusion

PARAMS = [
    # názov, hodnota, jednotka, komentár
    ("uhol", "55 deg", "deg", "sklon zjazdu (max. 55 deg)"),
    ("r_horny", "1000 mm", "mm", "horny vypukly radius plosina -> zjazd"),
    ("r_spodny", "4000 mm", "mm", "spodny plynuly radius do terenu"),
    ("vyska_kontajnera", "3000 mm", "mm", "vyska strechy kontajnera"),
    ("vyska_plosiny", "1200 mm", "mm", "vyska plosiny nad kontajnerom"),
    ("dlzka_plosiny", "1200 mm", "mm", "hlbka plosiny v smere jazdy"),
    ("sirka", "1200 mm", "mm", "sirka jazdnej plochy (preglejka)"),
    ("preglejka", "18 mm", "mm", "hrubka preglejky"),
    ("jakel", "50 mm", "mm", "jakel 50x50x3"),
]

DEF = dict(uhol=55.0, r_horny=1000.0, r_spodny=4000.0, H=4200.0, Lp=1200.0)


def run(context):
    ui = None
    try:
        app = adsk.core.Application.get()
        ui = app.userInterface
        design = adsk.fusion.Design.cast(app.activeProduct)
        if not design:
            ui.messageBox("Otvor najprv dizajn (Design workspace).")
            return
        design.designType = adsk.fusion.DesignTypes.ParametricDesignType
        root = design.rootComponent

        # ---------------------------------------------------------- parametre
        up = design.userParameters
        for name, val, unit, com in PARAMS:
            if up.itemByName(name) is None:
                up.add(name, adsk.core.ValueInput.createByString(val), unit, com)

        # ----------------------------------------------- počiatočná geometria
        a = math.radians(DEF["uhol"])
        Rt, Rb, H, Lp = DEF["r_horny"], DEF["r_spodny"], DEF["H"], DEF["Lp"]
        x1 = Rt * math.sin(a); z1 = H - Rt * (1 - math.cos(a))
        z2 = Rb * (1 - math.cos(a)); x2 = x1 + (z1 - z2) / math.tan(a)
        xe = x2 + Rb * math.sin(a)

        sk = root.sketches.add(root.xZConstructionPlane)
        sk.name = "Profil_jazdnej_plochy"
        sk.isComputeDeferred = True

        def P(x, z):  # mm v modeli -> bod v priestore skice (cm)
            return sk.modelToSketchSpace(adsk.core.Point3D.create(x / 10.0, 0, z / 10.0))

        L = sk.sketchCurves.sketchLines
        A = sk.sketchCurves.sketchArcs
        gc = sk.geometricConstraints
        dims = sk.sketchDimensions

        def najblizsi(curve, x, z):
            t = P(x, z)
            s, e = curve.startSketchPoint, curve.endSketchPoint
            return s if s.geometry.distanceTo(t) <= e.geometry.distanceTo(t) else e

        # terén
        teren = L.addByTwoPoints(P(-Lp - 500, 0), P(xe + 1000, 0))
        teren.isConstruction = True
        # čelo kontajnera (zvislá konštrukčná čiara z počiatku)
        celo = L.addByTwoPoints(sk.originPoint, P(0, H))
        celo.isConstruction = True
        # plošina
        plos = L.addByTwoPoints(P(-Lp, H), P(0, H))
        # horný rádius
        am = a / 2
        arc1 = A.addByThreePoints(P(0, H), P(Rt * math.sin(am), H - Rt * (1 - math.cos(am))), P(x1, z1))
        # rovný zjazd
        zjazd = L.addByTwoPoints(P(x1, z1), P(x2, z2))
        # spodný rádius
        arc2 = A.addByThreePoints(P(x2, z2), P(xe - Rb * math.sin(am), Rb * (1 - math.cos(am))), P(xe, 0))

        # ---------------------------------------------------------- väzby
        def safe(fn, *args):
            try:
                return fn(*args)
            except Exception:
                return None

        safe(gc.addCoincident, sk.originPoint, teren)
        safe(gc.addHorizontal, teren)
        safe(gc.addVertical, celo)
        safe(gc.addHorizontal, plos)
        safe(gc.addCoincident, celo.endSketchPoint, plos.endSketchPoint)
        safe(gc.addCoincident, najblizsi(arc1, 0, H), plos.endSketchPoint)
        safe(gc.addCoincident, najblizsi(arc1, x1, z1), zjazd.startSketchPoint)
        safe(gc.addCoincident, najblizsi(arc2, x2, z2), zjazd.endSketchPoint)
        safe(gc.addCoincident, najblizsi(arc2, xe, 0), teren)
        safe(gc.addTangent, arc1, plos)
        safe(gc.addTangent, arc1, zjazd)
        safe(gc.addTangent, arc2, zjazd)
        safe(gc.addTangent, arc2, teren)

        # ---------------------------------------------------------- kóty
        H_ = adsk.fusion.DimensionOrientations.HorizontalDimensionOrientation
        V_ = adsk.fusion.DimensionOrientations.VerticalDimensionOrientation
        chyby = []

        def kota(fn, args, expr, nazov):
            try:
                d = fn(*args)
                d.parameter.expression = expr
                return d
            except Exception:
                chyby.append(nazov)
                return None

        kota(dims.addDistanceDimension, (celo.startSketchPoint, celo.endSketchPoint, V_, P(-300, H / 2)),
             "vyska_kontajnera + vyska_plosiny", "vyska")
        kota(dims.addDistanceDimension, (plos.startSketchPoint, plos.endSketchPoint, H_, P(-Lp / 2, H + 300)),
             "dlzka_plosiny", "dlzka plosiny")
        kota(dims.addRadialDimension, (arc1, P(x1 / 2 + 300, H + 300)), "r_horny", "r_horny")
        kota(dims.addRadialDimension, (arc2, P(xe - 1500, 1500)), "r_spodny", "r_spodny")
        # uhol: textový bod v ostrom uhle medzi zjazdom a terénom
        xi = x2 + z2 / math.tan(a)
        try:
            d = dims.addAngularDimension(zjazd, teren, P(xi - 900, 250))
            namerany = d.parameter.value  # radiány
            if abs(namerany - a) <= abs(namerany - (math.pi - a)):
                d.parameter.expression = "uhol"
            else:
                d.parameter.expression = "180 deg - uhol"
        except Exception:
            chyby.append("uhol")

        sk.isComputeDeferred = False

        # ------------------------------------------- jazdná plocha (telo)
        try:
            path = root.features.createPath(plos, True)  # reťaz plošina-oblúk-zjazd-oblúk
            ext = root.features.extrudeFeatures
            # extrúzia otvoreného profilu ako plocha (surface) na šírku
            inp = ext.createInput(path, adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
            inp.isSolid = False
            inp.setOneSideExtent(adsk.fusion.DistanceExtentDefinition.create(
                adsk.core.ValueInput.createByString("sirka")),
                adsk.fusion.ExtentDirections.NegativeExtentDirection)
            f = ext.add(inp)
            if f.bodies.count:
                f.bodies.item(0).name = "Jazdna_plocha"
        except Exception:
            chyby.append("plocha (extrúzia) - vytvor ručne: Extrude na skicu, Thin/Surface, vzdialenosť = sirka")

        # ------------------------------------------- import 3D rámu (STEP)
        res = ui.messageBox("Importovať aj 3D oceľový rám (rampa_3D.step)?", "Rampa",
                            adsk.core.MessageBoxButtonTypes.YesNoButtonType)
        if res == adsk.core.DialogResults.DialogYes:
            dlg = ui.createFileDialog()
            dlg.title = "Vyber rampa_3D.step"
            dlg.filter = "STEP (*.step;*.stp)"
            if dlg.showOpen() == adsk.core.DialogResults.DialogOK:
                im = app.importManager
                opt = im.createSTEPImportOptions(dlg.filename)
                im.importToTarget(opt, root)

        msg = ("Hotovo.\n\nUhol zmeníš: Modify > Change Parameters > uhol (max. 55 deg).\n"
               "Profil skice sa prepočíta. Oceľový rám (STEP) pregeneruj: python3 generuj.py --uhol XX")
        if chyby:
            msg += "\n\nNepodarilo sa automaticky vytvoriť: " + ", ".join(chyby) + "\n(doplň ručne v skici)"
        ui.messageBox(msg)
    except Exception:
        if ui:
            ui.messageBox("Chyba:\n{}".format(traceback.format_exc()))
