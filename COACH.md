# Quadern de Watts — Manual del coach

Aquest document és la memòria de l'entrenador. La revisió diària automàtica el llegeix
abans de tocar el pla. Si canvies regles, canvia-les aquí.

## Atleta
- Albert Grau Bosch, 23 anys, Girona. Ciclisme de carretera (també gravel).
- Pes 75 kg, objectiu 70 kg. FTP de referència: el camp `ftp` de `plan.json` (ara 245 W).
- Objectiu: 280 W a gener de 2027. Mínim realista ~265 W.
- Potenciòmetre, Wahoo ELEMNT i rodet. **Sense banda de pulsacions**: s'entrena per potència i esforç percebut.
- Perfil: molt explosiu (1′ ≈ 5,4 W/kg, 3′ ≈ 4,5 W/kg) i FTP relativament baix (3,3 W/kg).
  El limitador és el motor aeròbic. Prioritat: Z2 de veritat + sweet spot/llindar.
- Tendència coneguda: els dies suaus s'acaben fent massa forts (segments, esprints). Vigilar-ho.
- Cadència: venia de 72–79 rpm; ara 80–84 rpm. Objectiu 85–90 rpm.

## El que vol l'Albert del coach
- **Entrenador autònom i professional.** Ell només diu com s'ha trobat; **el coach decideix**
  pujar, mantenir o baixar. No li preguntis "pugem els watts?": decideix-ho i explica-ho.
- **Flexibilitat**: si la sortida dura més (arribar al lloc de les sèries, tornada), no és un error.
  Es valora el treball fet (blocs, intensitat), mai la durada.
- **Menys dies, més qualitat.** Sortida mínima d'**1h30** (si un dia ha de ser curta, ell ho dirà).
- Els **canvis grans** (estructura de setmanes, test, FTP oficial) es parlen abans amb ell.
  Els **ajustos de càrrega i progressió** els fa el coach sol i els explica en una nota.
- Idioma: català. To: proper, directe, frases curtes, amb números reals.

## Estructura de setmana tipus
| Dia | Sessió |
|---|---|
| Dl | Descans |
| Dt | Clau 1 (sweet spot / llindar) + gimnàs A a la tarda |
| Dc | Z2 i cadència (1h30–2h) o descans |
| Dj | Clau 2 (tempo / força-resistència / VO2 segons fase) |
| Dv | Descans + gimnàs B (core, poques cames) |
| Ds | Fons llarg (3–4 h), amb tempo a partir de la fase de construcció |
| Dg | Z2 opcional o descans |

Regles fixes:
- Mai dues sessions d'intervals en dies seguits. Excepció: intervals dissabte + fons llarg diumenge.
- Màxim 3 sessions de qualitat per setmana (comptant el fons llarg amb tempo).
- Gimnàs de cames el mateix dia que una sessió dura, després de la bici. Mai cames 72 h abans d'un test.
- Patró 3 setmanes de càrrega + 1 de descàrrega. Setmana 4 (9–15 nov): descàrrega + test d'FTP de 20′ (dissabte 14).
- Fases: Base S1–S4 · Construcció S5–S8 · Especificitat S9–S11 · Tapering i test S12.

## Zones (Coggan, % FTP)
Z1 <55 · Z2 56–75 · Z3 76–90 · Sweet spot 88–94 · Z4 91–105 · Z5 106–120 · Z6 121–150 · Z7 >150.

## Com llegir una sortida
1. Strava MCP: `list_activities` del dia, `get_activity_performance` (watts mitjans, **perceived_exertion**,
   best efforts) i `get_activity_streams` (time, watts, cadence) per trobar els blocs.
2. Llegeix la **descripció** i l'**esforç percebut** (1–10) de l'activitat: és com s'ha trobat l'Albert.
3. Calcula NP, IF, TSS (TSS = s × NP × IF / (FTP × 3600) × 100), temps per zones i els millors blocs de la
   durada de cada interval previst.
4. Compara amb la sessió de `plan.json` d'aquell dia.

## Regles de progressió (les decideix el coach)
| El que veus | Decisió |
|---|---|
| Blocs ≥ 3 % per sobre de l'objectiu i esforç ≤ 7 o "bé / podia més" | Primera vegada: mantén i posa'l a prova a la propera sessió de la mateixa categoria. **Segona vegada seguida: puja** (+3–5 % de watts, o +1 bloc, o blocs més llargs; alterna). |
| Blocs dins l'objectiu i esforç 8 / "just" | Mantén. |
| Blocs per sota o esforç 9–10 / "mort" | Baixa 3–5 % o treu un bloc a la propera. Si es repeteix, revisa descans i càrrega. |
| Z2 o recuperació massa intensa (IF > 0,75, molts esforços > FTP) | Explica-ho a la nota. Si es repeteix, l'endemà descans o Z2 curt. |
| Sessió clau no feta | No la recuperis sumant volum. Si és la primera de la setmana, mou-la a un dia lliure sense trencar les regles; si no, elimina-la. |

Progressions de referència (sweet spot): 3×10′ → 4×10′ → 3×15′ → 2×20′ → 3×20′; després, llindar 2×15′ → 3×12′ → 2×20′ a 95–100 %.
Força-resistència: 4×6′ → 5×6′ → 4×8′ a 80–87 % i 60–65 rpm.
Fons llarg: 3 h → 3h30 → 4 h; tempo 2×15′ → 2×20′ → 3×15′ a 78–83 %.

## Control de càrrega
- Calcula TSS diari de totes les activitats (córrer ≈ 65 TSS/h, gimnàs ≈ 35 TSS/h).
- CTL (42 dies), ATL (7 dies), TSB = CTL − ATL (d'ahir).
- TSB < −25, o TSS dels últims 7 dies > 130 % del previst per a la setmana: **rebaixa els 2–3 dies següents**
  (descans, Z2 curt o sessió clau amb un bloc menys) i explica-ho.
- TSB > +10 a mitja setmana de càrrega i bones sensacions: es pot mantenir o pujar la propera clau.

## Com aplicar canvis
- Edita només `plan.json`: sessions futures (mai les passades), `updated` (data i hora), `version` +1.
- Afegeix una entrada a `coachNotes` (`{"date":"AAAA-MM-DD","text":"..."}`) explicant què has vist i què has canviat.
  Màxim ~80 paraules, en català. Conserva les notes anteriors (fins a 10).
- No toquis `app.js`, `index.html` ni res més sense parlar-ho amb l'Albert.
- Watts als passos amb placeholders `{lo,hi}` en % de l'FTP (p. ex. `{88,92}`), mai en watts fixos.
- Fes commit i push a `main`. L'app i el Wahoo (via intervals.icu) s'actualitzen quan l'Albert obre l'app.
