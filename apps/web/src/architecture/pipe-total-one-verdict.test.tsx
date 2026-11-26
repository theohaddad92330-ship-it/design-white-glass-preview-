import type { PipelineSummary, ProjectRow, SessionUser } from '@bellum/contracts'
import { render, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GA — LE PIPE N'A QU'UN SEUL VERDICT, SUR TOUS LES ÉCRANS.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Recette en production, 28/08/2026. L'espace portait **un projet au pipe, sans
 * montant saisi**. Sur cette donnée, à deux clics d'écart :
 *
 *  · `/briefing` affichait « 0 € » en gros, avec en petit « et 1 affaire sans
 *    montant — jamais comptée zéro » ;
 *  · `/projects` affichait « non mesuré — aucun montant saisi sur 1 projet au
 *    pipe ».
 *
 * Chacun tranchait chez lui, et chacun avait sa raison écrite au-dessus de son
 * code. C'est exactement ce que la loi 1 du tome 7 interdit : un réglage — ici,
 * une DÉRIVATION — vit à un seul endroit, sinon les deux chemins divergent. Ils
 * avaient divergé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, ET POURQUOI PAS UN COMPTAGE DE SOURCE
 * ─────────────────────────────────────────────────────────────────────────
 * Elle ne lit pas le code : elle REND les deux écrans sur la MÊME réponse et
 * compare ce qu'ils disent. Une garde de source (« les deux importent bien
 * `pipelineTotal` ») passerait au vert le jour où l'un d'eux l'importe et
 * l'ignore — le défaut « chemin d'écriture non branché », version affichage.
 *
 * Le verdict comparé n'est pas la phrase (les deux écrans n'ont pas le même
 * cadre : l'un dit « 0 € », l'autre « 0 € sur 0 projet au pipe ») mais la
 * NATURE de la réponse : est-ce un montant, ou une mesure absente ?
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ 04/09/2026 — L'UN DES DEUX ÉCRANS A DISPARU (#1394)
 * ─────────────────────────────────────────────────────────────────────────
 * Le brief ne rend plus le pipe : le retour #1394 disait qu'il « transforme
 * Aujourd'hui en deuxième Tableau de bord », et le pipe par étape est reparti
 * chez lui, dans `/projects`. La garde a rougi — et c'est ce qu'elle devait
 * faire.
 *
 * La réparation ÉVIDENTE aurait été de repointer la moitié disparue sur le
 * survivant : `PipelineKpis` est monté PAR `PipelineBoard`, donc la garde se
 * serait comparée à elle-même et serait repassée au vert **en ne lisant plus
 * rien**. C'est le piège payé au lot 8, et on ne le repaie pas.
 *
 * Ce qu'elle vérifie donc maintenant, et qui est la MÊME règle sur le paysage
 * d'aujourd'hui :
 *  1. l'écran qui reste rend les quatre verdicts justes — pipe non chiffré,
 *     partiellement chiffré, vide, colonne vide ; c'est tout ce que la garde
 *     lisait déjà de ce côté-là ;
 *  2. **le brief n'en rend AUCUN.** Un second verdict ne peut pas diverger du
 *     premier tant qu'il n'existe pas, et c'est ce test-là qui tombe le jour où
 *     quelqu'un remet un total de pipe sur le brief — avec ou sans
 *     `pipelineTotal`.
 */

/* ── Le cockpit et ses sources ────────────────────────────────────────────── */

const revenue = vi.fn()
const pipeline = vi.fn()
const missions = vi.fn()
const capacity = vi.fn()
const interventions = vi.fn()

// ⚠️ Faux PARTIEL : `cockpit.ts` importe `assigneeNames` du même module, et un
// faux exhaustif le ferait disparaître sous l'écran.
vi.mock('@/features/missions/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/missions/api')>()),
  useRevenue: () => revenue(),
  useMissions: () => missions(),
  useCapacity: (month: string) => capacity(month),
}))
vi.mock('@/features/projects/hooks/usePipeline', () => ({ usePipeline: () => pipeline() }))
vi.mock('@/features/playbooks/api', () => ({ useInterventions: () => interventions() }))
vi.mock('@/features/projects/hooks/useProjects', () => ({ useProjects: () => ({ data: [] }) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to ?? '#'}>{children}</a>,
}))

const { useCurrentUserStore } = await import('@/stores/currentUserStore')
const { MyActivityBlock } = await import('@/features/briefing/view/MyActivityBlock')
const { PipelineBoard } = await import('@/features/projects/view/PipelineBoard')

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

const ME: SessionUser = {
  id: 'moi',
  email: 'commercial@exemple.fr',
  created_at: '2026-01-01T00:00:00.000Z',
  roles: ['customer'],
}

const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false, error: null })

const MISSION = {
  id: 'm1',
  label: 'Refonte du SI paiement',
  account_id: 'a1',
  accountName: 'Cliente SA',
  status: 'active',
  started_on: '2026-06-01',
  ends_on: '2036-09-30',
  marginPercent: 22,
  assignees: [{ id: 'c-1', fullName: 'Salomé Dufour', photoUrl: null }],
}

/* ── Les trois pipes que la SOURCE distingue ──────────────────────────────── */

/**
 * UN projet au pipe, sans montant — la donnée exacte de la recette du 28/08.
 *
 * ⚠️ Une SEULE colonne, et c'est nécessaire : une colonne VIDE affiche « 0 € »
 * dans le cockpit, et c'est juste (`columnAmountCents` : zéro affaire vaut bien
 * zéro euro). En laisser une ici mettrait un « 0 € » dans le bloc et la garde
 * ne saurait plus dire d'où il vient.
 */
/**
 * Aucune affaire signée sur les quatre jeux d'essai.
 *
 * Ce n'est pas un remplissage : la question de CETTE garde est le verdict du
 * total OUVERT, et une ligne « Signé : … » à côté ferait entrer un second
 * montant dans les deux rendus qu'elle compare. Le signé a sa propre garde
 * (GA-73) ; ici il vaut zéro pour que le chiffre lu soit sans ambiguïté celui
 * du pipe. Zéro est VRAI ici : ces jeux d'essai n'ont aucune affaire signée.
 */
const NOTHING_SIGNED = { signed_count: 0, signed_amount_cents: 0, signed_without_amount: 0 } as const

const NOTHING_PRICED: PipelineSummary = {
  columns: [{ stage: 'qualified', label: 'Qualifié', count: 1, amount_cents: 0, without_amount: 1 }],
  intake: 0,
  signals: 0,
  total_count: 1,
  total_amount_cents: 0,
  total_without_amount: 1,
  ...NOTHING_SIGNED,
} as PipelineSummary

/** Des affaires chiffrées, et deux qui ne le sont pas : le total est un PLANCHER. */
const PARTLY_PRICED: PipelineSummary = {
  columns: [{ stage: 'qualified', label: 'Qualifié', count: 3, amount_cents: 4_500_000, without_amount: 2 }],
  intake: 0,
  signals: 0,
  total_count: 3,
  total_amount_cents: 4_500_000,
  total_without_amount: 2,
  ...NOTHING_SIGNED,
} as PipelineSummary

/** Rien au pipe : zéro euro est VRAI — il n'y a pas de mesure manquante. */
const EMPTY: PipelineSummary = {
  columns: [],
  intake: 0,
  signals: 0,
  total_count: 0,
  total_amount_cents: 0,
  total_without_amount: 0,
  ...NOTHING_SIGNED,
} as PipelineSummary

/**
 * Une colonne VIDE à côté d'une colonne chiffrée.
 *
 * C'est le cas que la recette du 28/08/2026 a sorti : `/briefing` écrivait
 * « 0 € » (vrai — la somme d'un ensemble vide vaut zéro) et `/projets`
 * « Aucun montant saisi », qui AFFIRME des affaires dont personne n'a saisi le
 * montant là où il n'y a aucune affaire.
 */
const EMPTY_COLUMN: PipelineSummary = {
  columns: [
    { stage: 'qualified', label: 'Qualifié', count: 1, amount_cents: 4_500_000, without_amount: 0 },
    { stage: 'need_expressed', label: 'Besoin exprimé', count: 0, amount_cents: 0, without_amount: 0 },
  ],
  intake: 0,
  signals: 0,
  total_count: 1,
  total_amount_cents: 4_500_000,
  total_without_amount: 0,
  ...NOTHING_SIGNED,
} as PipelineSummary

const projectRow = (over: Partial<ProjectRow> = {}): ProjectRow =>
  ({
    id: 'p-1',
    account_id: 'a-1',
    company_name: 'ACME',
    kind: 'pain',
    label: 'Migration data lake',
    source: 'pain',
    confidence: 'high',
    stage: 'qualified',
    stage_entered_at: '2026-08-01T00:00:00.000Z',
    first_detected_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    amount_cents: null,
    ...over,
  }) as ProjectRow

/* ── Rendre le MÊME pipe sur les deux écrans ──────────────────────────────── */

/**
 * Ce que le brief dit du pipe — c'est-à-dire RIEN depuis #1394.
 *
 * Il le LIT toujours (c'est ce qui distingue un espace neuf d'un espace calme),
 * il ne l'AFFICHE plus. La fonction rend le texte entier du bloc pour que les
 * tests puissent vérifier l'absence sur les quatre jeux d'essai, plutôt que sur
 * un seul.
 */
function briefingText(summary: PipelineSummary): string {
  pipeline.mockReturnValue(ok(summary))
  const { container } = render(<MyActivityBlock />)
  // La garde LIT quelque chose : le bloc est bien monté et non vide. Sans ce
  // contrôle, un composant qui aurait cessé de rendre ferait passer toutes les
  // vérifications d'absence ci-dessous au vert sur du vide.
  expect(container.textContent ?? '', 'le bloc « Mon activité » n’a rien rendu').not.toBe('')
  return container.textContent ?? ''
}

/**
 * Le total de `/projects` : le GROUPE « pipe ouvert HT » de la ligne de synthèse.
 *
 * #4499 (Louis 23/10/2026) — les quatre cartes sont devenues UNE ligne (`PipelineSummaryLine`) ; le total y garde
 * son groupe (montant, libellé, « estimation non pondérée », compteur des non chiffrés), et c'est ce groupe-là que
 * la garde lit — pas la ligne entière, qui porte aussi « N affaires dans cette vue ».
 *
 * ⚠️ La portée est la carte, plus « le premier enfant du tableau ». Depuis
 * #1324 la tête de l'écran est une grille de QUATRE cartes, et l'une d'elles —
 * « Sans prochaine action » — rend légitimement « non mesuré » quand le résumé
 * d'essai ne porte pas `without_next_action`. Lue sur la grille entière, cette
 * garde y voyait le verdict du TOTAL et tombait sur un pipe parfaitement
 * chiffré : elle mesurait la mauvaise carte.
 *
 * La règle qu'elle protège n'a pas bougé d'un mot — les deux écrans disent la
 * même chose du même total. C'est l'endroit où ce total se rend qui a changé.
 */
function boardTotal(summary: PipelineSummary): HTMLElement {
  const { container } = render(
    <PipelineBoard summary={summary} projects={summary.total_count > 0 ? [projectRow()] : []} onSelect={() => {}} />,
  )
  const label = within(container).getByText('pipe ouvert HT')
  const card = label.parentElement
  if (!card) throw new Error('le groupe « pipe ouvert HT » n’a pas de conteneur — la synthèse a changé de forme')
  return card as HTMLElement
}

/**
 * Le VERDICT rendu, tel qu'un lecteur le lit : un montant, ou une absence.
 *
 * ⚠️ « non mesuré » est cherché avant le montant : la phrase de `/projects`
 * porte les deux (« non mesuré — aucun montant saisi sur 1 projet au pipe ») le
 * jour où quelqu'un y remettrait un chiffre, et c'est précisément ce qu'on veut
 * voir tomber.
 */
function verdict(scope: HTMLElement): 'unmeasured' | 'amount' {
  const text = scope.textContent ?? ''
  if (/non mesuré/i.test(text)) return 'unmeasured'
  if (/€/.test(text)) return 'amount'
  throw new Error(`ni montant ni « non mesuré » dans : ${text}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  useCurrentUserStore.setState({ currentUser: ME })
  revenue.mockReturnValue(ok({ periodMonth: '2026-08-01', lines: [] }))
  // Une mission existe, et il en FAUT une : sans elle, un pipe vide bascule le
  // cockpit sur son écran « espace neuf » et il n'y aurait plus de total à
  // comparer — la garde passerait au vert sans avoir rien lu.
  missions.mockReturnValue(ok({ missions: [MISSION], canReadFinance: true }))
  capacity.mockImplementation((month: string) => ok({ periodMonth: `${month}-01`, availableDays: 10 }))
  interventions.mockReturnValue(ok([]))
})

describe('le pipe non chiffré — le verdict, là où il se rend', () => {
  it('« non mesuré », jamais « 0 € » — LE défaut du 28/08', () => {
    expect(verdict(boardTotal(NOTHING_PRICED))).toBe('unmeasured')
  })

  it('et il dit POURQUOI', () => {
    expect(boardTotal(NOTHING_PRICED).textContent).toMatch(/aucun montant saisi sur 1 projet au pipe/)
  })

  it('aucun « 0 € » nulle part', () => {
    expect(boardTotal(NOTHING_PRICED).textContent).not.toMatch(/0\s?€/)
  })
})

describe('le pipe chiffré — le cas honnête n’a pas bougé', () => {
  it('l’écran affiche le TOTAL, jamais « non mesuré »', () => {
    expect(verdict(boardTotal(PARTLY_PRICED))).toBe('amount')
    expect(boardTotal(PARTLY_PRICED).textContent).toMatch(/45\s?000/)
  })

  it('et il DIT ce qui manque au plancher', () => {
    expect(boardTotal(PARTLY_PRICED).textContent).toMatch(/2 affaires sans montant, hors total/)
  })
})

describe('le pipe VIDE — zéro euro est vrai, et ce n’est pas une absence', () => {
  it('les deux écrans écrivent un montant, aucun ne crie « non mesuré »', () => {
    // « Non mesuré » sur un pipe vide enverrait chercher une panne là où il n'y
    // a simplement rien : zéro affaire fait bien zéro euro.
    expect(verdict(boardTotal(EMPTY))).toBe('amount')
  })
})

describe('la garde sait dire NON', () => {
  it('elle distingue vraiment les deux verdicts', () => {
    const unmeasured = document.createElement('div')
    unmeasured.textContent = 'non mesuré — aucun montant saisi sur 1 projet au pipe'
    const amount = document.createElement('div')
    amount.textContent = '45 000 €'
    expect(verdict(unmeasured)).toBe('unmeasured')
    expect(verdict(amount)).toBe('amount')
    // Un bloc qui ne dirait NI l'un ni l'autre est une panne de la garde, pas
    // un succès : elle le signale au lieu de passer au vert sur du vide.
    const mute = document.createElement('div')
    mute.textContent = 'Mon pipe'
    expect(() => verdict(mute)).toThrow()
  })
})

describe('#1394 — le second verdict n’existe plus, donc il ne peut plus diverger', () => {
  it.each([
    ['non chiffré', NOTHING_PRICED],
    ['partiellement chiffré', PARTLY_PRICED],
    ['vide', EMPTY],
    ['une colonne vide', EMPTY_COLUMN],
  ])('le brief ne rend AUCUN total de pipe — pipe %s', (_case, summary) => {
    const text = briefingText(summary as PipelineSummary)
    // Ni le bloc, ni sa phrase, ni son chiffre. Ce test tombe le jour où
    // quelqu'un remet un total de pipe sur le brief — avec ou sans
    // `pipelineTotal`, ce qu'une garde de source ne verrait pas.
    expect(text).not.toContain('Mon pipe')
    expect(text).not.toMatch(/affaires? sans montant/)
    expect(text).not.toMatch(/45\s?000/)
  })

  it('la garde sait dire NON : le même bloc rend BIEN ses sous-blocs', () => {
    // La contre-épreuve. Sans elle, les quatre absences ci-dessus passeraient au
    // vert sur un composant qui aurait cessé de rendre quoi que ce soit.
    // #2567.K2 (18/09/2026) — « Ce qui m'attend » a migré vers
    // `DailyGesturesBlock` (voir sa propre contre-épreuve, dans son fichier de
    // test) : ce qui reste ICI est la capacité, à côté du chiffre d'affaires.
    const text = briefingText(NOTHING_PRICED)
    expect(text).toContain('Mon chiffre d’affaires')
    expect(text).toContain('Ce qu’il reste à vendre')
  })
})

describe('une colonne VIDE — zéro affaire n’est pas une mesure manquante', () => {
  const NO_AMOUNT = /Aucun montant saisi/

  it('n’écrit pas « Aucun montant saisi » sur une colonne sans affaire', () => {
    // Zéro affaire ne fait pas une mesure manquante : la somme d'un ensemble
    // vide VAUT zéro, et le dire autrement invente un travail qui n'existe pas.
    expect(boardTotal(EMPTY_COLUMN).ownerDocument.body.textContent ?? '').not.toMatch(NO_AMOUNT)
  })

  it('la garde sait dire NON — une colonne qui a des affaires NON chiffrées le dit, sur les deux', () => {
    // La contre-épreuve : si la phrase disparaissait partout, le test ci-dessus
    // passerait au vert sur du vide. Ici elle DOIT apparaître.
    expect(boardTotal(NOTHING_PRICED).ownerDocument.body.textContent ?? '').toMatch(NO_AMOUNT)
  })
})
