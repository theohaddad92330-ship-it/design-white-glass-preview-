---
sources:
  - packages/contracts/src/schemas/criteria-referential.ts
  - apps/ia/app/knowledge/criteria_referential.json
  - apps/ia/app/services/criteria_referential.py
  - apps/ia/app/services/criteria_widening.py
  - apps/web/src/features/discover/view/WideningNotice.tsx
  - apps/api/src/modules/demo/demo-criteria-widening.ts
---

# Référentiel des critères et paliers d'élargissement (#4433)

Épopée #4433 (décisions Louis 21/10/2026) : #4434 compétences, #4435 secteurs, #4436 tailles.

## Ce que c'est

UN référentiel, dans `packages/contracts/src/schemas/criteria-referential.ts` (données + fonctions pures, GA-26) :

- **Compétences** : alias → famille → domaine (`SKILLS`, `SKILL_FAMILIES`, `SKILL_DOMAINS`, 68 canoniques).
  React → JavaScript, TypeScript, Angular… (famille `js-front`) → développement web (domaine `web`).
  Les alias et les « produits distincts » (`distinct`) du vivier y ont été repris tels quels.
- **Secteurs voisins** : `SECTOR_NEIGHBOURS`, clé = code du vocabulaire partagé `APPLICATION_SECTORS`.
  Palier 1 = voisins écrits (aéronautique → défense, transport aérien, naval…), palier 2 = reste du groupe.
- **Tailles voisines** : `SIZE_BANDS` (TPE < 10 · PME 10-249 · ETI 250-999 · GC ≥ 1000, #4362.4), ± 1 puis ± 2.
- **Écritures d'une compétence** (#4579) : `SKILL_WRITTEN_FORMS`, clé = la canonique de `SKILLS`, valeur = toutes
  ses écritures d'annonce (« vue.js » → vue, vue.js, vuejs, vue 3, nuxt, nuxt.js ; « java » → java, java 17, j2ee,
  jee, spring, spring boot, jakarta ee). Une annonce écrit « Vue.js », « VueJS » ou « Nuxt », presque jamais « Vue » :
  la compétence part aussi sous ses écritures, **dès le premier passage**, sans attendre l'élargissement (#4579,
  lot L5 du 28/10/2026). **Écritures d'annonce SEULEMENT, et dans la MÊME famille** (`js-front`, `jvm`) — ni
  l'écosystème hors famille (« vue » ⇒ Pinia) ni la proximité (« vue » ⇒ React), qui a déjà ses paliers. Absente
  d'ici = cherchée telle quelle, jamais devinée. Ce n'est PAS un palier d'élargissement : une offre trouvée sous
  « vuejs » ou « nuxt » compte comme exacte, pas comme voisine.
- **Métiers d'une expertise** (#4519.19) : `EXPERTISE_TRADES`, les métiers qu'une expertise du catalogue recrute
  (« Data & IA » → data engineer, data scientist…). Une compétence (« Vue ») ou une expertise sans métier déclaré
  n'est pas traduite — côté IA `expertise_trade_terms` rend `None`, jamais une liste devinée.
- **Seuil** : `CRITERIA_WIDEN_MIN_RESULTS = 25` — 10 jusqu'au 28/10/2026 (#4673, lot L1 : Louis voulait « dans les
  20 30 comptes » sur une ville + techno et en avait 4 à 8 ; le produit était réglé pour 10). Sous 25 résultats
  exacts on élargit ; au-dessus, jamais. Un barreau commencé **se termine** : on n'ouvre pas le barreau SUIVANT
  quand la cible est atteinte, mais on ne jette pas ce que le barreau courant a déjà trouvé.
  Le titre du bandeau (`WideningNotice`) cite ce seuil, jamais la longueur de page demandée (#4433.3) ; seuil déjà
  atteint en exact → titre « résultats exacts d’abord, puis la liste s’ouvre aux voisins » (`widening.titleMore`).
- **Cible d'élargissement** (#4673.1, Louis 31/10/2026) : l'élargissement vise le volume DEMANDÉ, `widen_target(limit) =
max(CRITERIA_WIDEN_MIN_RESULTS, limit)` (`criteria_referential.py`) — 25 reste le plancher, une équipe de 9+ qui demande
  100 comptes élargit jusqu'à 100. Revient sur le seuil fixe de 25 pour tous ; toujours palier par palier, toujours dit,
  toujours plafonné à la région en automatique.

## Qui le lit

| Consommateur      | Où                                                                          | Ce qu'il en fait                                                                            |
| ----------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Vivier / matching | `apps/api/src/modules/consultants/skill-referential.ts`, `matching/text.ts` | alias, preuve stricte, **adjacence par famille** (`familySkill`) : signalée, jamais comptée |
| Découvrir (IA)    | `apps/ia/app/routers/discover.py` (`_discover_by_skill`, `_widen_registry`) | paliers compétence, secteur, taille                                                         |
| Laura             | `chat_tools._run_account_search` → `discover_registry`                      | même moteur ; `item.widened` + `widening_note` (elle le DIT, ne le propose pas)             |
| API               | `discover-market-memory.service.ts`                                         | un compte élargi par compétence passe le filtre « technologies observées »                  |
| Web               | `WideningNotice.tsx`, `CandidateRow.tsx`                                    | bandeau au-dessus de la liste, étiquette par carte, « Revenir au strict », **zone stricte** |
| Démo              | `demo-criteria-widening.ts`                                                 | deux comptes fictifs « proche : JavaScript » après les exacts                               |

## Le miroir IA — GÉNÉRÉ, jamais écrit à la main

Le service IA ne lit pas `packages/`. Il lit `apps/ia/app/knowledge/criteria_referential.json`, produit par
`criteriaReferentialMirror()`. Après toute modification du module TS :

```bash
cd packages/contracts && UPDATE_CRITERIA_MIRROR=1 npx vitest run src/schemas/criteria-referential.mirror.test.ts
```

Sans la variable, la même garde échoue si le JSON diverge.

## Contrat de réponse

- Chaque résultat élargi : `widenedBy = { axis: 'skill'|'sector'|'size', tier: 1|2, code }` (`code: null` pour une
  taille : « taille non publiée », jamais « 0 »). Absent = résultat exact.
- `query.widening = { minResults, exactCount, steps: [{ axis, tier, codes, added }] }` — absent sans élargissement.
- Requête : `strictCriteria: true` (geste « Revenir au strict ») coupe tout élargissement.
- L'exact reste en tête (`exact_first`, tri stable avant la coupe).

## Garde-fous

- Le secteur se relit depuis la liste NAF envoyée **seulement** quand elle est l'union EXACTE de secteurs entiers
  (un NAF tapé à la main ne nomme aucun secteur : on ne devine pas ce qui n'a pas été coché).
- Un palier registre ne part pas une fois le budget d'appels de la recherche atteint (`MAX_CROSSED_SECTORS`, #4305)
  ni hors du temps de la liste. Un palier compétence cherche au plus `SKILL_MAX_TERMS` termes.
- Une ligne dont on ne sait pas nommer le voisin n'est pas ajoutée.
- Laura : l'outil de recherche de comptes reçoit des clés de secteur larges (`it`, `finance`…) : seul le chemin
  `naf_sectors` (secteurs fins envoyés en NAF) bénéficie du palier secteur.

## Les autres surfaces (#4433.9, Louis 21/10/2026)

Mes cibles, la veille et l'analyse de compte suivent la même règle que Découvrir : sous `CRITERIA_WIDEN_MIN_RESULTS`
résultats, la liste s'élargit SEULE et DIT le palier atteint — jamais un écran à zéro, jamais « tu veux élargir ? ».
Un palier qui n'apporte rien n'est pas affiché. **Le seuil est celui des critères** (aucune seconde constante) ;
**le bandeau est celui de Découvrir** (`WideningBanner`, bloc `SurfaceWideningNotice`, namespace i18n `discover`,
clés `widening.surface.*`).

- L'échelle : `widenToThreshold` (`packages/contracts/src/schemas/surface-widening.ts`) — l'exact en tête, chaque
  palier ajoute dessous ce qu'il apporte de nouveau, arrêt dès le seuil atteint, palier sans apport ignoré.
  Paliers nommés : `SURFACE_WIDEN_TIERS` (`watch_intent`, `contacts_neighbour_roles`).
- **Mes cibles = la veille** : `/mes-cibles` monte `WatchlistBoard` (`/watchlist` y redirige) — UNE surface, un
  seul palier (`buildWatchlistView`, `watchlist-view.ts`) : « À traiter » maigre → aussi les comptes déjà traités.
  Ce que la PERSONNE a posé (puce d'intention ou de type, recherche) est un geste, jamais défait ; les puces et
  leurs compteurs restent ceux de la vue stricte ; « Écartés (N) » (le bruit reconnu) ne s'élargit pas. Geste
  « Revenir au strict » / « Élargir de nouveau ». Pas de palier « type » : une puce à 0 ne s'applique déjà pas.
- **Analyse de compte** : la passe d'élargissement des contacts (titres retirés, bande de séniorité, #2543.5g)
  part sous le même seuil (`phase2_contacts.py`, `CRITERIA_WIDEN_MIN_RESULTS`, plus un 5 propre à la passe) ; son
  résultat (`coverage.widened`) se dit dans `OrgCoverageBanner` via `contactsSurfaceWidening`, seulement si elle a
  apporté des contacts. Le seuil de 25 de la passe par titres (`CONTACTS_MIN_BEFORE_WIDENING`) et celui du repli web
  (5) restent des réglages de coût/latence, plus gourmands que le seuil commun, jamais moins.
- **La ZONE a son propre palier, et il est réversible dans les deux sens (#4429.3, #4429.4).** Un rayon demandé
  qui ne rend rien englobe d'abord la ville seule, et Laura **dit le palier tenté** au lieu de rendre une liste
  vide. Le geste inverse — « Revenir à <ville> seule » — pose une **zone stricte** : `WideningBanner` la porte en
  `zoneStrictPlace`, l'affiche **tant qu'elle dure** et offre `onZoneWiden` pour la défaire. Une zone stricte
  posée suffit à faire exister le bandeau, même sans aucun autre élargissement en cours. L'étiquette « à moins de
  N km » ne s'écrit que sur une **distance mesurée** (#4433.3) : un rayon demandé n'est pas une distance connue.
  **Un barreau à la fois (#4429, règle du 27/10 au soir, `c144` qui renverse `c143` : l'automatique s'arrête à la région)** : ville de départ à 100 km, puis département → région,
  STOP (chaque palier nommé, jamais de permission demandée ; la France reste une recherche explicite, jamais un
  élargissement automatique — c144 renverse c143, qui montait jusqu'au pays). Le bandeau
  (`WideningBanner` → `ZoneWideningNotice`) offre en plus « Revenir au barreau d'avant » : `onZoneStepBack(place,
ceiling)` pose un plafond `ZoneCeiling` (`zoneCeilingBefore` dans `@bellum/contracts`) et la recherche ne dépasse plus
  ce barreau ; sans le callback, le geste est un no-op. **Le bouton de retour nomme le rayon réellement posé
  (#4627.9)** : `WideningBanner` prend `zoneRadiusKm` (le rayon de la recherche) et le passe à `ZoneWideningNotice`
  (`radiusKm`) ; `onZoneStepBack(place, ceiling, radiusKm?)` le renvoie. Sans rayon, le libellé reste celui d'avant.
  **Le barreau posé se VOIT tant qu'il dure (#4429.4)** : `WideningNotice` prend `zoneCeilingStep`
  (`{ place, ceiling }`) et l'affiche comme les autres élargissements — un plafond posé par « Revenir à
  100 km » suffit à faire exister le bandeau, et il reste réversible. Même règle que la zone stricte :
  un geste qui restreint se dit, il ne se devine pas.

- **Le bandeau ne promet que ce que les lignes portent (#4627).** `WideningBanner` prend
  `zoneAllLabelled` (défaut `true`) et le passe à `ZoneWideningNotice` en `allLabelled` : quand **au moins une**
  ligne élargie n'a pas son étiquette de zone, la phrase du bandeau **ne prétend plus** que chaque résultat la
  porte. C'est la même règle qu'ailleurs sur Découvrir — _annoncé = rendu_ — appliquée à l'étiquetage et non au
  comptage : une étiquette manquante se tait, elle ne se devine pas.

- Sans notion de résultat filtrable (non élargis) : les onglets par catégorie de l'onglet Veille d'un compte
  (la personne choisit l'onglet), « Ce que tu suis », les Pistes.

## Expertises → métiers (`expertiseTrades`, #4519.19, Louis 24/10/2026)

Une EXPERTISE du catalogue (`expertise_areas` de l'onboarding, tuile de Découvrir — ex. « Data & Intelligence
Artificielle ») se cherche par les MÉTIERS qu'elle recrute, jamais par son libellé : aucune offre ne s'intitule ainsi.
Chaque entrée porte `labels` (écritures reconnues, comparées pliées par `normaliseSkillText`) et `tradeTerms` (ce qui
part aux sources d'offres). Lecture côté IA : `expertise_trade_terms()` (`criteria_referential.py`). Une expertise
absente de la table, ou une compétence (« Vue »), n'est PAS traduite — jamais devinée.
Lecture côté API (lot R, #4519) : `expertiseTradeTerms()` (même table, `criteria-referential.ts`), appelée par
`discoverBaseCriteria` — la base commune est interrogée par métiers, jamais par le libellé de l'expertise.

Salle de démo (#4115.5) : les comptes voisins de l'élargissement (`demo-criteria-widening.ts`) portent désormais leurs signaux datés, comme les comptes exacts (`demoSkillSignals`). Aucun effet sur la table des expertises.
