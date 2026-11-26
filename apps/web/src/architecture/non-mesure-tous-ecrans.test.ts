import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * GA-18 / GA-19 étendues à TOUS les écrans — #3777 / #3680.5 (décision Louis
 * 15/10, QCM n°8 : l'audit « non mesuré ≠ 0 » ne se limite plus aux fiches
 * compte / contact / besoin, que `fiches-absence-is-not-zero.test.ts` tient).
 *
 * Même règle, corpus élargi : tout `apps/web/src` hors fiches (déjà tenues par
 * la garde sœur). Un `?? 0` / `|| 0` y est INTERDIT, sauf (a) un idiome de
 * calcul interne ou de COMPTE (zéro élément est vrai), (b) une entrée de la
 * liste blanche avec sa RAISON écrite. Ajouter une entrée = écrire pourquoi
 * zéro est VRAI ou pourquoi rien n'est affiché ; jamais pour « faire passer ».
 */

const SRC = join(__dirname, '..')
/** Les fiches compte / contact : tenues par `fiches-absence-is-not-zero.test.ts`. */
const FICHES = [join(SRC, 'features', 'accounts'), join(SRC, 'features', 'contacts')]
/** Ni les tests, ni les gardes, ni les fixtures de démo ne sont des écrans. */
const EXCLUDED_DIRS = [join(SRC, 'architecture'), join(SRC, 'features', 'demo'), ...FICHES]

interface AllowedZero {
  readonly file: string
  readonly fragment: string
  readonly reason: string
}

const ALLOWED: readonly AllowedZero[] = [
  {
    file: 'FirstImportProgress.tsx',
    fragment: 'entry.conflicts ?? 0',
    reason:
      'somme des écarts nommés par objet ; la ligne n’existe que si la somme est > 0, un objet non mesuré n’ajoute rien et rien ne s’affiche « 0 »',
  },
  { file: 'DevStatusBar.tsx', fragment: 'perf.memory || 0', reason: 'barre de DEV, jamais montée en production' },
  { file: 'DevStatusBar.tsx', fragment: 'fcp ?? 0', reason: 'barre de DEV, jamais montée en production' },
  {
    file: 'TimelinePanel.tsx',
    fragment: 'engagement.total ?? 0',
    reason: 'COUNT d’activités ; l’état `empty` (aucune donnée) masque la phrase',
  },
  { file: 'AgendaGrid.tsx', fragment: 'offsetPercent(', reason: 'position CSS d’un trait, jamais un chiffre lu' },
  {
    file: 'LauraDock.tsx',
    fragment: 'useRef(openRequest?.seq ?? 0)',
    reason: '#4309.1 — numéro de séquence interne d’une demande d’ouverture, jamais affiché',
  },
  {
    file: 'useCredits.ts',
    fragment: 'accounts_used ?? 0',
    reason: 'champs requis côté serveur ; repli ne garde qu’une réponse mal formée',
  },
  {
    file: 'useCredits.ts',
    fragment: 'accounts_limit ?? 0',
    reason: 'champs requis côté serveur ; repli ne garde qu’une réponse mal formée',
  },
  {
    file: 'useCredits.ts',
    fragment: 'enrichment_credits ?? 0',
    reason: 'champs requis côté serveur ; repli ne garde qu’une réponse mal formée',
  },
  {
    file: 'hero.ts',
    fragment: 'overdueCount ?? 0',
    reason: 'tâches servies seulement (`tasksServed`) : compte COUNT réel',
  },
  {
    file: 'sinceLastVisit.ts',
    fragment: 'totalItems ?? 0',
    reason: 'total de pagination ; l’état de chargement est porté à part',
  },
  { file: 'api.ts', fragment: 'position ?? 0', reason: 'clé de cache de requête' },
  { file: 'api.ts', fragment: 'getStatus?.() ?? 0', reason: 'code HTTP d’erreur, jamais affiché' },
  {
    file: 'ChainsPage.tsx',
    fragment: 'slowest?.days ?? 0',
    reason: 'indice rendu seulement si `slowestStepLabel` existe (mesuré)',
  },
  {
    file: 'chat-scope.ts',
    fragment: 'conversationCounts[account.id] ?? 0',
    reason: 'COMPTE de fils de conversation : zéro est vrai',
  },
  { file: 'Chat.tsx', fragment: 'counts[thread.account_id] ?? 0', reason: 'accumulateur de COUNT' },
  {
    file: 'ContextDisclosure.tsx',
    fragment: 'signals_count ?? 0',
    reason: 'prédicat `> 0` : rien n’est affiché si absent',
  },
  { file: 'laura-home-suggestions.ts', fragment: 'portfolioCount ?? 0', reason: 'prédicat `> 0`' },
  { file: 'reply-badges.ts', fragment: 'count ?? 0', reason: 'prédicat `> 0`' },
  {
    file: 'useVoiceMode.ts',
    fragment: 'session.peak ?? 0',
    reason: 'maximum courant d’un niveau audio, calcul interne',
  },
  {
    file: 'AuditMaturityAxes.tsx',
    fragment: 'axis.score ?? 0',
    reason: 'largeur de barre ; le score nu est rendu par UnknownValue',
  },
  {
    file: 'maturity-axes.ts',
    fragment: 'axis.score ?? 0',
    reason: 'somme sur les seuls axes évalués (filtre en amont)',
  },
  {
    file: 'tension-detectors.ts',
    fragment: 'availabilityUnknown ?? 0',
    reason: 'COMPTE d’inconnus : alimente un détecteur, zéro est vrai',
  },
  {
    file: 'ConsultantsPage.tsx',
    fragment: 'data?.total ?? 0',
    reason: 'total de pagination ; chargement porté par isLoading',
  },
  { file: 'TalentSelectionBar.tsx', fragment: 'total ?? 0', reason: 'comparaison `reachable <`, jamais rendu' },
  { file: 'vivierTableColumns.ts', fragment: 'minPx ?? 0', reason: 'largeur de colonne en pixels' },
  {
    file: 'useCheckout.ts',
    fragment: 'extra_seats ?? 0',
    reason: 'paramètre ENVOYÉ (sièges en plus) : aucun siège demandé = 0',
  },
  {
    file: 'credit-breakdown.ts',
    fragment: 'topup_analyses ?? 0',
    reason: 'recharge absente = pas de recharge, décomposée à côté du total',
  },
  { file: 'credits-alert.ts', fragment: 'accounts_limit ?? 0', reason: 'seuil d’alerte, calcul interne' },
  { file: 'credits-alert.ts', fragment: 'accounts_used ?? 0', reason: 'seuil d’alerte, calcul interne' },
  {
    file: 'discover-filters.ts',
    fragment: '?? 0',
    reason: 'filtres : bornes et prédicats `> 0` sur des comptes, jamais rendus',
  },
  {
    file: 'discover-normalize.ts',
    fragment: 'proxy.contribution) ?? 0',
    reason: 'contribution d’un facteur de score dont le poids est nommé à part',
  },
  {
    file: 'discover-normalize.ts',
    fragment: 'correction.delta) ?? 0',
    reason: 'delta de correction : absent = pas de correction',
  },
  {
    file: 'discover-ranking.ts',
    fragment: 'points ?? 0',
    reason: 'points d’un bloc ; un bloc non évalué sort du dénominateur plus bas',
  },
  {
    file: 'discover-ranking.ts',
    fragment: 'axis.score ?? 0',
    reason: 'somme sur les seuls axes mesurés (`enough` + filtre)',
  },
  { file: 'discover-saved-searches.ts', fragment: 'Date.parse(view.createdAt) || 0', reason: 'clé de tri' },
  {
    file: 'CoverageNotice.tsx',
    fragment: '?? 0',
    reason: 'bandeau muet sans `notExamined` ; les lignes de détail sont gardées par `> 0`',
  },
  {
    file: 'FitBadge.tsx',
    fragment: 'breakdown.max ?? 0',
    reason: 'max nul seulement si score nul : ScoreWithAxes rend alors « non mesuré »',
  },
  { file: 'guide-body-markup.ts', fragment: 'match.index ?? 0', reason: 'index de regex' },
  { file: 'ImportWizard.tsx', fragment: 'acc[row.reason] ?? 0', reason: 'accumulateur de COUNT' },
  {
    file: 'useMetricSeries.ts',
    fragment: 'monthsCovered ?? 0',
    reason: 'COUNT de mois couverts ; zéro = aucune série, la série vide ne dessine rien',
  },
  { file: 'planning-conflicts.ts', fragment: 'toDayNumber(', reason: 'clé de TRI — rien n’est affiché' },
  {
    file: 'MissionCostSourceForm.tsx',
    fragment: 'num(',
    reason: 'somme d’un formulaire de saisie : champ vide = rien saisi',
  },
  { file: 'MissionMarginEngine.tsx', fragment: 'Number(values[key] ?? 0)', reason: 'valeur de formulaire de saisie' },
  { file: 'MissionsEmptyState.tsx', fragment: '?.count ?? 0', reason: 'prédicat de choix du message d’état vide' },
  {
    file: 'PlanningPage.tsx',
    fragment: 'intercontractCount ?? 0',
    reason: 'COMPTEUR du vivier balayé (COUNT), même exemption que le commentaire du fichier',
  },
  { file: 'PlanningPage.tsx', fragment: 'clientWidth ?? 0', reason: 'mesure DOM' },
  {
    file: 'TimesheetsPage.tsx',
    fragment: 'line.gap ?? 0',
    reason: '`gapKind` under/over implique un écart non null ; `unknown` est traité à part',
  },
  { file: 'OnboardingBusinessUnitStep.tsx', fragment: '|| 0', reason: 'somme de champs de saisie' },
  { file: 'QuestionField.tsx', fragment: 'question.min ?? 0', reason: 'borne d’un champ de saisie' },
  {
    file: 'existing-offer.ts',
    fragment: '?? 0',
    reason: 'prédicat `> 0` et copie de quota requis côté serveur, jamais rendu nu',
  },
  {
    file: 'DeliverabilityBlock.tsx',
    fragment: '?? 0',
    reason: 'chargement/réponse partielle : le bloc dit « Aucun envoi mesuré », il n’affiche aucun 0',
  },
  {
    file: 'ProfileContextVersions.tsx',
    fragment: 'target?.version ?? 0',
    reason: 'dialogue de confirmation ouvert sur une version choisie : `target` existe',
  },
  { file: 'project-primary-action.ts', fragment: 'interview_count ?? 0', reason: 'prédicat `> 0`' },
  {
    file: 'need-discovery-rails.ts',
    fragment: 'positioned_consultants_count ?? 0',
    reason: 'COUNT servant à `othersCount > 0` : rien n’est affiché à zéro',
  },
  {
    file: 'need-staffing.ts',
    fragment: 'byStage.',
    reason: 'COUNT par étape du funnel ; la bande reçoit `null` pendant chargement/erreur',
  },
  { file: 'OpenNeedsPage.tsx', fragment: '?? 0', reason: 'total de pagination et prédicat de pool vide' },
  { file: 'watchlist.ts', fragment: 'change_count ?? 0', reason: 'COUNT de changements ; lu seulement à `> 0`' },
  { file: 'watchlist.ts', fragment: 'signalSortMs(', reason: 'clé de TRI' },
  { file: 'normalize.ts', fragment: '|| 0', reason: 'normalisation du PDF compte : score déjà évalué en amont' },
  {
    file: 'analysis-subscription.ts',
    fragment: 'percent ?? 0',
    reason: 'progression d’une barre, jamais un chiffre de mesure',
  },
  { file: 'analysis-wait.ts', fragment: 'syncedAt ?? 0', reason: 'horodatage de vie, calcul interne' },
  { file: 'analysisStore.ts', fragment: 'syncedAt ?? 0', reason: 'horodatage de vie, calcul interne' },
  { file: 'socket.ts', fragment: 'size ?? 0', reason: 'taille d’un Set de handlers' },
  { file: 'transient-retry.ts', fragment: 'delays[attempt] ?? 0', reason: 'délai de reprise' },
  {
    file: 'SkillSearch.tsx',
    fragment: 'notAttempted ?? 0',
    reason:
      'sélecteur de pluriel : 0 choisit la forme `deadlineCut_zero` (« des offres restent à lire »), jamais un « 0 » affiché',
  },
]

/** Replis qui sont des COMPTES ou des prédicats : zéro élément est vrai. */
const COUNT_IDIOMS = [/\.length \?\? 0/, /\.get\(.*\) \?\? 0/, /\.size \?\? 0/, /selectionStart \?\? 0/]

const ZERO_FALLBACK = /(\?\?|\|\|) 0(?![\d.])/

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (EXCLUDED_DIRS.includes(full)) continue
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry) || /\.(test|spec)\.tsx?$/.test(entry) || entry.endsWith('.d.ts')) continue
    out.push(full)
  }
  return out
}

function unjustifiedZeroFallbacks(file: string, source: string): string[] {
  return stripComments(source)
    .split('\n')
    .filter(line => ZERO_FALLBACK.test(line))
    .filter(line => !COUNT_IDIOMS.some(idiom => idiom.test(line)))
    .filter(line => !ALLOWED.some(allowed => file.endsWith(allowed.file) && line.includes(allowed.fragment)))
    .map(line => line.trim())
}

describe('GA-18/19 étendues à TOUS les écrans : une valeur absente ne s’affiche jamais « 0 »', () => {
  const files = sourceFiles(SRC)

  it('aucun `?? 0` / `|| 0` sans excuse écrite hors des fiches', () => {
    const offenders = files.flatMap(file =>
      unjustifiedZeroFallbacks(file, readFileSync(file, 'utf8')).map(line => `${relative(SRC, file)} : ${line}`),
    )
    expect(offenders).toEqual([])
  })

  it('la garde lit bien les écrans — un corpus vide passerait au vert pour toujours', () => {
    expect(files.length).toBeGreaterThan(500)
    expect(files.some(file => file.endsWith('TrajectoryVerdict.tsx'))).toBe(true)
    // Retrait décidé par Louis 31/10 (revient sur #4632) : la section « Marché observé » n'existe plus.
    expect(files.some(file => file.endsWith('MarketObservedSection.tsx'))).toBe(false)
    expect(files.some(file => file.endsWith('MissionDossierPage.tsx'))).toBe(true)
    expect(files.some(file => file.endsWith('TabNeeds.tsx'))).toBe(false)
  })

  it('chaque entrée de la liste blanche pointe une ligne qui existe encore (pas de dispense périmée)', () => {
    const stale = ALLOWED.filter(
      allowed =>
        !files.some(
          file => file.endsWith(allowed.file) && stripComments(readFileSync(file, 'utf8')).includes(allowed.fragment),
        ),
    ).map(allowed => `${allowed.file} : « ${allowed.fragment} » n’existe plus — retire l’entrée`)
    expect(stale).toEqual([])
  })

  it('sait dire NON : un coupable factice est attrapé, un compte ne l’est pas', () => {
    const guilty = 'const label = t("x", { value: revenue.achieved ?? 0 })\nconst alt = score || 0'
    expect(unjustifiedZeroFallbacks('Faux.tsx', guilty)).toHaveLength(2)
    const innocent = 'const n = (items?.length ?? 0) + (counts.get(key) ?? 0)\n// result.achieved ?? 0 en commentaire'
    expect(unjustifiedZeroFallbacks('Faux.tsx', innocent)).toEqual([])
  })
})

/**
 * #3777.14 (Louis 15/10) — le repli littéral « 0 » EN TEXTE (`?? '0'`, `|| "0"`) est la même faute que
 * `?? 0`, écrite pour échapper à la garde ci-dessus : il se rend tel quel à l'écran. Corpus : TOUT
 * `apps/web/src`, fiches comprises (les deux gardes sœurs lisent le numérique ; celle-ci lit le texte).
 */
const ZERO_TEXT_FALLBACK = /(\?\?|\|\|)\s*['"`]0['"`]/

function allScreenFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (full === join(SRC, 'architecture')) continue
    if (statSync(full).isDirectory()) {
      out.push(...allScreenFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry) || /\.(test|spec)\.tsx?$/.test(entry) || entry.endsWith('.d.ts')) continue
    out.push(full)
  }
  return out
}

describe('GA-18/19 — le repli « 0 » écrit en texte est interdit partout', () => {
  const files = allScreenFiles(SRC)

  it('aucun `?? "0"` / `|| \'0\'` dans tout apps/web/src', () => {
    const offenders = files.flatMap(file =>
      stripComments(readFileSync(file, 'utf8'))
        .split('\n')
        .filter(line => ZERO_TEXT_FALLBACK.test(line))
        .map(line => `${relative(SRC, file)} : ${line.trim()}`),
    )
    expect(offenders).toEqual([])
  })

  it('le corpus inclut les fiches (accounts, contacts) et les écrans', () => {
    expect(files.some(file => file.includes(join('features', 'accounts')))).toBe(true)
    expect(files.some(file => file.includes(join('features', 'contacts')))).toBe(true)
    expect(files.length).toBeGreaterThan(900)
  })

  it('sait dire NON : un repli texte est attrapé, un « 0 » légitime ne l’est pas', () => {
    expect(ZERO_TEXT_FALLBACK.test("const label = revenue ?? '0'")).toBe(true)
    expect(ZERO_TEXT_FALLBACK.test('const label = String(score || "0")')).toBe(true)
    expect(ZERO_TEXT_FALLBACK.test("const pad = value.padStart(2, '0')")).toBe(false)
    expect(ZERO_TEXT_FALLBACK.test("const digits = raw.replace(/0/g, '')")).toBe(false)
  })
})

/**
 * #4436.3 — recette prod 22/10 : 6 cartes sur 10 de /discover disaient « 0 salarié »
 * (SONACA, un grand groupe). Le « 0 » ne s'écrivait dans AUCUN `.tsx` : il venait
 * du LIBELLÉ de la tranche INSEE « 00 » (apps/ia), que les gardes ci-dessus, qui
 * ne lisent que apps/web/src, ne pouvaient pas voir. « 00 » = aucun effectif au
 * 31/12, pas « zéro mesuré » : il ne s'affiche pas, la carte dit « taille non publiée ».
 */
describe('GA-18/19 — un libellé d’effectif « 0 salarié » ne sort pas du registre', () => {
  const IA_FILTERS = join(SRC, '..', '..', 'ia', 'app', 'services', 'company_filters.py')
  const ZERO_LABEL = /^\s*"[^"]+":\s*"(?:0|aucun)\s+salari/i

  /** Les codes de tranche dont le libellé est un « 0 salarié » ET qui ne sont pas retirés de l'affichage. */
  function displayedZeroLabels(source: string): string[] {
    const undisplayable = /_UNDISPLAYABLE_TRANCHES\s*=\s*frozenset\(\{([^}]*)\}\)/.exec(source)?.[1] ?? ''
    return source
      .split('\n')
      .filter(line => ZERO_LABEL.test(line))
      .map(line => /"([^"]+)"/.exec(line)?.[1] ?? '')
      .filter(code => !undisplayable.includes(`"${code}"`))
  }

  it('la tranche « 00 » est retirée de l’affichage (`_UNDISPLAYABLE_TRANCHES`)', () => {
    expect(displayedZeroLabels(readFileSync(IA_FILTERS, 'utf8'))).toEqual([])
  })

  it('sait lire (le libellé « 00 » existe) et dire NON (un « 0 salarié » affichable est attrapé)', () => {
    const source = readFileSync(IA_FILTERS, 'utf8')
    expect(source.split('\n').some(line => ZERO_LABEL.test(line))).toBe(true)
    expect(displayedZeroLabels('    "00": "0 salarié",\n')).toEqual(['00'])
    expect(displayedZeroLabels('    "01": "1 à 2 salariés",\n')).toEqual([])
  })
})
