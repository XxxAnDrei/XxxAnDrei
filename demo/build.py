#!/usr/bin/env python3
"""
Z jedného zdroja (_base.html) vyrobí tri samostatné prezentačné stránky,
každú pre jeden segment. Každá stránka pozná len svoju prevádzku:
vlastný text, vlastný cenník, vlastný tím, vlastnú farbu, vlastný admin panel.

    python3 build.py

Výstup: termino-barbershop.html, termino-ambulancia.html, termino-vizaz.html
"""

import json
import pathlib
import re

HERE = pathlib.Path(__file__).parent
BASE = (HERE / "_base.html").read_text(encoding="utf-8")

AUTHOR = "Ing. Andrej Miček"

# Každá stránka má jednu farbu: farbu svojho odvetvia.
# (svetlý akcent, tmavší odtieň, výplň, linka, text na akcente) x (svetlý, tmavý režim)
ACCENTS = {'barber': ('#7A5A2B', '#5C4320', '#F4EDE1', '#DFCCA9', '#FFFFFF', '#CFAC72', '#E3C696', '#2A2317', '#453922', '#191204'), 'klinika': ('#1F5FA8', '#17477E', '#E6EEF8', '#BAD1EC', '#FFFFFF', '#79ADE8', '#9CC6F2', '#16283C', '#254160', '#08131F'), 'salon': ('#8B4F6B', '#6B3B52', '#F6EAF0', '#E2C2D2', '#FFFFFF', '#D093AC', '#E4B4C6', '#2A1C24', '#452E39', '#1B1016')}

# ============================================================
# SEGMENTY
# ============================================================

SEGMENTS = [

    # --------------------------------------------------------
    {
        "out": "termino-barbershop.html",
        "title": "Termino pre barbershop",
        "key": "barber",
        "domain": "barbershop-kotva",

        "tenant": {
            "key": "barber", "color": "#7A5A2B",
            "name": "Barbershop Kotva", "kind": "Pánske holičstvo",
            "words": {
                "clientOne": "Klient", "clientPl": "Klienti",
                "serviceOne": "Služba", "servicePl": "Služby", "serviceAcc": "službu",
                "staffOne": "Barber", "staffAcc": "barbera", "book": "Rezervácia",
            },
            "hours": {"1": [540, 1140], "2": [540, 1140], "3": [540, 1140], "4": [540, 1140],
                      "5": [540, 1140], "6": [540, 840], "0": None},
            "hoursText": [["Pondelok", "09:00 - 19:00"], ["Utorok", "09:00 - 19:00"],
                          ["Streda", "09:00 - 19:00"], ["Štvrtok", "09:00 - 19:00"],
                          ["Piatok", "09:00 - 19:00"], ["Sobota", "09:00 - 14:00"], ["Nedeľa", None]],
            "step": 15,
            "services": [
                {"id": "v1", "name": "Strih", "dur": 45, "price": 22},
                {"id": "v2", "name": "Strih na jednu dĺžku", "dur": 30, "price": 14},
                {"id": "v3", "name": "Úprava brady", "dur": 20, "price": 15},
                {"id": "v4", "name": "Strih a brada", "dur": 60, "price": 32},
                {"id": "v5", "name": "Detský strih", "dur": 30, "price": 16},
            ],
            "staff": [
                {"id": "s1", "name": "Tomáš Hríb", "short": "Tomáš", "role": "Majiteľ, senior barber",
                 "does": ["v1", "v2", "v3", "v4", "v5"]},
                {"id": "s2", "name": "Denis Kubica", "short": "Denis", "role": "Barber",
                 "does": ["v1", "v2", "v3", "v4"]},
                {"id": "s3", "name": "Erik Vaňo", "short": "Erik", "role": "Junior barber",
                 "does": ["v2", "v3", "v5"]},
            ],
            "customers": ["Michal Ondrej", "Filip Baran", "Adam Kysel", "Roman Duda",
                          "Patrik Šimko", "Marek Leško", "Dávid Uhrin", "Matej Chren"],
            "admin": {"name": "Tomáš Hríb", "role": "Majiteľ prevádzky"},
        },

        "h1": "Kreslo si klient zarezervuje <b>sám</b>.",
        "sub": "Web s rezervačným systémom pre barbershopy. Postavím ho aj nasadím.",
        "h_now": "Ako to vyzerá teraz",
        "h_why": "Prečo to robím takto",
        "h_try": "Skús si to",
        "quote": 'Najdrahšie kreslo je to prázdne. A prázdne býva preto, že sa niekto <span>nedovolal</span>.',
        "admin_p": "Rovnaký deň, ako ho vidíš ty za kreslom. Kalendár po barberoch, tabuľka rezervácií, karty klientov, tržby. Otvorí sa na celú obrazovku a dá sa preklikať.",

        "observations": [
            "<b>Telefón zvoní, keď máš britvu pri tvári.</b> Buď ho zdvihneš a klient v kresle čaká, alebo ho nezdvihneš a ten druhý si nájde iného.",
            "Objednávky chodia cez Instagram, Messenger aj SMS. Traja barberi, tri telefóny, jeden kalendár nikde.",
            "<b>Niekto nepríde.</b> Zistíš to o 14:15, keď mal byť o druhej. Kreslo stálo hodinu prázdne.",
            "Ľudia sa rozhodujú v nedeľu večer. Ty otváraš v pondelok o deviatej.",
            "Presunúť jeden termín znamená päť správ a jedna z nich sa stratí.",
        ],
        "arguments": [
            {"t": "Systém pozná čas",
             "d": "Strih trvá štyridsaťpäť minút, brada dvadsať. Systém to vie a neponúkne termín, ktorý sa do zatváracích hodín nezmestí. Nikto si nerezervuje strih na 18:45, keď zatváraš o siedmej."},
            {"t": "Junior má vlastné ceny",
             "d": "Každý barber má svoje hodiny, svoj zoznam služieb a svoj cenník. Kto si vyberie juniora, uvidí jeho ceny a jeho voľné časy, nie tvoje."},
            {"t": "Zrušenie uvoľní kreslo",
             "d": "V potvrdzovacom maile je odkaz na zrušenie. Kto ho stlačí, uvoľní termín ostatným v tej sekunde. Ty nemusíš nič prepisovať a ten čas sa hneď ponúkne ďalšiemu."},
        ],
        "facts": [
            "Rezervácie aj o polnoci.",
            "Potvrdenie mailom hneď, pripomienka deň vopred.",
            "Každý barber vlastné hodiny, služby aj ceny.",
            "História strihov pri každom klientovi.",
            "Dovolenky, sviatky, skrátené soboty.",
            "Export do tabuľky.",
        ],
        "nots": [
            "Neprijíma platby. Platí sa v prevádzke, ako doteraz.",
            "Nenapojí sa na registračnú pokladňu.",
            "Nepredáva pomádu ani vosk. Nie je to e-shop.",
            "Nie je to aplikácia z obchodu. Je to web, ktorý funguje aj v telefóne.",
        ],
        "faq": [
            {"q": "Moji chlapi chodia bez objednania.",
             "a": "Nech chodia. Voľné okno v kalendári zapíšeš klikom a vyzerá rovnako ako online rezervácia. Systém nemá zrušiť walk-in, má ti odbremeniť telefón."},
            {"q": "Čo keď si niekto rezervuje a nepríde?",
             "a": "Deň vopred mu príde pripomienka, čo vyrieši väčšinu absencií. Zvyšok vidíš v karte klienta ako počet neúčastí, takže vieš, komu už termín radšej nedržať."},
            {"q": "Máme troch barberov a každý inú cenu.",
             "a": "Presne na to je to postavené. Každý má vlastný cenník aj vlastný rozvrh a klient vidí len to, čo daný barber naozaj robí."},
            {"q": "Komu patria dáta?",
             "a": "Tebe. Kedykoľvek si ich vyexportuješ do tabuľky. Ak sa raz rozhodneme skončiť, dostaneš ich a nemusíš o ne prosiť."},
            {"q": "Čo sa stane, keď prestanem platiť?",
             "a": "Web aj systém prestanú bežať a dáta ti vyexportujem. Žiadna viazanosť a žiadna výpoveď na mesiace dopredu."},
        ],
        "author": [
            "Robím weby s rezervačným systémom. Sám, od návrhu po nasadenie, takže sa nemáš s kým doťahovať o to, kto to má opraviť.",
            "Prvý som postavil barbershopu v Nitre. Odvtedy sa systém mení podľa toho, čo chalani za kreslom naozaj potrebujú, nie podľa toho, čo vyzerá dobre na obrázku.",
            "Nerobím to pre reťazce. Robím to pre prevádzky, kde majiteľ aj strihá. A ak máš dvoch klientov denne, nekupuj si to, zošit ti stačí.",
        ],
        "price": [
            'Za <b>web a rezervačný systém sa platí raz</b>. Cena závisí od toho, koľko vás je a koľko máte služieb, a poviem ti ju po prvom hovore. Žiadne balíčky a žiadne funkcie zamknuté za vyšším programom.',
            "Potom 39 € mesačne. V tej sume je hosting, doména, zálohovanie, aktualizácie, odosielanie mailov a to, že keď niečo prestane fungovať, opravím to ja.",
        ],
        "end_h": "Chceš to vidieť na svojom cenníku?",
        "end_p": "Napíš mi, koľko vás je a čo robíte. Pošlem ti ukážku s tvojimi službami a tvojím tímom.",
        "end_btn": "Napísať",
    },

    # --------------------------------------------------------
    {
        "out": "termino-ambulancia.html",
        "title": "Termino pre ambulanciu",
        "key": "klinika",
        "domain": "ambulancia-jasen",

        "tenant": {
            "key": "klinika", "color": "#1F5FA8",
            "name": "Ambulancia Jaseň", "kind": "Všeobecný lekár",
            "words": {
                "clientOne": "Pacient", "clientPl": "Pacienti",
                "serviceOne": "Výkon", "servicePl": "Výkony", "serviceAcc": "výkon",
                "staffOne": "Lekár", "staffAcc": "lekára", "book": "Objednanie",
            },
            "hours": {"1": [420, 840], "2": [420, 840], "3": [720, 1080], "4": [420, 840],
                      "5": [420, 780], "6": None, "0": None},
            "hoursText": [["Pondelok", "07:00 - 14:00"], ["Utorok", "07:00 - 14:00"],
                          ["Streda", "12:00 - 18:00"], ["Štvrtok", "07:00 - 14:00"],
                          ["Piatok", "07:00 - 13:00"], ["Sobota", None], ["Nedeľa", None]],
            "step": 10,
            "services": [
                {"id": "v1", "name": "Preventívna prehliadka", "dur": 30, "price": 0, "covered": True},
                {"id": "v2", "name": "Konzultácia výsledkov", "dur": 15, "price": 0, "covered": True},
                {"id": "v3", "name": "Odber krvi", "dur": 15, "price": 0, "covered": True},
                {"id": "v4", "name": "Očkovanie", "dur": 15, "price": 15},
                {"id": "v5", "name": "Potvrdenie o spôsobilosti", "dur": 20, "price": 25},
            ],
            "staff": [
                {"id": "s1", "name": "MUDr. Alena Rybárová", "short": "Dr. Rybárová",
                 "role": "Všeobecná lekárka", "does": ["v1", "v2", "v4", "v5"]},
                {"id": "s2", "name": "MUDr. Martin Zeman", "short": "Dr. Zeman",
                 "role": "Všeobecný lekár", "does": ["v1", "v2", "v5"]},
                {"id": "s3", "name": "Mgr. Klára Ondrušová", "short": "Sestra Ondrušová",
                 "role": "Zdravotná sestra", "does": ["v3", "v4"]},
            ],
            "customers": ["Jozef Hrivnák", "Mária Bláhová", "Peter Sedlák", "Zuzana Marková",
                          "Ľubomír Tkáč", "Ivana Gregorová", "Rastislav Jánoš", "Katarína Bezáková"],
            "admin": {"name": "Alena Rybárová", "role": "Vlastníčka ambulancie"},
        },

        "h1": "Pacient sa objedná <b>sám</b>. Aj o polnoci.",
        "sub": "Web s objednávacím systémom pre ambulancie. Postavím ho aj nasadím.",
        "h_now": "Ako to vyzerá teraz",
        "h_why": "Prečo to robím takto",
        "h_try": "Skúste si to",
        "quote": 'Objednávanie nie je práca pre sestru. Je to práca pre <span>kalendár</span>.',
        "admin_p": "Rovnaký deň, ako ho vidí sestra pri okienku. Kalendár po lekároch, zoznam objednaní, karty pacientov, obsadenosť ordinačných hodín. Otvorí sa na celú obrazovku a dá sa preklikať.",

        "observations": [
            "<b>Telefón zvoní počas vyšetrenia.</b> Buď ho zdvihnete a pacient na lehátku čaká, alebo ho nezdvihnete a ten druhý volá znova o desať minút.",
            "Sestra strávi objednávaním hodinu denne. To je dvadsať hodín mesačne, počas ktorých nerobí nič iné.",
            "V čakárni sedia štyria a traja z nich prišli bez objednania.",
            "<b>Pacient nepríde.</b> Dozviete sa to o 8:15, keď mal byť o ôsmej.",
            "Zošit pri okienku pozná len ten, kto ho práve drží.",
        ],
        "arguments": [
            {"t": "Systém pozná ordinačné hodiny",
             "d": "Preventívna prehliadka trvá tridsať minút, odber pätnásť. Streda je len poobede. Systém to vie a neponúkne termín, ktorý sa do ordinačných hodín nezmestí."},
            {"t": "Sestra prestane objednávať telefonicky",
             "d": "Objednanie, ktoré cez telefón trvalo tri minúty, si pacient vybaví za pol minúty sám. Čo sa nedá online, zapíšete v kalendári klikom, rovnako rýchlo ako doteraz do zošita."},
            {"t": "Objednaný vie, kedy má prísť",
             "d": "Termín má konkrétny čas, nie „príďte ráno\". Čakáreň sa prestane plniť ľuďmi, ktorí čakajú dve hodiny a hnevajú sa na sestru."},
        ],
        "facts": [
            "Objednávanie dvadsaťštyri hodín denne.",
            "Potvrdenie mailom hneď, pripomienka deň vopred.",
            "Lekár aj sestra vlastný rozvrh a vlastné výkony.",
            "Výkony hradené poisťovňou aj samoplatcovské.",
            "Dovolenky, sviatky, zastupovanie.",
            "Súhlas so spracovaním údajov pri každom objednaní.",
        ],
        "nots": [
            "Nenahrádza zdravotnícky informačný systém.",
            "Nevedie zdravotnú dokumentáciu ani recepty.",
            "Neposiela dávky do poisťovne.",
            "Neprijíma platby. Platí sa v ambulancii.",
        ],
        "faq": [
            {"q": "Starší pacienti sa online neobjednajú.",
             "a": "Väčšina nie. Preto sestra termín zapíše v kalendári za pätnásť sekúnd a vyzerá rovnako ako ten online. Systém nemá nahradiť telefón, má znížiť počet hovorov."},
            {"q": "Čo osobné údaje pacientov?",
             "a": "Pri objednaní sa vyžaduje súhlas so spracovaním a systém vedie históriu zmien. Ukladá meno, kontakt a dôvod návštevy. Zdravotnú dokumentáciu nie."},
            {"q": "Musí sa to napojiť na náš ambulantný softvér?",
             "a": "Nemusí a samo sa nenapája. Je to samostatný objednávkový kalendár. Ak prepojenie potrebujete, povedzte na akom systéme ste a poviem, či sa to dá."},
            {"q": "Čo keď pacient nepríde?",
             "a": "Deň vopred mu príde pripomienka. Kto neprišiel, má to zaznamenané v karte, takže viete, komu už termín radšej nedržať."},
            {"q": "Komu patria dáta?",
             "a": "Vám. Kedykoľvek si ich vyexportujete do tabuľky. Ak sa raz rozhodneme skončiť, dostanete ich a nemusíte o ne prosiť."},
        ],
        "author": [
            "Robím weby s rezervačným systémom. Sám, od návrhu po nasadenie, takže sa nemáte s kým doťahovať o to, kto to má opraviť.",
            "Prvý som postavil malej prevádzke v Nitre. Odvetvie bolo iné, problém rovnaký: telefón zvonil vtedy, keď sa nedalo zdvihnúť.",
            "Nerobím to pre nemocnice. Robím to pre ambulancie, kde sú dvaja alebo traja ľudia. A ak objednávate päť pacientov denne, nekupujte si to.",
        ],
        "price": [
            'Za <b>web a objednávací systém sa platí raz</b>. Cena závisí od toho, koľko vás je a koľko máte výkonov, a poviem vám ju po prvom hovore. Žiadne balíčky a žiadne funkcie zamknuté za vyšším programom.',
            "Potom 39 € mesačne. V tej sume je hosting, doména, zálohovanie, aktualizácie, odosielanie mailov a to, že keď niečo prestane fungovať, opravím to ja.",
        ],
        "end_h": "Chcete to vidieť na svojich výkonoch?",
        "end_p": "Napíšte mi, aká ste ambulancia a koľko vás je. Pošlem vám ukážku s vašimi výkonmi a ordinačnými hodinami.",
        "end_btn": "Napísať",
    },

    # --------------------------------------------------------
    {
        "out": "termino-vizaz.html",
        "title": "Termino pre vizáž",
        "key": "salon",
        "domain": "studio-vlna",

        "tenant": {
            "key": "salon", "color": "#8B4F6B",
            "name": "Štúdio Vlna", "kind": "Vizáž a kozmetika",
            "words": {
                "clientOne": "Klientka", "clientPl": "Klientky",
                "serviceOne": "Procedúra", "servicePl": "Procedúry", "serviceAcc": "procedúru",
                "staffOne": "Kto", "staffAcc": "kto ju spraví", "book": "Rezervácia",
            },
            "hours": {"1": None, "2": [600, 1200], "3": [600, 1200], "4": [600, 1200],
                      "5": [600, 1200], "6": [540, 900], "0": None},
            "hoursText": [["Pondelok", None], ["Utorok", "10:00 - 20:00"], ["Streda", "10:00 - 20:00"],
                          ["Štvrtok", "10:00 - 20:00"], ["Piatok", "10:00 - 20:00"],
                          ["Sobota", "09:00 - 15:00"], ["Nedeľa", None]],
            "step": 15,
            "services": [
                {"id": "v1", "name": "Denné líčenie", "dur": 60, "price": 45},
                {"id": "v2", "name": "Svadobné líčenie so skúškou", "dur": 120, "price": 130, "deposit": 30},
                {"id": "v3", "name": "Kozmetické ošetrenie pleti", "dur": 60, "price": 45},
                {"id": "v4", "name": "Úprava a laminácia obočia", "dur": 45, "price": 32},
                {"id": "v5", "name": "Mihalnice, nový set", "dur": 120, "price": 65, "deposit": 20},
            ],
            "staff": [
                {"id": "s1", "name": "Simona Gajdošová", "short": "Simona", "role": "Vizážistka",
                 "does": ["v1", "v2"]},
                {"id": "s2", "name": "Nela Krajčíová", "short": "Nela", "role": "Obočie a mihalnice",
                 "does": ["v4", "v5"]},
                {"id": "s3", "name": "Viktória Pásztorová", "short": "Viktória", "role": "Kozmetička",
                 "does": ["v3", "v4"]},
            ],
            "customers": ["Lucia Vargová", "Barbora Šulcová", "Natália Reháková", "Emma Polláková",
                          "Sofia Brezinová", "Hana Kubíková", "Diana Matejová", "Ema Salíniová"],
            "admin": {"name": "Simona Gajdošová", "role": "Majiteľka štúdia"},
        },

        "h1": "Termín si klientka vyberie <b>sama</b>.",
        "sub": "Web s rezervačným systémom pre vizážistky a kozmetické štúdiá. Postavím ho aj nasadím.",
        "h_now": "Ako to vyzerá teraz",
        "h_why": "Prečo to robím takto",
        "h_try": "Skúste si to",
        "quote": 'Instagram je na to, aby vás našli. Nie na to, aby ste v ňom <span>objednávali</span>.',
        "admin_p": "Rovnaký deň, ako ho vidíte vy. Kalendár po dievčatách, zoznam rezervácií, karty klientok, obsadenosť. Otvorí sa na celú obrazovku a dá sa preklikať.",

        "observations": [
            "<b>Objednávky chodia cez Instagram.</b> Medzi story, komentármi a správami sa jedna vždy stratí.",
            "Svadobné líčenie máte v sobotu o šiestej ráno. Kto to má v kalendári okrem vás?",
            "<b>Klientka si rezervuje mihalnice na dve hodiny a nepríde.</b> To je celé doobedie.",
            "Zálohu pýtate v správe a potom kontrolujete výpis z účtu.",
            "Termín na budúci mesiac si píšete do poznámok v telefóne.",
        ],
        "arguments": [
            {"t": "Dlhé procedúry majú pravidlá",
             "d": "Svadobné líčenie so skúškou trvá dve hodiny, obočie štyridsaťpäť minút. Systém to vie a neponúkne termín, ktorý sa do zatváracích hodín nezmestí ani sa neprekryje s ďalšou klientkou."},
            {"t": "O zálohe sa nemusíte baviť",
             "d": "Pri procedúrach nad deväťdesiat minút systém pri rezervácii rovno oznámi zálohu aj storno lehotu. Klientka to vidí skôr, než potvrdí, takže o peniazoch nepíšete v správach."},
            {"t": "Jeden kalendár namiesto troch telefónov",
             "d": "Vizáž, kozmetika, obočie. Tri rozvrhy, jedna obrazovka. Kto má v sobotu svadbu, kto má prestávku, kto má o jedenástej ošetrenie na hodinu."},
        ],
        "facts": [
            "Rezervácie aj o polnoci.",
            "Potvrdenie mailom hneď, pripomienka deň vopred.",
            "Záloha a storno lehota pri dlhých procedúrach.",
            "Každá vlastný rozvrh a vlastné procedúry.",
            "História návštev pri každej klientke.",
            "Export do tabuľky.",
        ],
        "nots": [
            "Nevyberá peniaze. Zálohu oznámi, prevod si riešite po svojom.",
            "Nie je to e-shop na kozmetiku.",
            "Nenapojí sa na registračnú pokladňu.",
            "Nie je to aplikácia z obchodu. Je to web, ktorý funguje aj v telefóne.",
        ],
        "faq": [
            {"q": "Klientky mi píšu na Instagrame.",
             "a": "Nech píšu. Do bia dáte odkaz na rezerváciu a kto chce písať, píše ďalej. Termín zo správy zapíšete v kalendári klikom. Ide o to, aby väčšina išla sama."},
            {"q": "Čo keď niekto nepríde na dvojhodinovú procedúru?",
             "a": "Deň vopred príde pripomienka. Pri dlhých procedúrach systém rovno pri rezervácii oznámi zálohu a storno lehotu, takže o podmienkach nediskutujete až po tom, čo sa to stane."},
            {"q": "Robím sama, oplatí sa mi to?",
             "a": "Ak máte plný diár a objednávate cez správy, oplatí. Ak máte dve klientky denne, nekupujte si to."},
            {"q": "Komu patria dáta?",
             "a": "Vám. Kedykoľvek si ich vyexportujete do tabuľky. Ak sa raz rozhodneme skončiť, dostanete ich a nemusíte o ne prosiť."},
            {"q": "Čo sa stane, keď prestanem platiť?",
             "a": "Web aj systém prestanú bežať a dáta vám vyexportujem. Žiadna viazanosť a žiadna výpoveď na mesiace dopredu."},
        ],
        "author": [
            "Robím weby s rezervačným systémom. Sám, od návrhu po nasadenie, takže sa nemáte s kým doťahovať o to, kto to má opraviť.",
            "Prvý som postavil malej prevádzke v Nitre. Odvetvie bolo iné, problém rovnaký: objednávalo sa cez správy a polovica sa strácala.",
            "Nerobím to pre reťazce. Robím to pre štúdiá, kde majiteľka aj pracuje. A ak máte dve klientky denne, nekupujte si to.",
        ],
        "price": [
            'Za <b>web a rezervačný systém sa platí raz</b>. Cena závisí od toho, koľko vás je a koľko máte procedúr, a poviem vám ju po prvom hovore. Žiadne balíčky a žiadne funkcie zamknuté za vyšším programom.',
            "Potom 39 € mesačne. V tej sume je hosting, doména, zálohovanie, aktualizácie, odosielanie mailov a to, že keď niečo prestane fungovať, opravím to ja.",
        ],
        "end_h": "Chcete to vidieť na svojich procedúrach?",
        "end_p": "Napíšte mi, čo robíte a koľko vás je. Pošlem vám ukážku s vaším cenníkom a vaším tímom.",
        "end_btn": "Napísať",
    },
]


# ============================================================
# Šablónovanie
# ============================================================

def cut(text, start, end, replacement=""):
    """Vyreže blok medzi dvoma značkami vrátane nich."""
    a = text.index(start)
    b = text.index(end, a) + len(end)
    return text[:a] + replacement + text[b:]


def once(text, old, new):
    assert text.count(old) == 1, f"očakával som jeden výskyt: {old[:70]!r}"
    return text.replace(old, new)


def js_list(items):
    return "[\n    " + ",\n    ".join(json.dumps(i, ensure_ascii=False) for i in items) + "\n  ]"


def render(seg):
    s = BASE

    # --- názov stránky ---
    s = once(s, "<title>Termino Rezervácie</title>", f"<title>{seg['title']}</title>")

    # --- sekcia s prepínačom odvetví nemá v jednosegmentovej stránke čo robiť ---
    s = cut(s,
            '  <section class="band band--paper band--tight">\n    <div class="wrap">\n      <h2 class="h-sec">Tri prevádzky, jeden systém</h2>',
            '</section>\n')
    s = cut(s, "  function renderVerticals() {", "\n  }\n")
    s = once(s, "    renderVerticals();\n", "")

    # --- prevádzka: v každej stránke je práve jedna ---
    tenant_js = "  var TENANTS = { " + json.dumps(seg["key"], ensure_ascii=False) + ": " \
                + json.dumps(seg["tenant"], ensure_ascii=False, indent=2).replace("\n", "\n  ") + " };\n\n"
    a = s.index("  var TENANTS = {")
    b = s.index("  var ORDER = [")
    s = s[:a] + tenant_js + s[b:]
    s = once(s, '  var ORDER = ["klinika", "barber", "salon"];',
             f'  var ORDER = [{json.dumps(seg["key"], ensure_ascii=False)}];')

    # --- výber prevádzky v admin paneli odpadá ---
    s = once(s,
             '      <label for="adTenant">Prevádzka</label>\n      <select id="adTenant"></select>',
             f'      <label>Prevádzka</label>\n      <div style="font-size:.9rem;font-weight:600">{seg["tenant"]["name"]}</div>')
    s = cut(s, '    var sel = $("#adTenant"); sel.innerHTML = "";', "      sel.appendChild(o);\n    });\n")
    s = once(s, '  $("#adTenant").addEventListener("change", function () { setTenant(this.value); });\n', "")

    # --- adresa v ukážke ---
    s = once(s,
             '    $("#bookUrl").textContent = ({ klinika: "ambulancia-jasen", barber: "barbershop-kotva", salon: "studio-vlna" })[key] + ".sk/rezervacia";',
             f'    $("#bookUrl").textContent = "{seg["domain"]}.sk/rezervacia";')
    s = once(s, '  setTenant("klinika");', f'  setTenant({json.dumps(seg["key"], ensure_ascii=False)});')

    # --- farba stránky: jeden akcent, farba odvetvia ---
    a = ACCENTS[seg["key"]]
    s = once(s, """  --acc:         #0E6E63;
  --acc-deep:    #0A5049;
  --acc-soft:    #E2F0EE;
  --acc-line:    #B2D8D2;
  --on-acc:      #FFFFFF;""",
             f"""  --acc:         {a[0]};
  --acc-deep:    {a[1]};
  --acc-soft:    {a[2]};
  --acc-line:    {a[3]};
  --on-acc:      {a[4]};""")
    dark_old = "--acc: #46C4B2; --acc-deep: #6FD8C8; --acc-soft: #10302C; --acc-line: #1C4A44; --on-acc: #06201C;"
    assert s.count(dark_old) == 2
    s = s.replace(dark_old,
                  f"--acc: {a[5]}; --acc-deep: {a[6]}; --acc-soft: {a[7]}; --acc-line: {a[8]}; --on-acc: {a[9]};")

    # --- texty ---
    s = once(s, "<h1>Klient si termín vyberie <b>sám</b>.</h1>", f"<h1>{seg['h1']}</h1>")
    s = once(s,
             '<p class="hero__sub">Web s rezervačným systémom pre ambulancie, barbershopy a salóny. Postavím ho aj nasadím.</p>',
             f'<p class="hero__sub">{seg["sub"]}</p>')
    s = once(s, '<h2 class="h-sec h-sec--wide">Ako to vyzerá teraz</h2>',
             f'<h2 class="h-sec h-sec--wide">{seg["h_now"]}</h2>')
    s = once(s, '<h2 class="h-sec">Prečo to robím takto</h2>', f'<h2 class="h-sec">{seg["h_why"]}</h2>')
    s = once(s, '<h2 class="h-sec">Skúste si to</h2>', f'<h2 class="h-sec">{seg["h_try"]}</h2>')
    s = once(s,
             "<p>Rezervačný systém nie je o technológii. Je o tom, aby <span>telefón prestal zvoniť</span>.</p>",
             f"<p>{seg['quote']}</p>")
    s = once(s,
             '<p class="measure" style="margin-bottom:22px">Rovnaký deň, ako ho vidí obsluha. Kalendár po zamestnancoch, tabuľka rezervácií, karty klientov, štatistiky. Otvorí sa na celú obrazovku a dá sa preklikať.</p>',
             f'<p class="measure" style="margin-bottom:22px">{seg["admin_p"]}</p>')

    # --- autor ---
    a = s.index('        <p>Robím weby s rezervačným systémom.')
    b = s.index("</p>\n      </div>\n      <div class=\"sig\">") + len("</p>\n")
    s = s[:a] + "".join(f"        <p>{p}</p>\n" for p in seg["author"]) + s[b:]
    s = once(s, '<b id="authorName">Andrej Micek</b>', f'<b id="authorName">{AUTHOR}</b>')

    # --- cena ---
    a = s.index('          <p>Za <b>web a rezervačný systém sa platí raz</b>')
    b = s.index("opravím to ja.</p>\n") + len("opravím to ja.</p>\n")
    s = s[:a] + "".join(f"          <p>{p}</p>\n" for p in seg["price"]) + s[b:]

    # --- záver ---
    s = once(s, "<h2>Chcete to vidieť na svojich úkonoch?</h2>", f"<h2>{seg['end_h']}</h2>")
    s = once(s,
             "<p>Napíšte mi, čo robíte a koľko vás je. Pošlem vám ukážku s vaším cenníkom a vaším tímom.</p>",
             f"<p>{seg['end_p']}</p>")
    s = once(s, '>Napísať</a>', f'>{seg["end_btn"]}</a>')

    # --- polia s obsahom ---
    for name, items in (("OBSERVATIONS", seg["observations"]),
                        ("FACTS", seg["facts"]),
                        ("NOTS", seg["nots"])):
        a = s.index(f"  var {name} = [")
        b = s.index("\n  ];\n", a) + len("\n  ];\n")
        s = s[:a] + f"  var {name} = " + js_list(items) + ";\n" + s[b:]

    for name, items in (("ARGUMENTS", seg["arguments"]), ("FAQ", seg["faq"])):
        a = s.index(f"  var {name} = [")
        b = s.index("\n  ];\n", a) + len("\n  ];\n")
        s = s[:a] + f"  var {name} = " + js_list(items) + ";\n" + s[b:]

    return s


def main():
    for seg in SEGMENTS:
        out = HERE / seg["out"]
        html = render(seg)
        out.write_text(html, encoding="utf-8")
        leftovers = [w for w in ("adTenant", "renderVerticals", "vertBar", "Tri prevádzky") if w in html]
        assert not leftovers, f"{seg['out']}: zvyšky {leftovers}"
        for ch in ("—", "–"):
            body = re.sub(r"<style>.*?</style>|<script.*?</script>", "", html, flags=re.S)
            assert ch not in body, f"{seg['out']}: dlhá pomlčka v texte"
        print(f"{seg['out']:32} {len(html):>7} B")


if __name__ == "__main__":
    main()
