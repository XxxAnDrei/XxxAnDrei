# ECC — návod na používanie

Stav po inštalácii v tomto repe. Zdroj: [affaan-m/ECC](https://github.com/affaan-m/ECC) v2.2.1, MIT.

---

## 1. Čo je nainštalované a čo nie

Toto je najdôležitejšia vec v celom návode, lebo sa z nej odvíja všetko ostatné.

**Máš nainštalované:** 287 markdown skillov z ECC (286 z `skills/` + jeden generovaný
`everything-claude-code`). Spolu s predošlými 14 dizajnovými skillmi je v repe **301 skillov**.
Ležia v `.claude/skills/<meno>/`, evidované v `skills-lock.json`.

**Nemáš nainštalované** — a `skills add` ti to nikdy nedonesie:

| Komponent ECC | Počet | Čo robí | Ako to získať |
|---|---|---|---|
| Agenti | 68 | Subagenti s vlastným kontextom: `planner`, `code-reviewer`, `security-reviewer`, `build-error-resolver`, 20+ jazykových reviewerov | plugin install |
| Commandy | 94 | Slash príkazy `/plan`, `/code-review`, `/build-fix`, `/test-coverage`… | plugin install |
| Hooky | ~23 skriptov | Automatika na SessionStart/Stop/PreToolUse — blokovanie príkazov, formátovanie, učenie | plugin install alebo `install.sh` |
| Rules | 7 balíkov | Vždy-načítané štandardy podľa jazyka | ručné kopírovanie (plugin ich nevie distribuovať) |

Skilly sú **pasívna znalosť**. Agenti, hooky a rules sú **aktívne správanie**. Máš prvé, nemáš druhé.
Časť 5 hovorí, ako doinštalovať zvyšok, ak to chceš.

### Cena, ktorú platíš

Mená + popisy 301 skillov = **~21 400 tokenov trvalého kontextu v každej session**. To je zhruba
10 % okna, minuté skôr, než niečo napíšeš. Prejavuje sa to dvoma spôsobmi:

1. Menej priestoru na skutočnú prácu, hlavne pri dlhých session.
2. Claude si musí vybrať jeden skill z 301 kandidátov. Pri 15 skilloch trafí správny takmer vždy;
   pri 301 sa presnosť výberu zhoršuje a začne ťahať susedné, nesprávne skilly.

Ak to začne prekážať, časť 6 hovorí, ako to orezať bez straty repa.

---

## 2. Denná slučka

ECC nie je zbierka trikov, je to jeden proces:

```
plan → test → implement → review → verify → remember → improve
```

Bez pluginu (teda tvoj súčasný stav) sa slučka vyvoláva menom skillu:

| Fáza | Čo povedať | Čo sa stane |
|---|---|---|
| Plánuj | „použi skill `blueprint` na …" | rozloží úlohu na kroky s vlastným kontextom |
| Testuj prvý | „použi `tdd-workflow`" | vynúti RED → GREEN → REFACTOR, cieľ 80 % pokrytia |
| Over | „použi `verification-loop`" | kontrolný cyklus pred tvrdením „hotovo" |
| Zrecenzuj | „použi `security-review`" | OWASP checklist na auth, vstupy, secrets |
| Zmeraj | „použi `eval-harness`" | eval namiesto dojmu |
| Zapamätaj | „použi `unified-memory`" | handoff medzi session a harnessmi |

S pluginom je to `/plan`, `/code-review`, `/build-fix` — kratšie a spoľahlivejšie, lebo command
explicitne deleguje na agenta.

### Prvá vec, ktorú spusti

```
použi skill workspace-surface-audit
```

Zauditovaní tvoj repo, MCP servery, pluginy a env, a povie, ktoré z 301 skillov ti tu reálne
dávajú zmysel. Je to jediný rozumný vstup do katalógu tejto veľkosti.

Druhá: `ecc-guide` — meta-skill, ktorý číta živý ECC repozitár a odpovedá na „ako v ECC spravím X".
Ale funguje naplno len keď máš ECC repo naklonované lokálne.

---

## 3. Mapa kategórií (301 skillov)

Nemá zmysel poznať všetky. Tu je delenie a v každej kategórii to, čo naozaj používaj.

### Jadro workflow (20)
`tdd-workflow` · `verification-loop` · `eval-harness` · `search-first` · `blueprint` · `plan-canvas` ·
`code-tour` · `codebase-onboarding` · `repo-scan` · `council` · `dev-team` · `santa-method` ·
`delivery-gate` · `production-audit` · `contract-first` · `agent-sort` · `plan-orchestrate` ·
`intent-driven-development` · `quality-nonconformance` · `council-multi-model`

Začni s `tdd-workflow`, `verification-loop`, `search-first`. To sú tri, ktoré menia výsledok najviac.
`search-first` je podceňovaný: núti hľadať existujúce riešenie skôr, než začneš písať vlastné.

### Kontext, pamäť, učenie (17)
`context-budget` · `token-budget-advisor` · `strategic-compact` · `continuous-learning-v2` ·
`unified-memory` · `ck` · `config-gc` · `cost-tracking` · `architecture-decision-records` ·
`knowledge-ops` · `iterative-retrieval` · `growth-log` · `living-docs-governance` ·
`recursive-decision-ledger` · `rules-distill` · `hookify-rules` · `continuous-learning` *(deprecated)*

**Toto je tvoja kategória po tejto inštalácii.** `context-budget` ti povie, čo presne žerie okno.
`config-gc` prejde `.claude` a navrhne, čo vyhodiť. `continuous-learning` nepoužívaj — v2 je nadmnožina.

### Bezpečnosť (14)
`security-review` · `security-scan` · `gateguard` · `safety-guard` · `security-bounty-hunter` ·
`hipaa-compliance` · `defi-amm-security` · `llm-trading-agent-security` · plus jazykové varianty
(`django-security`, `laravel-security`, `springboot-security`, `quarkus-security`, `perl-security`,
`healthcare-phi-compliance`)

`security-review` je checklist, `security-scan` volá AgentShield na tvoju vlastnú agent konfiguráciu
(hooky, MCP, permissions, secrets). Druhé menované je užitočné aj bez ECC:

```bash
npx -y ecc-agentshield scan --path .
```

### Jazyky a frameworky (66)
Vzor je konzistentný: `<jazyk>-patterns`, `<jazyk>-testing`, `<framework>-tdd`, `<framework>-security`,
`<framework>-verification`. Pokryté: Python, Go, Rust, Kotlin, Java (Spring Boot + Quarkus), C++, C#/.NET,
F#, Perl, Dart/Flutter, Swift, PHP/Laravel, Django, FastAPI, React, Vue, Nuxt, NestJS, Angular,
React Native, Compose Multiplatform, Postgres, MySQL, Redis, Prisma, JPA, Kubernetes, Docker.

Vyvolávaj podľa stacku, nie podľa zoznamu.

### Agenti, LLM, ML (31)
`agent-architecture-audit` · `agent-eval` · `agent-harness-construction` · `agent-self-evaluation` ·
`prompt-optimizer` · `cost-aware-llm-pipeline` · `mle-workflow` · `continuous-agent-loop` ·
`mcp-server-patterns` · `team-builder` · `dmux-workflows` · `orch-*` (6 orchestračných) ·
`autonomous-agent-harness` · `agentic-os` · `parallel-execution-optimizer` a ďalšie

Ak staviaš čokoľvek agentické, `agent-architecture-audit` je najlepší vstup — diagnostikuje 12-vrstvový
stack a nájde, ktorá vrstva zlyháva.

### Frontend, dizajn, motion (17 + tvojich 14)
ECC prináša `design-system`, `accessibility`, `frontend-a11y`, `motion-foundations/-advanced/-ui`,
`make-interfaces-feel-better`, `taste`, `liquid-glass-design`, `react-performance`, `ui-to-vue`.

Pozor — **prekrývajú sa s tvojimi existujúcimi 14** (`impeccable`, `design-taste-frontend`,
`high-end-visual-design`, `minimalist-ui`, `brandkit`…). Máš teraz dve nezávislé dizajnové školy
v jednom repe. Pri dizajnovej úlohe povedz explicitne, ktorú chceš, inak Claude vyberie
nepredvídateľne.

### Dáta, DB, infra (19)
`clickhouse-io` · `database-migrations` · `benchmark` (+ `-methodology`, `-optimization-loop`) ·
`canary-watch` · `dashboard-builder` · `data-throughput-accelerator` · `flox-environments` ·
`uncloud` · 5× `homelab-*` · 4× `network-*` · `netmiko-ssh-automation`

### Biznis, obsah, ops (32)
`article-writing` · `brand-voice` · `brand-discovery` · `content-engine` · `deep-research` ·
`market-research` · `investor-materials` · `investor-outreach` · `seo` · `crosspost` ·
`social-publisher` · `github-ops` · `jira-integration` · `google-workspace-ops` · `email-ops` ·
`competitive-platform-analysis` → `benchmark-methodology` → `competitive-report-structure` (reťazec)

### Doména (16)
Zdravotníctvo, logistika, colné predpisy, energetika, výroba, veda (PubMed, USPTO, gget,
literature-review), prediction markets, EVM/blockchain, preklad víz. Toto sú hotové expertné
playbooky — buď ich potrebuješ, alebo o nich nikdy nebudeš vedieť.

### ECC-špecifické a nástroje (53)
`configure-ecc` · `ecc-guide` · `ecc-recipes` · `skill-scout` · `skill-stocktake` · `skill-comply` ·
`workspace-surface-audit` · `videodb` · `video-editing` · `remotion-video-creation` · `manim-video` ·
`fal-ai-media` · `exa-search` · `documentation-lookup` · `browser-qa` · `terminal-ops` ·
`ito-*` (4, compute sponzor) · `nasiko-control-plane` a ďalšie

`documentation-lookup` (cez Context7 MCP) je prakticky užitočný hneď — ťahá aktuálne docs namiesto
tréningových dát.

---

## 4. Skilly, ktoré spúšťajú kód

16 z nainštalovaných skillov nesie pomocné skripty, nielen markdown:

| Skill | Skriptov |
|---|---|
| `skill-comply` | 13 |
| `continuous-learning-v2` | 9 |
| `ck` | 9 |
| `skill-stocktake` | 3 |
| `rules-distill`, `openclaw-persona-forge`, `frontend-slides` | 2 |
| `videodb`, `terminal-opener`, `manim-video`, `ito-baskets`, `ios-icon-gen`, `delivery-gate`, `council-multi-model`, `continuous-learning`, `agent-self-evaluation` | 1 |

Spúšťajú sa **len keď skill vyvoláš** — nič nebeží na pozadí. Ale bežia s plnými oprávneniami agenta.
Ak niektorý z nich použiješ prvý raz, prečítaj si najprv jeho `SKILL.md` a skripty:

```bash
cat .claude/skills/ck/SKILL.md
ls -la .claude/skills/ck/
```

---

## 5. Plná inštalácia ECC (agenti + hooky + commandy + rules)

Ak chceš aj to aktívne správanie. **Vyber jednu cestu a nemiešaj ich** — dvojitá inštalácia
duplikuje skilly a hooky vystrelia dvakrát.

### Cesta A — natívny plugin (odporúčaná)

Vo vnútri Claude Code:

```text
/plugin marketplace add https://github.com/affaan-m/ECC
/plugin install ecc@ecc
```

Alebo deklaratívne v `~/.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "ecc": { "source": { "source": "github", "repo": "affaan-m/ECC" } }
  },
  "enabledPlugins": { "ecc@ecc": true }
}
```

Po inštalácii sú commandy namespacované: `/ecc:plan`, `/ecc:code-review`.

### Cesta B — sprievodca z terminálu

```bash
npx ecc-universal setup
```

Vyžaduje Node 18+, Git, Claude Code 2.1+. Vie inštalovať, aktualizovať, meniť scope a hook profil.
Pozor na názvy — nie sú zameniteľné: repo `affaan-m/ECC`, plugin `ecc@ecc`, npm `ecc-universal`.

### Cesta C — selektívna inštalácia bez hookov

Ak nechceš, aby ti niečo behalo na pozadí:

```bash
git clone https://github.com/affaan-m/ECC.git && cd ECC
./install.sh --profile minimal --target claude     # bez hook runtime
./install.sh --profile core --no-hooks --target claude
```

Alebo len konkrétne časti:

```bash
./install.sh --target claude --skills tdd-workflow,security-review
node scripts/ecc.js consult "security reviews" --target claude   # poradca: čo sa mi hodí
```

### Rules (plugin ich nevie doniesť)

```bash
mkdir -p ~/.claude/rules/ecc
cp -R rules/common ~/.claude/rules/ecc/
cp -R rules/typescript ~/.claude/rules/ecc/    # vymeň za svoj stack
```

Balíky: `common`, `typescript`, `python`, `golang`, `swift`, `php`, `arkts`.
Ber `common` + jeden jazyk. Rules sú vždy-načítané, takže každý balík navyše stojí kontext.

---

## 6. Hooky — čo robia a ako ich udržať na uzde

Hooky sú jediná časť ECC, ktorá **spúšťa kód bez toho, aby si o to požiadal**. Preto ich inštalácia
vyžaduje explicitné `--enable-hooks` alebo `--no-hooks`; bez toho sa inštalátor zastaví.

Čo reálne robia:

| Event | Príklad správania | Blokuje? |
|---|---|---|
| `PreToolUse` (Bash) | GateGuard zastaví deštruktívne príkazy (`rm`, force `git checkout`, `find -exec`) | áno, exit 2 |
| `PreToolUse` (Bash) | blokuje `npm run dev` mimo tmux; pripomína review pred `git push` | áno / varovanie |
| `PreToolUse` (Bash) | pre-commit kontrola: lint staged, formát commit správy, hľadá console.log a secrets | áno pri kritickom |
| `PostToolUse` (Edit/Write) | auto-format, typecheck, quality gate, design-quality varovanie | nie |
| `SessionStart` | načíta kontext projektu + naučené „instinkty" | nie |
| `Stop` | vyhodnotí session, extrahuje vzory, formát/typecheck | nie |
| `PreCompact` | uloží stav pred kompakciou | nie |

Runtime prepínače (žiadna reinštalácia):

```bash
export ECC_HOOK_PROFILE=standard            # minimal | standard | strict
export ECC_DISABLED_HOOKS="pre:bash:tmux-reminder,post:edit:typecheck"
export ECC_SESSION_START_CONTEXT=off        # pre nízko-kontextové setupy
export ECC_SESSION_START_MAX_CHARS=4000
export ECC_MAX_INJECTED_INSTINCTS=6
export ECC_CONTEXT_MONITOR_COST_WARNINGS=off
```

**Nikdy nekopíruj `hooks/hooks.json` do `~/.claude/settings.json`** po plugin inštalácii. Claude Code
načíta plugin hooky sám a druhá kópia spôsobí, že vystrelia dvakrát.

---

## 7. Ako to orezať, keď 301 skillov začne prekážať

V poradí od najmenej deštruktívneho:

**1. Zisti, čo to stojí.**
```
použi skill context-budget
```

**2. Nechaj si navrhnúť čistku.**
```
použi skill config-gc
```
Prejde `.claude`, nájde redundantné a nepoužívané, a pýta sa na každé zmazanie zvlášť.

**3. Odstráň konkrétne skilly.**
```bash
npx skills remove <meno> [<meno>...]
```

**4. Vráť sa ku kurátorovanému jadru.** Ak chceš reset na ~25 skillov, ktoré pokryjú 90 % práce:
```bash
npx skills remove <všetko okrem jadra>
```
Jadro, ktoré by som nechal: `tdd-workflow`, `verification-loop`, `eval-harness`, `search-first`,
`security-review`, `security-scan`, `context-budget`, `blueprint`, `code-tour`, `codebase-onboarding`,
`repo-scan`, `unified-memory`, `continuous-learning-v2`, `documentation-lookup`, `deep-research`,
`git-workflow`, `error-handling`, `api-design`, `database-migrations`, `deployment-patterns`,
`docker-patterns`, `e2e-testing`, `ecc-guide`, `workspace-surface-audit`, + patterns/testing pre
tvoj konkrétny stack.

**5. Úplný návrat.** Všetko je v gite:
```bash
git revert d90b8fa        # commit s ECC skillmi
```

**6. Obnova z lock súboru** (napr. na inom stroji):
```bash
npx skills experimental_install
```

---

## 8. Aktualizácia

```bash
npx skills update                    # všetky skilly na najnovšie
npx skills update tdd-workflow       # jeden konkrétny
```

`skills-lock.json` drží hash obsahu každého skillu, takže update vidí, čo sa reálne zmenilo.
ECC vydáva týždenne — očakávaj časté zmeny v katalógu.

Pre plugin inštaláciu:
```bash
node scripts/ecc.js doctor      # diagnostika
node scripts/ecc.js repair      # oprava ECC-vlastnených súborov
node scripts/ecc.js status --json
node scripts/ecc.js list-installed
```

---

## 9. Keď niečo nefunguje

| Príznak | Príčina | Riešenie |
|---|---|---|
| Skilly sa objavujú dvakrát | dve inštalačné cesty naraz | `node scripts/ecc.js list-installed`, potom `uninstall` tej nesprávnej |
| Hooky vystrelia dvakrát | `hooks.json` skopírovaný do settings po plugin inštalácii | odstráň ručnú kópiu zo `settings.json` |
| Claude ťahá nesprávny skill | 301 kandidátov, popisy sa prekrývajú | vyvolaj menom explicitne, alebo orež katalóg (časť 7) |
| Kontext sa plní príliš rýchlo | ~21k tokenov v popisoch skillov + rules + MCP | `context-budget`, potom vypni nepoužívané MCP cez `/mcp` |
| Agent sa nenašiel | agenti nie sú v skill inštalácii | plugin install (časť 5) |
| Inštalátor sa zastaví pred zápisom | chýba rozhodnutie o hookoch | pridaj `--enable-hooks` alebo `--no-hooks` |

Podrobnosti: [TROUBLESHOOTING.md](https://github.com/affaan-m/ECC/blob/main/TROUBLESHOOTING.md) v ECC repe.

---

## 10. Poznámka o layoute v tomto repe

Máš teraz dva vzory vedľa seba:

- **Starých 14** (`impeccable`, taste-skills): `.agents/skills/<meno>/` + symlink z `.claude/skills/`
- **Nových 287** (ECC): priamo `.claude/skills/<meno>/` ako reálne adresáre

Obidva Claude Code nájde a `skills-lock.json` eviduje oba. Nezjednocoval som to zámerne — layout
vybral `skills` CLI a manuálny presun by mohol rozbiť budúci `skills update`, ktorý počíta hashe
proti zaznamenanej ceste.

---

## Referencie

- Repozitár: <https://github.com/affaan-m/ECC> · Web: <https://ecc.tools>
- Inštaluj len z oficiálnych zdrojov: GitHub repo, npm `ecc-universal` / `ecc-agentshield`,
  plugin `ecc@ecc`, GitHub App `ecc-tools`. Mirrory nie sú kontrolované.
- Kľúčové dokumenty v repe: `README.md` (inštalácia), `COMMANDS-QUICK-REF.md` (94 commandov),
  `hooks/README.md` (správanie hookov), `the-security-guide.md`, `docs/SKILL-DEVELOPMENT-GUIDE.md`
- Bezpečnostný sken vlastnej konfigurácie: `npx -y ecc-agentshield scan --path .`
