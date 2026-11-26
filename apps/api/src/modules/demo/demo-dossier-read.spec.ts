import {
  ACCOUNT_SCORE_MIN_EVALUATED_AXES,
  DOSSIER_SCORE_AXES,
  computeDossierScore,
  orderedDossierAxes,
  parseAccountAnalysis,
} from '@bellum/contracts'
import {
  DEMO_DOSSIER_AXES_COUNT_COVERAGE,
  DEMO_DOSSIER_NO_GO_COVERAGE,
  DEMO_DOSSIER_PROFILE_INCOMPLETE_COVERAGE,
  DEMO_DOSSIER_SCORE_CAP_COVERAGE,
} from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #2118 — parité démo de la lecture du dossier (craft rule n°9).
 *
 * Le lien de démonstration est ce qu'un prospect voit du produit : un écran
 * livré mais vide s'y découvre en réunion, pas en CI. Le score décomposé est
 * précisément le bloc qu'on montre en premier.
 *
 * La garde vérifie deux choses que l'œil ne voit pas : que le bloc seedé PASSE
 * le contrat (une clé de travers et `parseAccountAnalysis` le rendrait `null`,
 * donc l'écran serait vide sans erreur), et qu'un axe non mesuré n'abaisse pas
 * le score du dossier de démonstration.
 */

type Dossier = { account?: { company_name?: string; raw_analysis?: unknown } }

function dossiersWithRead() {
  return (DEMO_DOSSIERS as unknown as Dossier[])
    .map(dossier => ({
      // #2118.45-47 — `company_name`, jamais un `.name` qui n'existe pas sur
      // `DemoDossier` : la version précédente retombait toujours sur '?', ce
      // qu'aucun test n'exerçait jusqu'à celui qui cible le compte no-go par nom.
      name: dossier.account?.company_name ?? '?',
      read: parseAccountAnalysis(dossier.account?.raw_analysis).evaluation?.dossier_read ?? null,
    }))
    .filter((entry): entry is { name: string; read: NonNullable<typeof entry.read> } => entry.read != null)
}

describe('#2118 — la lecture du dossier est seedée en démonstration', () => {
  it('au moins deux dossiers de démonstration la portent', () => {
    expect(dossiersWithRead().length).toBeGreaterThanOrEqual(2)
  })

  it('un dossier montre les SEPT axes nommés, jamais un chiffre nu', () => {
    const complete = dossiersWithRead().find(entry => (entry.read.axes ?? []).length === DOSSIER_SCORE_AXES.length)
    // Message porté par le commentaire, pas par `expect` : jest n'accepte pas
    // de second argument (vitest oui — la différence coûte un faux rouge).
    // Aucun dossier de démonstration ne montre les sept axes → cette ligne tombe.
    expect(complete).toBeDefined()
    expect(orderedDossierAxes(complete?.read.axes).map(axis => axis.key)).toEqual([...DOSSIER_SCORE_AXES])
    for (const axis of complete?.read.axes ?? []) {
      expect({ key: axis.key, impact: axis.impact }).toMatchObject({ impact: expect.any(String) })
      expect({ key: axis.key, lever: axis.lever }).toMatchObject({ lever: expect.any(String) })
    }
  })

  it('un dossier montre un axe NON mesuré, et ce dernier ne baisse pas la note', () => {
    const partial = dossiersWithRead().find(entry => (entry.read.axes ?? []).some(axis => axis.state === 'unknown'))
    // Aucun dossier ne montre « non mesuré » → la doctrine ne se démontre pas.
    expect(partial).toBeDefined()
    const axes = partial?.read.axes ?? []
    const score = computeDossierScore(axes)
    expect(score.kind).toBe('score')
    // Le dénominateur ne compte QUE les axes notés (GA-18 / GA-19).
    expect(score.outOf).toBe(axes.filter(axis => axis.state !== 'unknown').length * 5)
    expect(score.unknownAxes.length).toBeGreaterThan(0)
    for (const axis of axes) {
      if (axis.state === 'unknown') expect(axis.value ?? null).toBeNull()
    }
  })

  it('#4016.L9.a — CHAQUE dossier de démonstration a au moins deux axes notés : son score s’affiche avec son nombre d’axes', () => {
    expect(DEMO_DOSSIER_AXES_COUNT_COVERAGE.state).toBe('seede')
    const entries = dossiersWithRead()
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      const score = computeDossierScore(entry.read.axes)
      expect({ name: entry.name, kind: score.kind }).toEqual({ name: entry.name, kind: 'score' })
      expect(score.scoredAxes).toBeGreaterThanOrEqual(ACCOUNT_SCORE_MIN_EVALUATED_AXES)
    }
  })

  it('les blocs rédigés sont remplis, et ce qui manque est NOMMÉ', () => {
    const entries = dossiersWithRead()
    expect(entries.some(entry => entry.read.why_for_your_esn)).toBe(true)
    expect(entries.some(entry => entry.read.recommended_scope)).toBe(true)
    expect(entries.some(entry => entry.read.anti_advice?.what && entry.read.anti_advice?.why)).toBe(true)
    expect(entries.some(entry => (entry.read.obstacles ?? []).length > 0)).toBe(true)
    expect(entries.some(entry => entry.read.next_action?.label)).toBe(true)
    expect(entries.some(entry => entry.read.reliability?.quality)).toBe(true)
    expect(entries.some(entry => (entry.read.missing ?? []).some(item => item.label))).toBe(true)
    expect(entries.some(entry => entry.read.best_entry_point?.label)).toBe(true)
  })

  it('aucun dossier de démonstration ne déclare un no-go définitif', () => {
    for (const entry of dossiersWithRead()) {
      if (entry.read.no_go) expect(entry.read.no_go.temporary).toBe(true)
    }
  })
})

/**
 * #2118.45-47 — LE COMPTE QUI SAIT DIRE NON, ET LA PREUVE QU'IL LE DIT.
 *
 * `demo-coverage.ts` classe `no_go` en SEEDÉ (`DEMO_DOSSIER_NO_GO_COVERAGE`) ;
 * cette suite est ce qui rend l'affirmation vérifiable — elle relit le compte
 * qui PORTE le no_go, pas « un dossier quelconque ».
 *
 * RETRAIT DU 01/10/2026 (Louis), puis re-semis — le seul dossier qui portait ce
 * refus a quitté la salle ; le refus ne se re-sème PAS sur Société Générale,
 * SNCF ou Groupe BPCE (un `no_go` / `STOP` y contredirait leur lecture PRUDENT).
 * TotalEnergies le porte, tiré de son brief (hors IT, aucun budget de
 * prestation, cellule d'arrêt de Feyzin non nommée). Tant que la salle a moins
 * de six dossiers, ces gardes constatent l'attente ; à six, elles exigent le
 * no-go — c'est le cas aujourd'hui.
 */
const NO_GO_PENDING_UNTIL_DOSSIERS = 6

/** Le prédicat exact que « existe, et porte un no_go complet » applique au
 *  compte réel — extrait pour pouvoir aussi le faire échouer (ligne
 *  suivante), sans muter `demo-dataset.ts` pour le prouver. */
function isCompleteNoGo(
  noGo: { temporary?: boolean; context?: string | null; trigger?: string | null } | null | undefined,
) {
  return noGo?.temporary === true && (noGo.context ?? '').trim().length > 40 && (noGo.trigger ?? '').trim().length > 20
}

describe('#2118.45-47 — le compte no-go porte un refus honnête', () => {
  const noGoEntry = dossiersWithRead().find(entry => entry.read.no_go != null)
  const pending = noGoEntry === undefined && DEMO_DOSSIERS.length < NO_GO_PENDING_UNTIL_DOSSIERS

  it('un compte no-go existe — ou la salle n’a pas encore ses six dossiers (BLOQUÉ, jamais déclassé)', () => {
    expect(noGoEntry !== undefined || pending).toBe(true)
  })

  it('la couverture classe `no_go` SEEDÉ, avec une raison qui tient', () => {
    expect(DEMO_DOSSIER_NO_GO_COVERAGE.state).toBe('seede')
    expect(DEMO_DOSSIER_NO_GO_COVERAGE.reason.length).toBeGreaterThan(60)
  })

  it('classe aussi `profile_incomplete` — vide à dessein, et la raison est ÉCRITE', () => {
    // Craft rule n°9 : une nouveauté est soit seedée, soit vide à dessein AVEC
    // sa raison. Sans cette assertion, l'entrée pourrait rester un commentaire
    // que personne ne lit — le défaut n°1 du dépôt, vu par l'autre bout.
    expect(DEMO_DOSSIER_PROFILE_INCOMPLETE_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_DOSSIER_PROFILE_INCOMPLETE_COVERAGE.reason.length).toBeGreaterThan(60)
  })

  it('ne lève PAS `profile_incomplete` sur les dossiers de démonstration', () => {
    const dossiers = dossiersWithRead()
    // Le corpus D'ABORD : sans cette ligne, l'assertion suivante resterait
    // verte sur zéro dossier et ne prouverait rien.
    // #2118 — deux : Société Générale et SNCF portent `dossier_read` (Groupe
    // BPCE, importé d'un relevé, n'a pas de lecture évaluée).
    expect(dossiers.length).toBeGreaterThanOrEqual(2)
    const leves = dossiers.filter(entry => entry.read.profile_incomplete === true)
    expect(leves.map(entry => entry.name)).toEqual([])
  })

  it('existe, et porte un no_go complet : temporaire, un contexte, un déclencheur', () => {
    if (pending) return
    expect(noGoEntry).toBeDefined()
    const noGo = noGoEntry?.read.no_go
    expect(noGo).toBeDefined()
    expect(isCompleteNoGo(noGo)).toBe(true)
    // Le détail, pour que le message d'échec dise LEQUEL des trois manque.
    expect(noGo?.temporary).toBe(true)
    expect((noGo?.context ?? '').trim().length).toBeGreaterThan(40)
    expect((noGo?.trigger ?? '').trim().length).toBeGreaterThan(20)
  })

  it('ses axes non évaluables sont SANS NOTE et sortent du dénominateur', () => {
    if (pending) return
    const axes = noGoEntry?.read.axes ?? []
    const unknown = axes.filter(axis => axis.state === 'unknown')
    // Contrepartie : si personne n'est `unknown` sur ce compte précis, la
    // règle « non mesuré n'est jamais 0 » ne se démontre pas ICI.
    expect(unknown.length).toBeGreaterThan(0)
    for (const axis of unknown) expect(axis.value ?? null).toBeNull()

    const score = computeDossierScore(axes)
    expect(score.kind).toBe('score')
    const measured = axes.filter(axis => axis.state !== 'unknown')
    expect(measured.length).toBeGreaterThanOrEqual(3)
    expect(score.outOf).toBe(measured.length * 5)
    expect(score.unknownAxes.length).toBe(unknown.length)
  })

  it('#2306.30 — son `accessibilite` inconnue PLAFONNE le score (`cappedBy`), et la couverture le classe SEEDÉ', () => {
    expect(DEMO_DOSSIER_SCORE_CAP_COVERAGE.state).toBe('seede')
    expect(DEMO_DOSSIER_SCORE_CAP_COVERAGE.reason.length).toBeGreaterThan(60)
    if (pending) return
    const score = computeDossierScore(noGoEntry?.read.axes ?? [])
    expect(score.cappedBy).toContain('accessibilite')
  })

  it('sait dire NON — un déclencheur retiré, ou un contexte vide, ne passe pas', () => {
    // Contrepartie obligatoire (doctrine des gardes) : la preuve doit pouvoir
    // ÉCHOUER. (Sans compte no-go dans la salle, la preuve se fait sur un
    // no_go synthétique.) Vérifié à la main pendant l'écriture de ce lot en vidant
    // `demo-dataset.ts` (`trigger: ''`) : la garde ci-dessus tombait bien —
    // exactement sur cette assertion, jamais sur une autre. Ici, la même
    // preuve sans toucher au jeu de données réel.
    const real = noGoEntry?.read.no_go ?? {
      temporary: true,
      context: 'Aucun signal d’achat externe sur la période de veille, lecture datée de nos sources.',
      trigger: 'Un poste d’achats informatiques publié, ou un appel d’offres.',
    }
    expect(isCompleteNoGo(real)).toBe(true)
    expect(isCompleteNoGo({ ...real, trigger: '' })).toBe(false)
    expect(isCompleteNoGo({ ...real, context: '' })).toBe(false)
    expect(isCompleteNoGo({ ...real, temporary: false })).toBe(false)
  })
})

/**
 * #2118 — LA GARDE QUI SAIT DIRE NON SUR LE CONTRAT DES AXES LUI-MÊME.
 *
 * Deux règles ne sont vérifiées nulle part ailleurs sur les données de
 * démonstration : qu'un axe `unknown` NE PORTE JAMAIS de note (GA-18/GA-19 —
 * le contrat Zod le refuse déjà à l'écriture, mais rien ici ne prouvait que
 * la donnée seedée le respecte), et que les axes présentés sont EXACTEMENT
 * les sept de `DOSSIER_SCORE_AXES` — ni un de moins, ni un étranger au
 * contrat glissé par erreur.
 */
type AxisLike = { key: string; state?: string; value?: number | null }

function axesRespectContract(axes: readonly AxisLike[] | null | undefined) {
  if (!axes || axes.length === 0) return false
  const keys = axes.map(axis => axis.key)
  const canonical: readonly string[] = DOSSIER_SCORE_AXES
  const exactlyTheSeven =
    keys.length === canonical.length &&
    new Set(keys).size === canonical.length &&
    keys.every(key => canonical.includes(key))
  if (!exactlyTheSeven) return false
  return axes.every(axis => axis.state !== 'unknown' || axis.value == null)
}

describe('#2118 — le contrat des sept axes se vérifie sur la donnée seedée, pas seulement à l’écriture', () => {
  it('chacun des dossiers de démonstration qui porte la lecture respecte le contrat', () => {
    const entries = dossiersWithRead()
    expect(entries.length).toBeGreaterThanOrEqual(2)
    for (const entry of entries) {
      expect(axesRespectContract(entry.read.axes)).toBe(true)
    }
  })

  it('sait dire NON — un axe `unknown` noté fait échouer la garde', () => {
    const real = dossiersWithRead()[0]?.read.axes ?? []
    expect(axesRespectContract(real)).toBe(true)
    const [firstAxis, ...restAxes] = real
    const brisé = [{ ...firstAxis, state: 'unknown', value: 3 }, ...restAxes]
    expect(axesRespectContract(brisé)).toBe(false)
  })

  it('sait dire NON — des axes qui ne sont pas les sept du contrat font échouer la garde', () => {
    const real = dossiersWithRead()[0]?.read.axes ?? []
    // Un axe en moins.
    expect(axesRespectContract(real.slice(0, -1))).toBe(false)
    // Un axe étranger au contrat, glissé à la place d'un axe canonique.
    const [, ...restAxes] = real
    const axeEtranger = [{ key: 'axe_invente_hors_contrat', state: 'measured', value: 3 }, ...restAxes]
    expect(axesRespectContract(axeEtranger)).toBe(false)
  })
})
