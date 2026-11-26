/**
 * Le partage des suites web entre les deux environnements de test — à UN seul
 * endroit (GA-26 : un réglage vit à un seul endroit), parce que deux listes qui
 * se répondent divergent.
 *
 * ── Pourquoi deux projets ─────────────────────────────────────────────────
 * Mesuré le 16/09/2026 sur `src/architecture` (139 fichiers, 1 300 tests), même
 * machine, même corpus :
 *
 *   jsdom partout (l'état d'avant)  59,93 s — setup 58,60 s · environment 17,07 s
 *   projet `node` + setup minimal   35,58 s — setup 10,11 s · environment  2,32 s
 *
 * Soit −41 %, tous verts. Le temps d'une suite web n'est PAS dans ses tests (11 s sur 60,
 * soit 18 %) : il est dans le montage, PAR FICHIER, de jsdom + `@testing-library/
 * jest-dom` + le singleton i18n. Une garde d'architecture qui lit des fichiers
 * source sur le disque n'a besoin d'aucun des trois.
 *
 * ⚠️ Ce qui a été essayé et qui NE MARCHE PAS — mesuré, pour que personne ne le
 * retente (l'hypothèse écrite dans `.github/workflows/ci.yml` était fausse) :
 *
 *   • retirer `import '@/i18n'` de `setup.ts` : `setup` tombe de 5,77 s à
 *     0,24 s, mais `collect` monte de 2,74 s à 7,40 s et le TOTAL empire
 *     (5,73 → 6,08 s). Les composants importent l'i18n eux-mêmes ; le travail
 *     est déplacé, pas supprimé. Et 8 tests deviennent rouges.
 *   • retirer les 90 catalogues EN (1,1 Mo de JSON) : 0,7 s gagnées sur 5,77 s.
 *     Le poids des catalogues n'est pas le coût — leur montage répété l'est.
 *   • `isolate: false` : 54 tests rouges et PLUS lent (9,78 s). L'isolation
 *     porte quelque chose de réel, elle ne se retire pas.
 *
 * ── Comment on élargit ────────────────────────────────────────────────────
 * En ajoutant un glob à `NODE_PROJECT_INCLUDE`, puis en LANÇANT la suite : les
 * fichiers qui rougissent avec « document is not defined » rejoignent
 * `SUITES_NEEDING_DOM`. Le classement se MESURE, il ne se devine pas — une
 * heuristique par `grep` sur `document.` / `render(` s'est trompée sur ces 17
 * fichiers-là, qui rendent du JSX à travers un helper.
 *
 * Le défaut est jsdom : un fichier de test nouveau tombe dans le projet `jsdom`
 * sans que personne n'ait rien à faire. C'est le bon sens du défaut — se
 * tromper y coûte du temps, jamais un faux vert.
 *
 * ⚠️ CE QUE L'ÉLARGISSEMENT RAPPORTE VRAIMENT — mesuré le 16/09/2026, parce que
 * « −41 % » est le gain SUR CE PÉRIMÈTRE et pas sur le job. Répartition réelle,
 * comptée par `vitest list` : node 123 · jsdom 1 100 · gardes qui rendent 17,
 * soit exactement les 1 240 fichiers de la suite. **Le projet node ne porte donc
 * que 9,9 % du corpus, et le gain sur `Test (Web)` est d'environ 4 %.**
 *
 * `src/lib` + `src/i18n` ont été essayés le même jour : **14 fichiers rouges sur
 * 55**, pour +41 fichiers en node (13,2 % du corpus) et **+1,4 point** de gain
 * global. Quatorze exclusions de plus à tenir pour ça : refusé.
 *
 * Le seul élargissement qui vaudrait le coup est `src/features` (~314 candidats,
 * ~15 % de gain global), et il demande une liste explicite plutôt qu'un glob de
 * dossier. À faire quand aucune vague d'intégration n'écrit dedans.
 *
 * La conclusion qui compte : le temps de `Test (Web)` ne se RÈGLE pas, il
 * s'achète en cœurs. Voir `infra/ci-runner-vps/`.
 */

import { NODE_PUR_INCLUDE } from './tests-node.generated'

/** Le périmètre qui tourne sans DOM. Élargir ici, puis mesurer. */
export const NODE_PROJECT_INCLUDE = ['src/architecture/**/*.test.{ts,tsx}']

/**
 * Dans ce périmètre, celles qui ont RÉELLEMENT besoin du DOM — relevé le
 * 16/09/2026 en lançant `src/architecture` en environnement `node` : 17 fichiers
 * sur 139, 65 tests, causes `document is not defined` (50), `Element is not
 * defined` (5), `localStorage.setItem is not a function` (2).
 *
 * ⚠️ Un docblock `// @vitest-environment jsdom` NE SUFFIT PAS pour les sortir :
 * il change l'environnement mais pas les `setupFiles`, si bien que le fichier
 * garderait le setup minimal et n'aurait ni `jest-dom` ni le polyfill
 * localStorage. Il faut qu'ils soient dans l'autre PROJET.
 */
export const SUITES_NEEDING_DOM = [
  'src/architecture/account-invoice-readiness-absences-are-distinct.test.tsx',
  'src/architecture/capability-banner-is-the-only-shape.test.tsx',
  // #2436.5 / #2436.15 (GA-374) — monte `FormField`/`FormTextareaField` de
  // `@bellum/ui` pour lire l'association label/erreur dans le DOM rendu.
  'src/architecture/form-fields-associate-label-and-error.test.tsx',
  // #2436.16 (GA-377) — monte des fragments `@bellum/ui` réels pour les
  // auditer avec le moteur `axe-core`, qui a besoin d'un DOM.
  'src/architecture/critical-fields-pass-automated-a11y-audit.test.tsx',
  // #2436.4 (GA-378) — monte un `Dialog` réel, clique/tape au clavier, lit
  // `document.activeElement` : a besoin d'un DOM.
  'src/architecture/dialog-restores-focus-on-close.test.tsx',
  // #2593 — monte le routeur COMPLET (RouterProvider, QueryClientProvider,
  // ThemeProvider…) pour chaque route de premier niveau : a besoin d'un DOM,
  // comme le fait déjà `chat-nav-route.integration.test.tsx` hors de ce projet.
  'src/architecture/chaque-route-de-premier-niveau-survit-au-chargement-direct.test.tsx',
  'src/architecture/chat-conversations-panel-collapses.test.ts',
  // perf P3 — monte le gabarit racine (SessionContent) dans un routeur réel.
  'src/architecture/racine-sans-requete-avant-rendu.test.tsx',
  'src/architecture/connector-failure-names-the-capability.test.ts',
  'src/architecture/discover-filters-reach-the-search.test.tsx',
  'src/architecture/empty-states-name-what-happened.test.tsx',
  'src/architecture/laura-has-a-face.test.tsx',
  // #2472 — elle rend le lien « Découvrir » d'une réponse de Laura pour lire son
  // `href` : il n'y a pas d'autre façon de prouver que les critères voyagent.
  'src/architecture/le-passage-vers-decouvrir-nest-jamais-nu.test.tsx',
  'src/architecture/narrowing-has-a-way-out.test.tsx',
  'src/architecture/org-relation-verify-has-a-subject.test.ts',
  'src/architecture/pipe-total-one-verdict.test.tsx',
  'src/architecture/pipeline-total-carries-its-label.test.tsx',
  // Ajoutée par la vague 13, après l'écriture de cette liste : elle monte un
  // hook avec `renderHook`, donc elle a besoin d'un DOM. Classée dans le projet
  // `node` par défaut, elle rendait « document is not defined » — et seulement
  // en CI, parce que le test passe quand on le lance SEUL (vitest choisit alors
  // le projet qui l'inclut en dernier).
  'src/architecture/rbac-le-web-lit-le-role.test.tsx',
  'src/architecture/shortcuts-are-shown.test.tsx',
  'src/architecture/sidebar-carries-no-shortcut-caps.test.tsx',
  'src/architecture/suggestion-row-tells-homonyms-apart.test.tsx',
  'src/architecture/table-columns-stay-readable.test.tsx',
  'src/architecture/type-scale.test.ts',
  // #2613 — la garde SCORE du renversement de doctrine : elle MONTE
  // `ScoreWithAxes` et lit le DOM rendu (texte et infobulles) pour prouver
  // qu'un score énonce ses axes non évaluables. Classée par la MESURE, pas
  // devinée : en projet `node` elle rendait « document is not defined ».
  'src/architecture/un-score-dit-ses-axes-non-evaluables.test.tsx',
  'src/architecture/une-surcouche-prend-la-portee-de-laura.test.tsx',
  // Recette 07/10 — monte `RouterProvider` sur un routeur minimal pour
  // prouver un comportement RÉEL de TanStack Router (`document is not
  // defined` en projet `node`).
  // Recette 07/10 — monte le routeur COMPLET (`RouterProvider`, coquille
  // `__root.tsx`) sur une adresse hors catalogue : a besoin d'un DOM.
  'src/architecture/une-adresse-hors-catalogue-montre-introuvable.test.tsx',
]

/**
 * Le fuseau de TOUTE la suite, posé une fois par `vitest.config.ts` avant le
 * démarrage des workers. En pool `threads`, les fichiers d'un worker partagent
 * le process : Node met le fuseau en cache à la première `Date` rencontrée, et
 * une bascule de `process.env.TZ` en cours de fichier n'y change plus rien.
 * Un fuseau fixé en amont rend le résultat indépendant de l'ordre d'exécution
 * (et du poste : Paris sur un Mac, UTC sur un runner).
 */
export const SUITE_TIME_ZONE = 'Europe/Paris'

/**
 * Les suites qui BASCULENT le fuseau EN COURS DE TEST (`process.env.TZ = …` dans
 * un `it`, pour prouver qu'un même instant tombe ailleurs selon le fuseau du
 * navigateur). Seul un process à elles les laisse faire : elles tournent en
 * `forks`, un process par fichier. Tout fichier qui écrit `process.env.TZ` pour
 * AUTRE chose que `SUITE_TIME_ZONE` doit être listé ici — la garde
 * `le-fuseau-de-la-suite-est-fixe` le vérifie sur le disque.
 */
export const SUITES_NEEDING_OWN_PROCESS = ['src/features/chat/lib/thread-groups.test.ts']

/**
 * Les suites qui ne sont PAS stables sous happy-dom (le défaut des projets DOM,
 * voir `DOM_ENVIRONMENT` dans `vitest.config.ts`) et restent sur jsdom. Chaque entrée porte la mesure
 * qui l'a mise là.
 */
export const SUITES_NEEDING_REAL_JSDOM = [
  // Mesuré le 05/10/2026 : 2 rouges sur 10 lancements sous happy-dom
  // (`findByText('Contenu ancien')` introuvable dans « `?fresh=` depuis un fil
  // OUVERT »), 0 sur 10 sous jsdom. Le séquencement des rendus asynchrones
  // diffère ; un test qui rougit une fois sur cinq ne s'achète pas contre du temps.
  'src/features/chat/view/Chat.persistence.test.tsx',
  // Inventaire CI complet du 06/10/2026 (PR #3728, run 37375458552) : rouges sous
  // happy-dom, verts sous jsdom (presse-papiers en lecture seule, `null` au lieu
  // de `''`, appel réseau réel, mise en page non calculée…).
  'src/__tests__/pages.test.tsx',
  'src/components/navigation/TabNav.maskOverflow.test.tsx',
  'src/components/ui/ScoreCircle.test.tsx',
  'src/features/accounts/view/account-detail/components/sites/D3FranceMap.test.tsx',
  'src/features/accounts/view/account-detail/tabs/TabPartners.telemetryInert.test.tsx',
  'src/features/chat/lib/composer-draft.test.ts',
  'src/features/chat/view/PendingActions.test.tsx',
  'src/features/feedback/FeedbackWidget.test.tsx',
  'src/features/import/view/ImportMapping.test.tsx',
  'src/features/mailbox/view/DraftDialog.test.tsx',
  'src/features/missions/view/PoConsumptionBar.test.tsx',
  'src/features/outreach/hooks/useOutreachMutations.collision.test.tsx',
  'src/features/outreach/view/OutreachApprovalCenter.test.tsx',
  'src/features/projects/open-needs/view/NeedExternalSourcing.test.tsx',
  'src/features/settings/view/FinanceSettingsView.test.tsx',
  // #3803 (07/10/2026) — l'assainissement DOMPurify : le `DOMParser` de happy-dom
  // EXÉCUTE un `<script>` pendant l'analyse (« alert is not a function »), là où
  // un navigateur — et jsdom — ne l'exécute jamais. Mesuré : 1 rouge sur 1.
  'src/features/rag/preview/parsers.test.ts',
]

/** Tout ce que la suite web couvre, les deux projets confondus. */
export const ALL_SUITES_INCLUDE = ['src/**/*.test.{ts,tsx}', 'vite-plugins/**/*.test.ts']

/**
 * La décision, pour UN fichier, exprimée une fois — la config des deux projets
 * ET la garde `les-deux-projets-couvrent-la-suite` appellent CETTE fonction.
 * Une garde qui réimplémenterait la règle ne garderait que sa propre copie.
 *
 * @param relPath chemin relatif à `apps/web`, séparateurs POSIX
 */
export function belongsToNodeProject(relPath: string): boolean {
  if (SUITES_NEEDING_DOM.includes(relPath)) return false
  return NODE_PROJECT_INCLUDE.some(pattern => matchesGlob(relPath, pattern))
}

const GLOBSTAR_SLOT = '@@GLOBSTAR@@'

/**
 * Le sous-ensemble de la syntaxe glob que ces listes utilisent : `**` traverse
 * les dossiers, `*` reste dans un segment, `{a,b}` est une alternative. Écrit à
 * la main plutôt qu'ajouté en dépendance — ce module est chargé par la config
 * vitest, donc avant que quoi que ce soit de côté test ne soit résolu.
 */
const compiled = new Map<string, RegExp>()

export function matchesGlob(relPath: string, pattern: string): boolean {
  let regex = compiled.get(pattern)
  if (!regex) {
    regex = globToRegExp(pattern)
    compiled.set(pattern, regex)
  }
  return regex.test(relPath)
}

function globToRegExp(pattern: string): RegExp {
  const source = pattern
    .replace(/[.+^$()|[\]\\]/g, '\\$&')
    .replace(/\{([^}]*)\}/g, (_match, inner: string) => `(${inner.split(',').join('|')})`)
    .replace(/\*\*\//g, GLOBSTAR_SLOT)
    .replace(/\*/g, '[^/]*')
    .split(GLOBSTAR_SLOT)
    .join('(?:.*/)?')
  return new RegExp(`^${source}$`)
}

/**
 * ── Projet `node (pur)` (22/10/2026) ───────────────────────────────────────
 * Les `*.test.ts` hors `src/architecture` qui n'ont pas besoin du DOM : la liste
 * est GÉNÉRÉE par `scripts/classer-tests-node.mjs` (`tests-node.generated.ts`),
 * puis MESURÉE en lançant le projet. Environment node, setup minimal, et
 * l'isolation par fichier RESTE active : `isolate: false` (comme le projet
 * `node` des gardes) fait des rouges dès que des modules gardent un état.
 * Mesuré le 22/10/2026 (4 vCPU) : 761 fichiers / 8 884 tests, tous verts ; 41 autres
 * rouges en node (i18n FR, mocks de `setup.ts`, API navigateur) restent en DOM, motifs
 * dans le script. Lot de 100 fichiers, 2 passes : 78 s · 75 s en `node (pur)` contre
 * 123 s · 120 s en happy-dom (−38 %) — le montage DOM est ~40 % du temps d'un fichier
 * léger, pas 75 % : le reste est l'import du graphe, payé à chaque fichier (isolate).
 * Les projets DOM l'excluent : un fichier ne tourne ni deux fois, ni zéro fois
 * (garde `les-projets-couvrent-la-suite-une-seule-fois`).
 */
export const NODE_PUR_PROJECT_INCLUDE: string[] = NODE_PUR_INCLUDE

const COMMON_EXCLUDE = ['**/node_modules/**', '**/dist/**']

/**
 * Le périmètre (include / exclude) de CHAQUE projet, à un seul endroit : la
 * config vitest le lit, la garde de couverture le lit. Une garde qui
 * réimplémenterait la table ne garderait que sa propre copie.
 */
export const PROJECT_SCOPES = {
  node: { include: NODE_PROJECT_INCLUDE, exclude: [...SUITES_NEEDING_DOM] },
  'node (pur)': { include: NODE_PUR_PROJECT_INCLUDE, exclude: [...COMMON_EXCLUDE] },
  jsdom: {
    include: ALL_SUITES_INCLUDE,
    exclude: [
      ...COMMON_EXCLUDE,
      ...NODE_PROJECT_INCLUDE,
      ...NODE_PUR_PROJECT_INCLUDE,
      ...SUITES_NEEDING_OWN_PROCESS,
      ...SUITES_NEEDING_REAL_JSDOM,
    ],
  },
  'jsdom (jsdom réel)': { include: SUITES_NEEDING_REAL_JSDOM, exclude: [...COMMON_EXCLUDE] },
  'jsdom (process à part)': { include: SUITES_NEEDING_OWN_PROCESS, exclude: [...COMMON_EXCLUDE] },
  'jsdom (gardes qui rendent)': { include: SUITES_NEEDING_DOM, exclude: [...COMMON_EXCLUDE] },
} as const
