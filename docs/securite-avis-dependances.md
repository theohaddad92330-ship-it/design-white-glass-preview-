# Avis de sécurité des dépendances — exclusions explicites

Dernière revue : 25/10/2026. **Prochaine revue : 27/10/2026** (ou dès qu'un correctif sort).

La CI lance `pnpm audit --prod --audit-level=high` (npm) et `pip-audit` (Python) et **bloque**
sur tout avis high/critical — sur main, la nuit, et pour toute PR qui touche les dépendances
(`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`). Une PR qui n'y touche pas reçoit un
avertissement, pas un rouge : depuis le 22/10/2026, un avis publié dans la journée ne coupe plus
toutes les PR ouvertes (`ci.yml`, étape « Audit des dépendances npm »). Une exclusion n'existe que si elle est listée ici ET dans
`package.json` → `pnpm.auditConfig.ignoreGhsas`. Jamais d'exclusion silencieuse.

## 1. `next@14.2.35` (apps/dashboard-manager, apps/website) — LEVÉE le 13/10/2026

Les 10 avis high/critical de Next 14 (`GHSA-h25m-26qc-wcjf`, `GHSA-q4gf-8mx6-v5v3`,
`GHSA-8h8q-6873-q5fj`, `GHSA-c4j6-fc7j-m34r`, `GHSA-36qx-fr4f-26g5`, `GHSA-m99w-x7hq-7vfj`,
`GHSA-89xv-2m56-2m9x`, `GHSA-p9j2-gv94-2wf4`, `GHSA-p293-qw3h-jr36` critical,
`GHSA-2xp9-vwfh-vxw4` critical) n'avaient pas de correctif dans la ligne 14. Les deux
applications sont passées à `next@15.5.27` + `react`/`react-dom` 19 (branche `fix/next15`) ;
ces GHSA ne sont plus exclus de `ignoreGhsas` et `pnpm audit --prod --audit-level=high`
ne remonte plus aucun avis sur `next`.

Ce que la migration a changé (pour la relire) :

- `cookies()`, `headers()`, `params`, `searchParams` asynchrones (codemod officiel
  `next-async-request-api`, puis reprises à la main) ; `getLang()` du manager est devenu
  asynchrone, ses appelants l'attendent.
- `apps/website/tsconfig.json` : `paths` force `react`/`react-dom` vers les types 19 de
  l'application. `@bellum/ui` et `@bellum/consent` restent typés React 18 (consommés aussi par
  `apps/web`, toujours en React 18) : sans ce renvoi, deux `@types/react` cohabitent et
  `tsc` refuse les icônes et composants de `@bellum/ui`. À l'exécution, Next 15 sert son
  React 19 embarqué à tout le routeur `app/`, `@bellum/ui` compris.
- `peerDependencies` de `@bellum/ui` et `@bellum/consent` : `^18.3.1 || ^19.0.0`.

## 2. `braces@3.0.3` — `GHSA-vfj7-8cjw-p6xm` (high, DoS par motifs imbriqués)

Aucune version corrigée n'existe (le registre ne publie rien au-delà de 3.0.3).
Chaînes : `tailwindcss > chokidar|fast-glob > micromatch > braces`, `lint-staged > micromatch`,
`jest-message-util > micromatch`. Toutes sont des **outils de build / lint / test** : le motif
vient de nos propres fichiers de configuration, jamais d'une entrée utilisateur ; rien de cela
ne tourne en production. Non atteignable. Revue : 27/10/2026.

## 3. `zod@3.25.x` — `GHSA-mrhx-c7xc-m3w5` (high, épuisement mémoire) — **exclusion DATÉE, à lever**

Publié le 01/10/2026, remonté par Dependabot le 25/10/2026. Plage vulnérable `< 4.6.6`,
**première version corrigée 4.6.6** : la ligne 3.x ne recevra pas de correctif. Le dépôt déclare
`zod@^3.25.x` dans sept paquets (`apps/api`, `apps/web`, `apps/mcp`, `packages/contracts`,
`packages/events`, `packages/figma-sync`, `packages/utils`) — passer à 4.x est une migration de
version majeure (`.errors` → `.issues`, `z.record`, messages d'erreur), pas une montée de version.

Ce que l'avis demande : valider une **collection contrainte** (`z.array(…).max(n)`) dont l'entrée
porte beaucoup plus d'éléments que la borne — zod valide chaque élément avant de vérifier la
borne, et la mémoire grimpe avec l'entrée, pas avec la borne.

Pourquoi c'est **borné** chez nous, pas inatteignable :

- Toute entrée JSON passe par une limite de taille de corps — `apps/api/src/main.ts:160`,
  `express.json({ limit: '1mb' })` par défaut, et la garde `import-body-limit.spec.ts` interdit
  qu'on la relâche en silence. Le coût mémoire d'une validation est donc plafonné par 1 Mo
  d'entrée, pas par ce que choisit l'appelant.
- Les routes à limite relevée (12 à 34 Mo : `/rag-documents/ingest`, `/meeting-notes/transcribe`,
  `/rfp`, `/talents/intake`, imports CV et CSV) sont **toutes authentifiées** et comptées au
  débit par espace ; aucune n'est ouverte à un anonyme.

⚠️ Ce n'est **pas** « non atteignable » comme l'avis braces ci-dessus : c'est un risque réduit à
un déni de service par un utilisateur déjà authentifié, accepté le temps de la migration.
**Exclusion posée le 25/10/2026. Revue : 01/11/2026.** Tant qu'elle tient, elle bloque toute
détection d'un avis zod futur — à lever dès la migration 4.x (issue #4554).

## 4. Python (`apps/ia`) — `pip-audit`

0 avis au 13/10/2026 après relèvement : `fastapi 0.143.0` / `starlette 1.7.0`, `langgraph 1.2.15`,
`langgraph-checkpoint-postgres 3.1.3`, `pypdf 6.20.1`, `python-dotenv 1.2.4`, `supabase 2.16.0`
(nécessaire à `langsmith >= 0.8.18` via `websockets >= 15`), `pytest 9.1.1`.
`langchain` et `langchain-community` n'étaient importés nulle part : retirés.

### 15/10/2026 — arbitrage crawl4ai → litellm → openai ↔ instructor (PR #4126)

Avant : 62 avis dans 5 paquets (crawl4ai 0.8.0, litellm 1.80.0 transitif, lxml 5.4.0,
lxml-html-clean 0.4.4, nltk 3.10.3). Toute version corrigée de litellm exige openai 2.x, que
refusait `instructor==1.7.9` (<2.0.0). Relèvement : `crawl4ai 0.9.5`, `openai 2.54.0`,
`instructor 1.13.0`, `lxml 6.1.3` et `lxml-html-clean 0.4.5` épinglés explicitement. Raison
détaillée et voie écartée : commentaire de `apps/ia/requirements.txt`. Le durcissement
« un seul tool_use » de `claude_service.py` vise désormais `instructor.processing.response`
(le shim `instructor.process_response` ne protégeait plus rien en 1.13).

Exclusions (`--ignore-vuln` dans `.github/workflows/ci.yml`, étape pip-audit) — sans correctif publié :

| ID                | Paquet                                          | Pourquoi non atteignable chez nous                                                                                           |
| ----------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `PYSEC-2026-3740` | nltk 3.10.3 (transitif de crawl4ai)             | API d'artefacts de modèle (TransitionParser, AveragedPerceptron…) jamais appelées ; nltk non chargé par l'import de crawl4ai |
| `PYSEC-2026-2447` | diskcache 5.6.3 (transitif d'instructor ≥ 1.13) | pickle lu depuis le cache, exige un accès en écriture au répertoire ; aucun cache instructor activé                          |

⚠️ Angle mort assumé : crawl4ai ≥ 0.8.8 tire `unclecode-litellm==1.81.13`, fork de litellm
qui installe le module `litellm` mais que pip-audit ne rapproche pas des avis litellm. Ces avis
visent surtout le serveur proxy (`litellm/proxy`), jamais lancé ; crawl4ai n'utilise litellm
que pour ses stratégies d'extraction LLM, absentes de `crawl_browser_tier.py`, et l'import de
crawl4ai ne charge pas `litellm`. À revoir à chaque relèvement de crawl4ai.
