# Manifeste de dispatch — lot « livre un max de tickets en parallèle » (09/09/2026, nuit)

Base : `origin/main` = `f9fe1cc05`. CI mesurée le 09/09 à 20 h : **médiane 3 min 56 s,
8 runners en ligne, tous libres** ⇒ **PR courtes**, pas de PR d'intégration.
Contrainte qui reste : **un seul lot non recetté en production à la fois** (pas de préprod).

## Décisions PARQUÉES (mode sans arrêt — rien ne bloque)

| # | Décision | Défaut retenu, et pourquoi | Dis-le si tu veux l'autre |
| - | -------- | -------------------------- | ------------------------- |
| D1 | `#1472` — écran de référence de densité | Les maquettes du 27/08 servent déjà de référence (commentaire du 03/09). **On ne rouvre pas** ; le fil reste ouvert. Lecture la plus étroite. | Nomme un écran du produit dont la densité te convient |
| D2 | `#1639` — politique de crédits | **On ne touche pas** : facturation = arrêt obligatoire du profil §10. | — |
| D3 | `#1655` — relance de facture en retard | **On ne code pas** : il faut une facture réellement en retard pour l'observer. | — |
| D4 | `#1619.2` | Proposition écrite dans l'issue, sans oui/non ⇒ **non livrée**. | — |
| D5 | `#1768`, `#1770` | Correctifs en production depuis le 09/09, **non observables sans un vrai tour de Laura**. Restent ouvertes, geste de fermeture écrit au client. | — |

## Réservations (un agent isolé ne voit pas ce qu'un autre vient de créer)

| Agent | Plage d'horodatage de migration |
| ----- | -------------------------------- |
| W1 | `1791900000000`–`1791909999999` |
| W2 | `1791910000000`–`1791919999999` |
| W3 | `1791920000000`–`1791929999999` |
| W4 | `1791930000000`–`1791939999999` |
| W5 | `1791940000000`–`1791949999999` |

Dernière migration sur `main` : `1791853204617-MarketCompanyAlias.ts`.
Doublon préexistant connu et attendu : `1783000000000`.

## Réservé à l'intégrateur — INTERDIT aux agents
- `packages/contracts/src/changelog/**` (conflicte à chaque vague)
- `CLAUDE.md`, `agent_docs/env-reference.md`, `agent_docs/chantiers-livres.md`
- `apps/api/src/app.module.ts`
- `apps/dashboard-manager/src/lib/nav-sections.ts`
- `packages/contracts/src/schemas/table-scopes.ts` (fondation partagée)

## Dette connue, non traitée
- Worktree résiduel `.claude/worktrees/agent-a3c62a1ae18e40166` (branche
  `feat/analytique-produit-lecture`, mergée). `git worktree remove` le refuse
  (fichiers supprimés dedans), `--force` est bloqué par le classificateur du poste.
  Il fausse `pnpm lint` LOCAL, **pas la CI** (`.claude/` est gitignoré).

## Le tableau de dispatch

| # | Lot | Périmètre | Interdits | Dépend de | Branche | État |
| - | --- | --------- | --------- | --------- | ------- | ---- |
| W1 | Adressabilité nommée au contrat + semée en démo + docblock périmé | `contracts/schemas/analysis/account-analysis.ts` · `api/modules/demo/{demo-dataset,demo-coverage}.ts` · `api/modules/account-access/access-addressability.spec.ts` | changelog, discover.ts, table-scopes, web, ia, dashboard-manager | — | `fix/adressabilite-nommee-au-contrat` | en vol |
| W2 | Libellés d'affichage FR sortis de la charge utile IA (≥18 call-sites) | `ia/services/{discover_scoring,access_scoring}.py` · `contracts/schemas/discover.ts` (additif) · `web/features/discover/CandidateScore.tsx` · `web/.../TabAccess.tsx` · `web/i18n/locales/{fr,en}` | analysis/**, changelog, table-scopes, api, dashboard-manager, routers/companies.py | — | `fix/libelles-affichage-hors-charge-utile-ia` | en vol |
| W3 | `/produit` du back-office DIT son état d'instrumentation + retours par écran + nav | `apps/dashboard-manager/**` | api, web, ia, packages, CLAUDE.md | — | `feat/backoffice-produit-dit-ce-quil-ne-mesure-pas` | en vol |
| W5 | `search_market_memory` — 46ᵉ outil de Laura (#1596.6-10 + #1628.1) | `api/modules/market-memory/market-memory.service.ts` · `api/modules/copilot-bridge/**` · migration `17919…` · `ia/services/{bellum_api,chat_tools}.py` · `ia/tests/test_{copilote_prompt_blocks,chat_second_market_tools}.py` | market-memory-import.ts, ingest-*, entities market-*, discover_scoring.py, bellum_advisor.py, app.module.ts | — | `feat/laura-cherche-dans-la-memoire-marche` | en vol |
| W6 | Import mémoire marché versionné + transactionnel (#1615 + #1616) | `api/modules/market-memory/market-memory-import.ts` · `api/scripts/ingest-market-memory.ts` · 4 entités `market-*` · migration `17919…` | market-memory.service.ts, copilot-bridge, alias entity, table-scopes, dashboard-manager | — | `feat/import-memoire-marche-versionne-et-transactionnel` | en vol |
| W7 | Les 2 déclencheurs d'alerte manquants (#1676.1) — `api_indisponible`, `job_bloque` | `api/modules/backoffice-alerts/**` · `api/common/kill-switches.ts` (si besoin) · `api/architecture/` | market-memory/**, copilot-bridge, app.module.ts, env-reference | — | `feat/alertes-operateur-les-deux-declencheurs-manquants` | en vol |
| W4 | **EN ATTENTE** — le câblage mémoire marché → service IA (5 maillons, 1/5 présent) | `api/modules/analysis/**` · `contracts/schemas/ia.ts` · `ia/models/research.py` · `ia/routers/phase1_research.py` · `ia/services/discover_scoring.py` | — | **W2** (conflit sur `discover_scoring.py`) | — | à dispatcher après le merge de W2 |

## Ce que les éclaireurs ont trouvé, et qui change le plan

### Le câblage mémoire marché → IA : **1 maillon sur 5**, et deux chemins du brief étaient FAUX
- Maillon 5 PRÉSENT : `MARKET_MEMORY_MIN_PATHS = 3` (`contracts/schemas/market-memory.ts:57`).
- Maillons 1-4 ABSENTS. ⚠️ **`apps/ia/app/services/research.py` N'EXISTE PAS** (`test -e` faux) — c'est `apps/ia/app/routers/phase1_research.py`. Le brief hérité citait deux fois un chemin périmé.
- Point d'insertion réel : `routers/phase1_research.py:1518-1541`, dans l'appel à `addressability_for_company`.
- ⚠️ Un test **ÉPINGLE** l'absence : `test_the_path_axis_stays_unmeasured_because_no_aggregated_route_reaches_this_service`. Il devra changer avec le câblage.

### Trois diagnostics PÉRIMÉS par un commit du même jour (`67d4ce929`, 11h20)
`#1631.3`, `#1630.4`, `#1640.8` : l'axe **RELATION est livré** — via `crm_presence`, pas via la mémoire marché (refus assumé : pas de hash de personne). Seul l'axe **PATH** reste.

### `#1591` est LIVRÉ à 3/3 — à CLORE après recette
`focusSuggestions()` (`web/features/search/lib/marketFocus.ts:42-49`, PR #1753 / `a16d8c6ea`) + PR #1777. Ne dépend PAS du câblage IA.

### `#1636` : le blocage annoncé était FAUX
Annoncé « attend `#1756.2` ». Mesuré : `#1756.1` **est livré** (`market-memory.service.ts:255-311`, garde `market-memory-unresolved-is-said.spec.ts`). Le vrai blocage est **`#1622` + `#1640.2`**.

### `#1756.2` : le pack de données n'a PAS de colonne alias
`02_entreprises.csv` n'en porte aucune (comparé colonne à colonne, `market-memory-import.ts:252-289`). Deux pistes : (A) le pack ajoute la colonne ; (B) le registre public rend déjà `nom_entreprise` ET `denomination` (`ia/services/pappers/models.py:208-209`) et `ia/routers/companies.py:170` **jette l'un des deux** — un alias s'y écrirait sans deviner aucun contrat.

### `#1634` : mesurable, mais seulement en production
L'ingestion **écrit bien** `city`/`region` (`market-memory-import.ts:273-274`) — ce n'est pas un défaut d'ingestion. Le taux de remplissage dépend du pack. Requête à lancer :
```sql
SELECT count(*) AS lignes, count(city) AS avec_ville, count(region) AS avec_region FROM market_company_signal;
```

### Le traceur produit : **2 émetteurs sur 9** ont un appelant
`screen_viewed` / `screen_left` (via `router.tsx:62`). Les 7 autres ne sont appelés que dans leur propre test. `VITE_PRODUCT_TRACKER_ENABLED` est éteinte et **nulle part armée**. Et le service **ne distingue pas** « traceur éteint » de « aucune donnée » — c'est ce que W3 rend visible.

## Vague 2 — dispatché après mesure (88 % de mémoire libre, 8 worktrees)

| # | Lot | Périmètre | Branche | État |
| - | --- | --------- | ------- | ---- |
| W8 | Dossier de compte — 6 points livrables (`#1607.5`, `#1607.3`, `#1624.7/.9/.10`, `#1417.4`) | `web/features/accounts/{sections,tabs/TabPartners,accounts-list}` · `web/i18n/locales/*/accounts.json` · `api/modules/{partners,accounts}` · `ui/atoms/entity-avatar.tsx` (si inévitable) | `feat/dossier-de-compte-ce-que-bellum-sait-deja` | en vol |

### Ce que l'éclaireur « dossier de compte » a trouvé — 39 points sur 6 issues
**21 LIVRÉS** (appelant cité) · **8 ABSENTS** · **5 BLOQUÉS** · **4 REFUS** · **0 NON PROUVÉ**
Le triage du 07/09 est confirmé : ce sous-lot est du **backlog de construction**, pas des raccords manquants.

⚠️ **`#1417.4` : le diagnostic du 09/09 s'était trompé de mesure.** Il annonçait un logo à 28 px. Chaîne réelle mesurée : `AccountTableRow.tsx:185` (`size="md"`) → `CompanyAvatar.tsx:15` (`md`→`sm`) → `packages/ui/src/atoms/entity-avatar.tsx:10` (`sm: size-9`) = **36 px**. Cible 30-32 ⇒ il faut **RÉDUIRE**, pas augmenter. Le correctif du diagnostic aurait empiré l'écart.

⚠️ **Les 4 REFUS ne viennent PAS du § Doctrine** : `#1417.1`/`#1417.2` sont D79/D80, sous **§ Design rules** de `CLAUDE.md`, et **absents de `doctrine-registry.ts`** (0 occurrence de D79/D80). `#1603.2`/`#1603.6` sont des refus **pragmatiques** (60 067 lignes en prod ; corpus sans SIREN/registre) — aucune règle écrite ne les fonde. À dire tel quel : un refus pragmatique n'est pas une doctrine.

### Ce qui reste NON dispatché, et pourquoi
| Point | Effort | Pourquoi pas maintenant |
| ----- | ------ | ----------------------- |
| `#1618.1` façade `AccountIntelligenceContext` (0 occurrence dans le dépôt) | L | Fondation — ne part jamais en même temps qu'un lot qui la consomme |
| `#1627.1/.2` onboarding « first market value » | M | Vague suivante, mémoire de la machine |
| `#1617.4` file de revue persistée | M | Conflit de fichiers avec W5/W6 sur `market-memory/` |
| `#1625.2` 3ᵉ lecture Reverse Market | L | Vague suivante |
| `#1616.6/.7` page d'administration de l'import | L | Dépend de W6 (`#1616.3/.4`) |
| `#1612.2` / `#1638.1` compatibilité technique preuve↔compte | L | **Décision produit non tranchée** : consultants↔mission, ou champ dédié |
| `#1607.1` refonte `BellumReadCard` en 4 blocs | L | Touche le texte produit par l'IA — pas livrable côté écran seul |
| `#1626` filtres marché sur Découvrir | L | Dépendance au scoring Python **non tranchée** par l'éclaireur |

## ⚠️ Pièges payés dans CE lot — à ne pas repayer

1. **Un `git checkout` sur le dépôt principal ÉCHOUE quand un worktree tient la branche** — et le `exit 0` venait du `git checkout main` final : **la suite n'a jamais tourné**, et ça ressemblait à un vert. Vérifier un lot d'agent se fait **DANS SON WORKTREE** :
   `cd .claude/worktrees/agent-<id> && node apps/api/node_modules/jest/bin/jest.js …`
2. **GA-19 (`?? 0`, cliquet à 118) lit `apps/dashboard-manager/src` mais VIT dans la suite `web`.** Son propre docblock raconte l'incident : une PR qui ne touchait que `dashboard-manager` n'a pas déclenché `Test (Web)`, est passée verte, et a laissé `main` rouge pour la personne suivante. ⇒ **Pour la PR de W3, lancer la suite web même si le diff ne touche que `dashboard-manager`.** Corpus exact : `apps/web/src/{features,components,routes}` + `apps/dashboard-manager/src`.
3. Les deux `?? 0` ajoutés par W1 sont dans `apps/api` — **hors du corpus de GA-19**, donc sans effet. Vérifié, pas supposé.

## Vague 3 — les 14 issues neuves de Louis (09/09, 15h56–16h26)

Toutes des **constats courts** (le seuil du §3 bis se mesure sur le texte HUMAIN, pas sur le corps du widget).

| Issue | Écran | Ce qui est demandé | Où c'est parti |
| ----- | ----- | ------------------ | -------------- |
| `#1789` `#1790` | `/consultants` | un seul bouton Valider ; après validation on reste sur la revue | **N1** en vol |
| `#1798` `#1799` | `/accounts/partners` | doublon « Capgemini », ESN non cliquables, listing sans détour par le territoire | **N2** en vol |
| `#1795` `#1796` `#1797` | `/accounts` `/discover` `/watchlist` | replié par défaut · **fusionner Territoire dans Découvrir** · panneau latéral → modale à flèches | **S8** éclaireur |
| `#1786` `#1787` `#1791` `#1792` `#1793` `#1794` | `/chat` `/dashboard` | arrivée sur Laura · onboarding rejouable et animé · menu « + » et connecteurs · pièce jointe au signalement · Laura enrichit le profil | **S9** éclaireur |
| `#1788` | menu | la barre passe au-dessus du sous-menu (empilement) | non dispatché — à joindre à un lot web |

## Livraisons

| PR | Contenu | État |
| -- | ------- | ---- |
| **#1806** | W1 adressabilité au contrat + démo · W7 `api_indisponible` · 2 docblocks périmés · changelog FR+EN | CI en cours |
| **n°2** (locale) | W6 import mémoire marché versionné+transactionnel · W3 `/produit` du back-office | gates verts, **pas poussée** — un merge tue la CI des PR en vol |

⚠️ **Gates de la PR n°2, déjà passés** : GA-18/GA-19 (8 tests) lancés **depuis la suite web** parce que le corpus de GA-19 contient `apps/dashboard-manager/src` ; typecheck dashboard-manager rc=0 ; `check-types:tests` API ; knip.

## Livraisons — état au fil de la nuit

| PR | Merge | Contenu |
| -- | ----- | ------- |
| **#1806** | `be21ef60d` | adressabilité au contrat + semée en démo · `api_indisponible` distingue timeout et échec · GA-274 · 2 docblocks périmés · changelog FR+EN |
| **#1811** | `f4ab8f55f` | import mémoire marché versionné + transactionnel (#1615/#1616) · `/produit` du back-office dit son état d'instrumentation |
| **#1815** | `fc32ce7d3` | 15 libellés FR sortis de la charge utile IA (additif) · **le normaliseur de Découvrir les recopie enfin** |

⚠️ **Trois lots mergés sans recette intermédiaire** — décision assumée, sur demande explicite de Louis (« merge, recette, avance »). Le risque est nommé : si un défaut sort, il faudra départager trois lots. Ils sont disjoints (contrats+API / API+back-office / IA+web Découvrir), ce qui limite la casse. **La recette se fait sur `fc32ce7d3`, une fois l'API ET l'IA servies.**

## Causes racines retrouvées cette nuit — toutes déjà au registre

| Cause | Où, cette fois |
| ----- | -------------- |
| **Un normaliseur avale les champs neufs** | `discover-normalize.ts` — **troisième** fois dans le MÊME fichier (après `block` et `barrier`, que ses propres docblocs racontent) |
| **L'appelant neutralise un composant juste** | `TalentDetailPage.tsx:265` — `onDone={() => undefined}`, tous les tests du panneau passaient |
| **Un commentaire décrit un état extérieur à son fichier** | `backoffice-alerts.module.ts:31` (« NON ENCORE IMPORTÉ » — il l'était) et `access-addressability.spec.ts:4-24` (« aucun producteur » — il y en avait un) |
| **Une garde aveugle à ce qui n'a pas de nom** | `demo-coverage.spec.ts` itérait le contrat ; `addressability` n'y étant pas, elle ne pouvait pas manquer |
| **Un `exit 0` qui ment** | mon `git checkout` a échoué (branche tenue par un worktree) et le `exit 0` venait du `checkout main` final : **la suite n'a jamais tourné** |
| **Un test qui cherche ne compte pas** | le test de la colonne « espaces » de W3 s'arrêtait au premier `<` et passait sur du code cassé |

## ⚠️ Ce que la RECETTE LIVE a trouvé, et que 8 000 tests ne voyaient pas

### `#1799` n'est corrigé qu'à MOITIÉ — mesuré sur les vraies données de production
`GET /api/partners/on-my-accounts` (espace de Louis, 50 entrées) rend :
```
"Capgemini"                                      "Capgemini — probable"
"Accenture"                                      "Accenture — probable"
"Aucun concurrent ESN identifié dans les sources"
"ESN non identifiée"      "ESN probable non identifiée"      "Non identifié"
"Capgemini / Accenture / Sopra Steria (ESN généralistes)"
```
**Deux défauts distincts, et le correctif de N2 n'en couvre qu'un :**
1. **La casse** (`Capgemini` vs `CAPGEMINI`) — réglée par `marketMatchKey`. ✅
2. **Les variantes SUFFIXÉES** (`« — probable »`) — `marketMatchKey` ne les rapproche pas. ❌
3. ⚠️⚠️ **Des chaînes de REPLI de l'analyse fuient dans une liste de noms d'entreprises.** « Aucun concurrent ESN identifié dans les sources » s'affiche comme si c'était une ESN. C'est **plus grave que le doublon** : c'est de la donnée qui n'est pas ce qu'elle prétend être, et un commercial peut la lire en rendez-vous.

⚠️ Mesuré **avant** le déploiement de `5e443a8ed` : la production servait encore `fc32ce7d3`. À **re-mesurer** une fois déployé pour départager ce que le correctif attrape.

**Ce qu'il reste à faire** : filtrer les non-entités à la SOURCE (l'analyse ne doit pas écrire une phrase de repli dans un champ « nom de concurrent »), et rapprocher les variantes suffixées. Chercher l'écrivain, pas seulement l'affichage.

### Ce que l'outillage a coûté dans cette recette
1. ⚠️ **Les clics sont morts** : `CDP Input.dispatchMouseEvent` expire à 30 s (« le renderer est gelé »), alors que `navigate` et `javascript_tool` répondent parfaitement. **Ce n'est pas l'application.** Conséquence : « j'y arrive en cliquant » n'a pas pu être prouvé cette nuit.
2. ⚠️⚠️ **`history.pushState` + `PopStateEvent` NE re-rend PAS** l'application — et le résultat *ressemble* à une mesure : **douze routes ont rendu exactement 8 499 caractères et le même titre**. Seule l'URL changeait. Un balayage fondé là-dessus aurait déclaré douze écrans sains sans en avoir vu un seul. **Une vraie navigation par route, ou rien.**

### Balayage ZÉRO régression — ce qui est PROUVÉ, et ce qui ne l'est pas

**Prouvé par une vraie navigation, écran par écran** (`fc32ce7d3` servi par l'API ET l'IA) :

| Route | Rendu | Débordement horizontal | Verdict |
| ----- | ----- | ---------------------- | ------- |
| `/accounts` | 8 792 c | non | OK |
| `/consultants` | 7 891 c | non | OK |
| `/accounts/partners` | 4 100 c | non | OK (mais voir la trouvaille ci-dessus) |
| `/discover` | 2 480 c | non | OK |
| `/pilotage` | 5 511 c | non | OK |
| `/briefing` | 6 053 c | non | OK |
| `/missions` | 1 777 c | non (1512 = 1512) | OK |
| `/actions` | 3 035 c | non | OK |
| `/accounts/<id>` onglet Accès | — | non | OK |

**Le cœur du lot, vu tourner en production :**
- `ADRESSABILITÉ **8/9**` à l'écran — le dénominateur est celui des axes MESURÉS, jamais 20.
- La phrase « Ce qu'on n'a pas pu regarder — **ces axes sortent du dénominateur, ils ne valent pas zéro** » est rendue, avec les trois axes nommés (Proportion, Chemin, Coût d'accès).
- Mesuré sur quatre comptes : `LVMH` rend `score: null`, `max: 0`, cinq axes non mesurés — **« non mesuré » n'est pas « 0 », en production**.
- L'axe RELATION est mesuré sur `ROCHE` (CRM connecté) et non mesuré ailleurs : la distinction fonctionne.

**NON prouvé, et nommé comme tel :**
- **« J'y arrive en cliquant »** — les clics étaient morts (voir pièges d'outillage). Le balayage a été fait par navigation directe, ce qui prouve que la route répond, **pas** que quelqu'un la trouve.
- `/projects`, `/settings`, `/team`, `/chat` — la session Chrome a disparu avant.
- **Les deux thèmes** — non basculés.
- **Le mobile** — non vérifiable depuis un navigateur piloté (la FENÊTRE rétrécit, la PAGE non).
- **`#1815` de bout en bout** : le REPLI est prouvé (l'analyse du 30/08 n'a pas de `label_key`, l'écran rend le français **sans casser** — c'est la fenêtre de déploiement rendue inoffensive). Qu'une analyse NEUVE porte la clé et s'affiche en anglais **n'est pas observé** : il faudrait relancer une analyse, donc dépenser des crédits.
