# BRIEF — LOT 1 `/chat` : la coquille

> `Chat.tsx` (2 726 l.) · `chat-surface.ts` (83 l.). **Verrou dominant** : 12 des 18 lots du corpus
> `/chat` montent ce fichier. Cadré le 14/09/2026 par un éclaireur, contre `origin/main` = `898367181`.

**Décompte : 65** = 12 (#1906) + 20 (#1907) + 11 (#1912) + 20 (#1944) + 1 (#1994) + 1 (#2001), par
les `points≈` du digest (`rc=0`).
⚠️ **Le décompte de l'éclaireur diffère : 72.** Méthode — les bilans de Louis eux-mêmes : commentaire
#1912 du 12/09 = 1 vérifié + 10 déjà là + 1 écarté + 2 ouverts = **14** (et le code cite déjà
`#1912.13`, donc ≥ 13) ; commentaire #1944 du 12/09 = 1 + 5 + 1 + 17 = **24**. 12+20+14+24+1+1 = 72.
**Les deux chiffres sont sourcés.** On livre sur 65, on signale 72.

## 1. Les quatre listes

**HORS LOT — déjà livré, `fichier:ligne` prouvé (17)**
#1906.7 (`chat-surface.ts:56-61` + `Chat.tsx:1544`) · #1906.8/.9 (`chat-surface.ts:50-54`,
`Chat.tsx:1915`) · #1907.5/.10/.13 (`chat-surface.ts:34-48`) · #1907.11 (`Chat.tsx:1632,1763,2231,2247`) ·
#1907.14-.18 (`chat-surface.ts:28`, gardé GA-328) · #1912.9 (`Chat.tsx:2080`) · #1912.10 ·
#1912.11 (`Chat.tsx:2026-2030`) · #1912.13 (`ComposerLauncher.tsx:137`) · #1944.4 (`Chat.tsx:1540`) ·
#1944.18 (`Chat.tsx:1347`).

**HORS LOT — autres fichiers (≈11)** · #1906.1 rail gauche → lot 7 · #1906.3 rail droit → lots 5/9 ·
#1907 jetons d'identité → `tokens.css` · #1944 performance (historique progressif, streaming, réseau
lent) → hooks/API · #1912 coût → `ComposerLauncher.tsx`.

**REFORMULÉ (4)**

- **#2001** « centrés » → **FAUX sur la bulle** (`Chat.tsx:1766` fait déjà `justify-start`), **VRAI
  sur** `chat-surface.ts:61` `mx-auto w-full max-w-3xl`, appelé `Chat.tsx:1655` et `:1709`.
  **Mesuré** : 768 px à `text-sm` ≈ **105-110 caractères** → `max-w-3xl` n'est **pas** une borne de
  lecture D81, c'est un **centrage subi**. La vraie borne de lecture est `max-w-[min(680px,92%)]`
  (`Chat.tsx:1768` **et** `:2236`) ≈ **93-97 ch**, écrite **en px** et **deux fois** → triple
  infraction D81 / GA-34 / GA-26. Geste : sortir `mx-auto` de `column`, poser la borne en `ch` dans
  **un seul** jeton.
- **#1994** « tout sur une ligne » → VRAI (`Chat.tsx:1991` `flex-wrap justify-between`, `:2044`
  `order-first w-full … md:w-auto`, `:1988` `rows={2}`, `:1989` `min-h-12`) ; reformulé en 3 gestes
  chiffrés (hauteur gagnée en px), **sans** supprimer `order-first` sous 768 px (voir antériorité 6).
- **#1906.5/.6/.7/.8** « réduire » → reformulés en **mesures** (px de gouttière, nombre de cadres
  imbriqués), pas en jugement.
- **#1907 « avatar visible mais discret »** → déjà tenu (`LauraFace` 32 px en-tête / 56 px accueil),
  reformulé en « ne rien ajouter ».

**RETENU (33)** — tout le reste de #1906 (.2, .4, .10-.12), #1907 (.1-.4, .6-.8, .12, .19-.20),
#1912 (.1-.3, .5-.8), #1944 (.1-.3, .5-.17, .19-.20 : clavier virtuel, zones sûres, cibles, focus
visible, ordre de tabulation, contraste, reduced motion, aucune info par la seule couleur).

**À TRANCHER PAR LOUIS (6)** — §3. *(17 + 11 + 4 + 33 = 65 ✓)*

## 2. Découpage de `Chat.tsx` — l'ordre d'écriture

| # | Zone | Lignes | Demandes |
|---|---|---|---|
| A | `chat-surface.ts` — 6 peaux + `column` | 32-62 | #2001, #2141, #1906.7-.9, #1907.13 |
| B | `MessagesArea` — colonne, état vide | 1571-1723 (**1645, 1655, 1709**) | #2001, #1906.4/.5, #1907.6 |
| C | `MessageBubble` + `OpenerBubble` | 1746-1849 (**1766, 1768**) · 2225-2243 (**2236**) | #2001, #1907.13 |
| D | `Composer` — cadre, textarea, rangée, envoi | 1851-2109 (**1943, 1988, 1991, 2044, 2073**) | #1994, #1912.1-.8, #1906.8/.9 |
| E | `HomeSuggestionGrid` | 2179-2213 (**2188, 2199**) | #2141, #1906.10-.11 |
| F | `ChatHeader` | 1507-1569 (**1529, 1554**) | #1912.4, #1944.4, GA-30 |
| G | `ChatMain` / `Chat` — chaîne de hauteur | 1323-1351, 1410-1505 (**1341, 1428**) | #1944 mobile, #1906.4 |

**Ordre : A → B → C → D → E → F → G.** A conditionne B, C et E : une seule mesure de largeur, un
seul endroit.

## 3. Les antériorités — chacune est une QUESTION, pas un verdict

1. **#1912.4 « Périmètre actif » dans la barre de saisie.** Règle : `Chat.tsx:1993-1999`, décision
   **Louis 13/09/2026 batch 13** — la portée était rendue deux fois (loi 4), elle vit dans
   `ChatHeader` (`Chat.tsx:1554`). #1912 (et #1910, lot 8) veut la remettre près de la saisie.
   **Reco : garder l'en-tête** — la raison d'origine tient, et `:1554` porte déjà
   `pointer-coarse:min-h-11`.
2. **#1907.9 dégradé violet derrière l'accueil.** Règle : `chat-surface.ts:29-30` + `Chat.tsx:1650`,
   **Louis 13/09 batch 13** — « le primaire reste PLAT », dégradé retiré. #1907 le redemande mot pour
   mot. **Reco : rester plat** — mais c'est le même auteur, 2 jours après son propre retrait : à lui
   de dire si le retrait visait le dégradé ou son intensité.
3. **#1912.11 logos des outils connectés.** **Écarté par Louis le 12/09** (« un logo est un nom
   d'éditeur »), puis **rouvert le 13/09 batch 11** sous forme de **noms** (`Chat.tsx:2026-2030`,
   `ConnectedToolsStrip`). **Reco : laisser en l'état.** Antériorité déjà refaite une fois — preuve
   qu'une règle se refait.
4. **#2001 contre #2141 — le même `mx-auto`, deux retours du MÊME jour.** #2141 (déposée 14/09,
   `ENG-839`, hors des 62 du cadrage) pointe `Chat.tsx:2203/1670/1657` et demande « recentrer ces
   carrés au milieu et en mettre 6 » ; #2001 demande la conversation à gauche. `chat-surface.ts:61`
   sert les deux. **Reco : deux jetons** — `column` (fil, aligné à gauche, borne de lecture en `ch`)
   et `homeColumn` (accueil, centré). Sinon l'un des deux revient la semaine prochaine.
5. **#1906.3 « DROITE — aucun rail permanent lourd »** contre #1916 (barre mémoire 7×7) et #1941
   (panneau « Ce que Laura utilise »), lots 5 et 9. **Reco : le lot 1 ne crée aucun rail droit** ;
   l'arbitrage se pose **avant** les lots 5/9.
6. **#1994 « tout sur une ligne » contre GA-28.** Supprimer `order-first w-full` (`Chat.tsx:2044`)
   met sur une même ligne, à 360 px : `+`, commandes, outils branchés, pastilles, micro, coût,
   Envoi. **Reco : appliquer #1994 au-dessus de 768 px seulement**, et gagner la hauteur autrement —
   `rows={2}`→`rows={1}` + auto-grow, `min-h-12`→`min-h-10`, `py-2`→`py-1.5`.

## 4. Infractions de design déjà présentes — mesurées

**CONFORME, ne pas « corriger »** : aucun `z-[…]` (`rc=1`) · aucune couleur hexadécimale ni classe de
palette en texte (`rc=1`) · aucun `vh` (`rc=1`) · plancher 12 px tenu (`text-xs` ×9, aucun
`text-[Npx]`, aucun `fontSize` inline → GA-31 ✓) · **un seul** conteneur défilant vertical (`:1645`,
sous `overflow-hidden` `:1341` ; `:2045` est horizontal) · `min-w-0` posé 9× dont
`:1428/:1530/:1543/:2044/:2045` → le piège `min-width:auto` est traité · **aucun `<div onClick>`**
(`rc=1`) → GA-35 ✓ · mouvement 100 % via `chatMotion`/`MOTION`, gardé par
`laura-surface-finish.test.ts:115-134` → GA-25 ✓ · le X de la pièce jointe porte son `aria-label`
(`:1969`) → GA-32 ✓.

**INFRACTIONS (5), à corriger en passant**

- **D81 / GA-34 / GA-26** — `Chat.tsx:1768` et `:2236` : `max-w-[min(680px,92%)]`, **en pixels**,
  **dupliqué**, ≈ **93-97 ch** > 70. `packages/ui/src/atoms/text.tsx:122` désarme son `max-w-[70ch]`
  dès qu'un appelant écrit `max-w-` — ici c'est le parent qui l'écrit.
- **GA-28 (borne unique 768 px)** — 3 usages de `sm:` (640 px) : `:1529` `sm:px-5`, `:1645`
  `sm:px-6`, `:2188` `sm:grid-cols-3`. Le reste du fichier est sur `md:`. Le `sm:grid-cols-3` est
  exactement la grille que #2141 vise.
- **GA-30 (44 px au doigt)** — 6 `pointer-coarse:` dans le fichier, mais **absents** de `:2067`
  (« Voir tout », `px-2 py-1 text-xs` ≈ 24 px) et de `:2147` / `:2158` (pastilles, `py-1.5` ≈ 30 px).
  `:2199` est conforme (`min-h-11` inconditionnel).
- **GA-26** — l'anneau de focus est réécrit **6 fois** à la main (`:1943`
  `color-mix(… primary-500 35% …)`, puis `focus-visible:ring-[var(--bellum-primary-500)]` à
  `:2055, :2067, :2147, :2158, :2199`). Un réglage, six endroits.
- **GA-26** — `:1943` `ml-14 … md:ml-0` : une gouttière de 56 px réservée dans la **saisie** pour un
  bouton qui vit **ailleurs** (signalement). Si ce bouton bouge, la saisie garde son trou.

## 5. Ce qu'il ne faut PAS faire

Ne touche **aucun** de ces fichiers, même d'une ligne : `features/launcher/ComposerLauncher.tsx` +
`LauncherExamples.tsx` (portent #1912.13 `cost.free:137`, appelés `Chat.tsx:2046/2081/2097`) ·
`ConversationsPanel/Drawer`, `SidebarConversations` (lot 7) · `MemoryBar`, `ReplyFooter`,
`ContextDisclosure`, `StructuredReply`, `PendingActions`, `CopilotCards` (lots 5/6/9) ·
`ScopeButton`/`ScopeDialog` (lot 8) · `packages/ui/atoms/text.tsx`, `motion.ts`, `tokens.css` (un
changement ici touche tout le produit — **remonte-le en question**).

⚠️ **Ne touche pas `DemoSuggestionRow` (`Chat.tsx:2118-2166`) ni `demo-chat-script.ts`** : en
démonstration les amorces **sont** le script (#1320) ; les modifier envoie un prospect sur des
questions sans réponse.

**Gardes à ne pas casser** : `chat-surface.test.ts`, `laura-surface-finish.test.ts` (GA-328 : zéro
gouttière au-delà de 768 px + zéro mouvement écrit à la main), `chat-conversations-panel-collapses.test.ts`,
`laura-surface-constraints.test.ts` (GA-68).

## 6. La preuve en recette — une par demande retenue

- **#2001** : à 1 920 px, `getBoundingClientRect().left` de la première bulle de Laura ≤ 40 px de la
  gouttière gauche du `<main>` (aujourd'hui ≈ 576 px) ; et la mesure `ch` du texte rendu ≤ 70.
- **#1994** : hauteur de `<form>` avant/après, en px, à 1 440 et à 390 px de large — **l'écart est le
  livrable**.
- **#2141** : `document.querySelectorAll('[data-testid="laura-home-suggestions"] button').length === 6`
  et la grille forme un rectangle plein (2×3) à ≥ 768 px.
- **#1906.2/.4** : ratio hauteur(`MessagesArea`)/hauteur(`<main>`) ≥ 0,70 à 900 px de haut.
- **#1906.10-.12** : capture panneau ouvert **et** fermé, aucun débordement horizontal
  (`scrollWidth === clientWidth` sur `<main>`).
- **#1907.1-.4/.6-.8/.12** : les deux thèmes, chaque couple texte/fond des 6 peaux mesuré, **AA des
  deux côtés** — `--bellum-text-accent` pour tout accent, jamais une nuance fixe.
- **#1907.19-.20** : les deux thèmes côte à côte, même capture.
- **#1912.1-.3/.5-.8** : un seul `<form>` contient les 8 éléments, tabulation de gauche à droite sans
  piège, `document.activeElement` relevé à chaque `Tab`.
- **#1944.1-.3/.5-.17** : à 390×844 en pointeur grossier, **chaque** cible cliquable de la coquille
  ≥ 44×44 (script sur `button,a,[role=button]`, liste des fautifs = zéro) ;
  `prefers-reduced-motion: reduce` actif → aucun déplacement ; `Tab` visite tout dans l'ordre visuel
  avec anneau visible ; aucune information portée par la seule couleur.
- **Chaque infraction du §4** : un test de garde qui échoue **avant** la correction et passe après —
  sinon ce n'est pas livré, c'est une intention.
