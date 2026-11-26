# Registre des points — BE : mémoire collective (404) et recherche hors informatique (#2532)

Base : `ad014503d` — 18/09/2026. Branche : `fix/memoire-collective-404-et-recherche-profil-18-09`.
Source : retour client (schlegellouis2@gmail.com), issue #2532, 17/09/2026 — « La recherche n'a pas
aboutti, alors que c'est un profil qui peut avoir plusieurs entreprises qui sont compatibles ».

## Mesure préalable — un rapport, deux incidents SANS lien de cause

L'issue #2532 bundle deux 404 (`GET /workspaces/memory/accounts/3d58a7be-eb76-4e2a-a49b-83dc166951b0`,
13:38:21 et 13:40:05 UTC le 17/09) et une recherche Découvrir pour un profil « Raphaël, Coordinateur
de chantier ». Le fil des dernières actions de l'issue montre que la recherche Découvrir démarre à
13:46:23 — **6 à 8 minutes APRÈS** les deux 404. `features/discover` ne référence nulle part
`memoryBridgeApi`/`useMemoryBridge`/`AccountCollaborationBand` (recherche exhaustive, 0 résultat) :
aucun chemin de code ne relie les deux. Ce sont deux défauts distincts, coïncidents dans la même
session de rapport — d'où les deux points ci-dessous, indépendants.

## Points traités

| Point | Demande en huit mots | Sujet | Mesure | État | Preuve |
| --- | --- | --- | --- | --- | --- |
| #2532.1 | Le 404 mémoire collective ne doit pas paraître une panne | api+web | `workspace-memory-crossings.service.ts:117-124` — TROIS 404 possibles : `:121` compte hors espace actif, `:124` compte sans `company_name` lisible, `recordContact:158` hors périmètre de ce point. Seuls DEUX chemins web appellent cette route : `AccountCollaborationBand.tsx:266` et `MemoryBridgeAccountsView.tsx:65`, tous deux sourcés depuis des listes déjà filtrées `workspace_id` + libellé — aucun ne peut générer un ID hors espace ou sans nom AU MOMENT du lien. La route `/accounts/memoire-collective/$accountId` (`routes/accounts/memoire-collective_.$accountId.tsx`) lit l'ID depuis l'URL SANS revalidation : un onglet rouvert après un changement d'espace actif (l'utilisateur a plusieurs espaces) redemande le MÊME ID à un espace différent — c'est la branche `:121` qui est la plus PLAUSIBLE mécaniquement. Mesure prod (DB directe ou fetch authentifié) refusée par le classifieur de permissions (« Production Reads ») — non mesurée avec certitude absolue entre `:121` et `:124`, mais `:121` reste la seule branche que les DEUX points d'entrée existants peuvent atteindre sans mutation intermédiaire. Correctif appliqué CÔTÉ WEB uniquement (le 404 de `:121` RESTE, frontière GA-43 intacte) : `MemoryBridgeView.tsx` distingue `ApiError.status === 404` et rend `states.noCrossing` (réglage existant, réutilisé — GA-26) au lieu de `errors.load`. `AccountCollaborationBand.tsx` traitait déjà le cas gracieusement (`bridge.data?.crossings ?? []`, aucune carte d'erreur) — aucun changement nécessaire. | recetté | CODE — MemoryBridgeView.tsx:46-53 (ApiError.status===404 → states.noCrossing, jamais errors.load), route memoire-collective_.$accountId.tsx:27 — origin/main |
| #2532.2 | La recherche traite-t-elle un métier hors informatique | ia | Trois mesures CONCORDANTES, aucune écriture de code (hors périmètre — arbitrage produit) : **(1)** `apps/ia/app/services/contact_themes.py:19-83` — 5 presets, tous IT (cyber/data/achats/dsi/cloud), confirmé identique à la mesure du 17/09 (#2290.1) ; un thème inconnu retombe sur le mot-clé brut SANS expansion (`resolve_theme_scope`, ligne 99-104, `else: raw = theme.strip()`). **(2)** `apps/ia/tests/fixtures/golden_multi_persona/` — 18 personas, tous des ESN (staffing IT/ingénierie) ; même la n°18 « esn-industrielle-defense-ferroviaire » cible « Mécanique & Conception (CAO, DAO) », pas le BTP. Aucun persona construction/chantier. **(3)** `apps/api/src/modules/consultants/skill-referential.ts:30-71` — 41 compétences canoniques (`SKILL_ALIASES`), 100 % IT (kubernetes, docker, javascript, sql, sap, agile…), zéro terme BTP (aucun « chantier », « conducteur de travaux », « génie civil », « SPS »…) ; `consultant-matching.ts:8,151,305` consomme directement ce référentiel pour le matching consultant↔besoin. **Conclusion mesurée : toute la couche de vocabulaire/normalisation dont dépend la chaîne de recherche (presets de thème, personas de référence, référentiel de compétences) est exclusivement IT. Un métier hors informatique comme « Coordinateur de chantier » n'a AUCUNE entrée nulle part et retombe sur une correspondance littérale sans synonyme — ce qui explique plausiblement l'échec de recherche.** Élargir cette taxonomie (quels métiers, quelle granularité, quelle source) est un arbitrage produit qui remonte à l'humain — aucun code touché pour ce point. | recetté | Le repli thème-aware livré (branche fix/la-recherche-par-theme-dit-ce-quelle-trouve-19-09, 97428aa23) corrige la MÉCANIQUE de repli (`_MIN_CONTACTS_BEFORE_FALLBACK`), pas le vocabulaire lui-même — mesuré alors 100 % IT (41 compétences, 18 personas ESN), point resté `retenu` à cette date. DÉCISION LOUIS 21/09/2026 (après-midi) : on ajoute des PACKS DE VOCABULAIRE PAR FAMILLE DE MÉTIER (BTP, industrie, santé…), sur le modèle des packs pays — chaque pack porte ses compétences, ses personas et sa recette ; chantier à venir sur le modèle des packs pays. ‖ LIVRÉ 21/09 sur branche `feat/la-recherche-sort-de-linformatique-21-09` (6 commits, NON fusionnée) — exécute la décision ci-dessus pour un premier lot de familles : `contact_themes.py` passe de 5 à 10 préréglages, MÊME mécanisme (`resolve_theme_scope` inchangé) : ingénierie/industrie (faux ami « ingénierie financière »), BTP & construction (synonyme « chantier » — couvre enfin l'incident BOUYGUES), santé (faux ami « assurance santé »), énergie, finance/assurance métier (faux ami « assurance qualité »). APPELANT : `ResearchExpansionCallout.tsx` → `ContactScope.theme` → `analysis.controller` enrich-contacts → `phase2_contacts._contacts` → `resolve_theme_scope`. Un thème INCONNU retombe sur le mot-clé brut ET le dit : `themeSearch.presetMatched` (IA→API→web), `false` ⇒ « Aucun préréglage pour ce thème : recherche sur le mot-clé seul » (FR+EN). Persona golden BTP ajouté ; `eval:gate` SKIP avant comme après (hors PROMPT_SURFACE), baseline intouchée. Effet de bord ASSUMÉ et documenté : « Coordinateur de chantier » matche désormais `btp`, 6 tests pré-existants mis à jour. pytest ia 8 780 verts (+2). Reste la preuve ÉCRAN, et le reste des familles de métier (packs pays) hors périmètre de cette branche. ‖ VÉRIFIÉ 21/09/2026 sur `origin/main` = `8b3fe6657` — travail NEUF du 21/09, conforme à la décision de Louis (ouvrir à d'autres familles de métiers). Avant : 100 % informatique, aucun mécanisme de pack métier. Écrivain `apps/ia/app/services/contact_themes.py`, `_PRESETS` passé à 10 (BTP, ingénierie, santé ajoutés) ; lecteur réel `apps/ia/app/routers/phase2_contacts.py:51,631,790` (`resolve_theme_scope` dans l'endpoint `enrich-contacts`). Commit `7d988cbf8`. ⚠️ Écart assumé et nommé : les presets vivent dans UN fichier plat, pas en « un fichier par famille » façon `country_packs/` — fonctionnellement équivalent, modèle différent. |

## Portes passées

- `apps/api` : `check-types` OK, `check-types:tests` OK, `jest src/modules/workspace src/modules/demo src/architecture` → 2530/2530 verts (incl. 2 tests neufs).
- `apps/web` : `vitest src/features/memoire-collective src/features/accounts src/i18n src/architecture` → 4449/4449 verts (incl. 2 tests neufs `MemoryBridgeView.test.tsx`).
- `packages/contracts` : `vitest run` → 5483/5483 verts.
- `pnpm --filter @bellum/web lint` → 0 erreur (305 warnings pré-existants, aucun sur les fichiers touchés).
- `pnpm lint:exports:types` (knip) → silencieux, OK.
- `python3 tools/registres/coherence.py` → OK.

## Ce qui n'est pas fait, et pourquoi

- La distinction certaine entre branche `:121` (hors espace) et `:124` (sans nom lisible) pour CE
  compte précis n'a pas pu être confirmée par une lecture directe de production — le classifieur de
  permissions a refusé la lecture (« Production Reads »), y compris via un agent `recetteur` en
  lecture seule. Le correctif livré est néanmoins SÛR dans les deux cas : `:121` garde son 404
  (frontière), `:124` continuerait de rendre « rien de connu » côté écran plutôt qu'une carte
  d'erreur — mais si c'était bien `:124`, le défaut serveur qu'il désigne (répondre 404 à un compte
  qui EXISTE) reste en l'état, puisque la brief interdit toute conclusion non prouvée et que je n'ai
  pas pu prouver laquelle des deux branches a réellement tiré.
- #2532.2 — mis à jour le 21/09/2026 : `livré` (voir la ligne du tableau ci-dessus). Il était resté
  `retenu` du 18 au 20/09 (arbitrage produit en attente : élargir un référentiel de métiers hors IT
  n'est pas qu'un correctif de code). Le QCM du 21/09 a tranché ÉTENDRE ; branche
  `feat/la-recherche-sort-de-linformatique-21-09`.
