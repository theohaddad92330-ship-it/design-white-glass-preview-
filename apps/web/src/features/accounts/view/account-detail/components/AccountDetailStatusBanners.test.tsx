import type { Account } from '@bellum/contracts'
import { buildIdentityMismatchMessage, creditCostOf, parseIdentityMismatchMessage } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { phaseLabel } from '@/lib/analysis-subscription'
import { AccountDetailStatusBanners } from './AccountDetailStatusBanners'

// #2164.16 — la bannière ne fait que TRANSMETTRE `analyzing` à la carte de
// progression ; son rendu interne (framer-motion, `useAnalysisRun`…) est déjà
// prouvé par `AnalysisProgressCard.test.tsx`. Mock léger pour ne prouver ICI
// que le câblage (quelle prop reçoit quelle valeur, quel variant).
const analysisProgressCardCalls: Record<string, unknown>[] = []
vi.mock('@/components/analysis/AnalysisProgressCard', () => ({
  AnalysisProgressCard: (props: Record<string, unknown>) => {
    analysisProgressCardCalls.push(props)
    return <div data-testid="mock-analysis-progress-card" />
  },
}))

const mutate = vi.fn()
vi.mock('@/features/accounts/hooks/useResumeAnalysis', () => ({
  useResumeAnalysis: () => ({ mutate, isPending: false }),
}))
vi.mock('@/features/accounts/hooks/useAccountRelaunch', () => ({
  useAccountRelaunch: () => ({ relaunch: vi.fn() }),
}))
// #2478 — la bannière lit ce hook pour NOMMER ce qui a abouti avant l'échec.
// `null` par défaut : les tests existants (coût de « Reprendre », GA-96) ne
// portent pas sur ce comportement et ne doivent rien en voir.
const failedAnalysisPhases = vi.fn<() => string[] | null>(() => null)
vi.mock('@/features/accounts/hooks/useFailedAnalysisPhases', () => ({
  useFailedAnalysisPhases: (...args: unknown[]) => failedAnalysisPhases(...(args as [])),
}))

const CANCELLED = "Analyse annulée par l'utilisateur."
const INTERRUPTED = 'Analyse interrompue (délai dépassé). Relancez-la.'

function account(overrides: Partial<Account>): Account {
  return { id: 'a-1', company_name: 'ACME', status: 'error', ...overrides } as Account
}

/**
 * « Reprendre » débite le prix PLEIN d'une analyse — huit crédits, pas un.
 *
 * Le chemin : `useResumeAnalysis` → `POST /analysis/:id/resume` →
 * `AnalysisService.resume`, qui appelle `consumeAnalysisSlot` SANS `cost`. Le
 * montant retombe donc sur `DEFAULT_ANALYSIS_COST`, c'est-à-dire
 * `CREDIT_WEIGHTS.account_analysis`. Or les trois messages de cette bannière
 * disaient « le crédit », au singulier, et c'était le seul texte voisin du
 * bouton : le commercial cliquait en croyant dépenser un huitième du prix.
 *
 * ⚠️ Le nombre attendu vient du CONTRAT, jamais d'un littéral — une garde qui
 * écrirait « 8 » deviendrait la deuxième source du prix qu'elle surveille.
 */
describe('AccountDetailStatusBanners — le coût de « Reprendre » s’annonce avant le clic', () => {
  it.each([
    ['annulée', CANCELLED],
    ['échouée', 'Timeout Firecrawl'],
    ['interrompue', INTERRUPTED],
  ])('n’annonce aucun prix sur une analyse %s (#4463)', (_label, errorMessage) => {
    const { container } = render(<AccountDetailStatusBanners account={account({ error_message: errorMessage })} />)

    // Le coût est LISIBLE à l'écran, à côté du bouton — pas dans un `title=`,
    // que le doigt ne fait jamais apparaître.
    expect(container.textContent).not.toMatch(/cr[ée]dit/i)
  })

  it.each([
    ['annulée', CANCELLED],
    ['échouée', 'Timeout Firecrawl'],
    ['interrompue', INTERRUPTED],
  ])('ne dit plus « le crédit » au singulier sur une analyse %s', (_label, errorMessage) => {
    const { container } = render(<AccountDetailStatusBanners account={account({ error_message: errorMessage })} />)
    const text = container.textContent ?? ''
    expect(text.length).toBeGreaterThan(40)
    // « ce crédit », « le crédit », « un crédit » : trois façons d'annoncer un
    // huitième du prix. Aucune ne doit survivre.
    expect(text).not.toMatch(/\b(le|ce|un)\s+crédit\b/i)
  })

  it('ne dit rien du coût sur la bannière « pas encore analysé » — le prix se lit sur Découvrir', () => {
    // Ce bouton NAVIGUE vers `/search`, qui porte déjà son propre coût. Deux
    // annonces pour un geste, c'est la loi 4 du tome 7 (rien deux fois).
    const { container } = render(<AccountDetailStatusBanners account={account({ status: 'prospect' })} />)
    expect(container.textContent).not.toMatch(/crédit/i)
  })
})

/**
 * GA-96 — le refus d'un rafraîchissement qui aurait changé le dossier de société.
 *
 * Mesuré en production le 30/08/2026 : le dossier ROCHE (`552012031`, laboratoire
 * pharmaceutique) est revenu portant `493229280` — ROCHE BOBOIS, distributeur de
 * meubles. Le produit refuse désormais, et cette bannière est l'endroit où
 * l'utilisateur l'apprend.
 *
 * Ce qui se garde ici : que le refus soit RECONNU (donc traduit, et non affiché
 * en français brut à un utilisateur anglophone) et qu'il NOMME les deux
 * identités — sans elles, l'utilisateur ne peut pas décider de la suite.
 */
describe('AccountDetailStatusBanners — un rafraîchissement refusé se lit (GA-96)', () => {
  const REFUS = buildIdentityMismatchMessage({ expected: '552012031', resolved: '493229280' })

  it('mesure quelque chose — le message du contrat est bien reconnu comme un refus', () => {
    expect(parseIdentityMismatchMessage(REFUS)).toEqual({ expected: '552012031', resolved: '493229280' })
  })

  it('NOMME les deux sociétés, et ne laisse pas passer le message brut de la base', () => {
    const { container } = render(<AccountDetailStatusBanners account={account({ error_message: REFUS })} />)
    const text = container.textContent ?? ''

    expect(text).toContain('552012031')
    expect(text).toContain('493229280')
    // Le marqueur machine ne doit JAMAIS atteindre l'écran.
    expect(text).not.toContain('bellum:identity_mismatch')
    expect(text).not.toContain('expected=')
  })

  it('dit que le dossier est INTACT — un refus n’est pas une panne', () => {
    // La question de l'utilisateur au moment où il lit ça est « qu'est-ce qui a
    // été écrasé ? ». La réponse — rien — doit être dans la bannière.
    const { container } = render(<AccountDetailStatusBanners account={account({ error_message: REFUS })} />)
    expect(container.textContent ?? '').toMatch(/intacts?\b/i)
  })

  it('ne confond pas une VRAIE panne avec un refus d’identité', () => {
    const { container } = render(
      <AccountDetailStatusBanners account={account({ error_message: 'Timeout Firecrawl' })} />,
    )
    expect(container.textContent ?? '').not.toMatch(/intacts?\b/i)
  })
})

/**
 * #2478 — « les analyses échouent presque à chaque fois et en plus c'est
 * faux, une grande partie a fonctionné ». La bannière disait « Analyse
 * échouée » et rien d'autre, effaçant le travail des phases déjà
 * checkpointées. Elle doit désormais NOMMER ce qui a abouti et ce qui n'a pas
 * pu être terminé — jamais un tableau vide qui se lirait comme un vrai zéro
 * tant que `useFailedAnalysisPhases` n'a rien répondu.
 */
describe('AccountDetailStatusBanners — #2478 la vérité partielle d’un run échoué', () => {
  beforeEach(() => failedAnalysisPhases.mockReturnValue(null))

  it('ne dit RIEN de plus tant que les phases ne sont pas connues (null)', () => {
    const { container } = render(
      <AccountDetailStatusBanners account={account({ error_message: 'Timeout Firecrawl' })} />,
    )
    expect(container.textContent ?? '').not.toMatch(/abouti|terminé/i)
  })

  it('NOMME ce qui a abouti ET ce qui n’a pas pu être terminé', () => {
    failedAnalysisPhases.mockReturnValue(['research', 'contacts'])
    const { container } = render(
      <AccountDetailStatusBanners account={account({ error_message: 'Timeout Firecrawl' })} />,
    )
    const text = container.textContent ?? ''
    expect(text).toMatch(/abouti/i)
    expect(text).toContain('Recherche et sources')
    expect(text).toContain('Contacts et rôles')
    expect(text).toMatch(/terminé/i)
    expect(text).toContain('Stratégie et scoring')
    expect(text).toContain("Plan d'action")
  })

  // Témoin voisin — un run mort SANS le moindre checkpoint (phase 1 jamais
  // finie) ne doit pas afficher un bloc vide ou trompeur : `[]` reste [].
  it('un run mort sans aucun checkpoint n’affiche pas le bloc "ce qui a abouti"', () => {
    failedAnalysisPhases.mockReturnValue([])
    const { container } = render(
      <AccountDetailStatusBanners account={account({ error_message: 'Timeout Firecrawl' })} />,
    )
    expect(container.textContent ?? '').not.toMatch(/abouti/i)
  })

  // La bannière « annulée par l'utilisateur » a déjà sa propre explication —
  // ce bloc ne doit pas s'y ajouter et brouiller un message déjà clair.
  it('n’apparaît PAS sur une analyse annulée par l’utilisateur', () => {
    failedAnalysisPhases.mockReturnValue(['research'])
    const { container } = render(<AccountDetailStatusBanners account={account({ error_message: CANCELLED })} />)
    expect(container.textContent ?? '').not.toMatch(/abouti/i)
  })
})

/**
 * #2164.16 — le dossier reste visible pendant qu'une analyse tourne (variant
 * `embed`), quand l'appelant a jugé qu'il y a un dossier lisible derrière.
 * `AccountDetail.tsx` décide QUAND transmettre `analyzing` (voir
 * `hasReadableDossierWhileAnalyzing`) ; cette bannière ne fait que le rendre.
 */
describe('AccountDetailStatusBanners — #2164.16 dossier visible pendant un run', () => {
  it('monte AnalysisProgressCard en variant "embed" quand `analyzing` est fourni', () => {
    analysisProgressCardCalls.length = 0
    const onCancel = vi.fn()
    render(
      <AccountDetailStatusBanners
        account={account({ id: 'a-9', company_name: 'ACME', status: 'analyzing' })}
        analyzing={{ phase: 'Recherche et sources', onCancel }}
      />,
    )
    expect(screen.getByTestId('mock-analysis-progress-card')).toBeInTheDocument()
    expect(analysisProgressCardCalls).toHaveLength(1)
    expect(analysisProgressCardCalls[0]).toMatchObject({
      companyName: 'ACME',
      phase: 'Recherche et sources',
      accountId: 'a-9',
      variant: 'embed',
    })
    expect(analysisProgressCardCalls[0].onCancel).toBe(onCancel)
  })

  it('ne monte RIEN d’autre (ni prospect ni erreur) quand `analyzing` est fourni', () => {
    analysisProgressCardCalls.length = 0
    render(
      <AccountDetailStatusBanners
        account={account({ status: 'analyzing', error_message: 'devrait être ignoré' })}
        analyzing={{ phase: '', onCancel: vi.fn() }}
      />,
    )
    expect(analysisProgressCardCalls).toHaveLength(1)
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
  })

  it('ne monte pas AnalysisProgressCard hors run (`analyzing` absent)', () => {
    analysisProgressCardCalls.length = 0
    render(<AccountDetailStatusBanners account={account({ status: 'prospect' })} />)
    expect(analysisProgressCardCalls).toHaveLength(0)
  })
})

/**
 * #2130.40 / #2130.48 — recette des scénarios « analyse partielle » et
 * « action en échec ».
 *
 * Les deux partagent le même statut (`account.status === 'error'`) et le
 * même banner, mais la copie DOIT distinguer ce qui a abouti (#2478 — « les
 * analyses échouent presque à chaque fois et en plus c'est faux, une grande
 * partie a fonctionné ») de l'échec sec, où rien n'a checkpointé.
 */
describe('AccountDetailStatusBanners — #2130.40 analyse partielle (des phases ont abouti avant l’échec)', () => {
  it('nomme CE QUI A ABOUTI et CE QUI MANQUE, avec les phases réelles', () => {
    failedAnalysisPhases.mockReturnValue(['research', 'contacts'])
    render(<AccountDetailStatusBanners account={account({ status: 'error', error_message: 'Panne réseau' })} />)

    expect(
      screen.getByText(`Ce qui a abouti avant l'échec : ${phaseLabel('research')}, ${phaseLabel('contacts')}.`),
    ).toBeInTheDocument()
    expect(
      screen.getByText(`Ce qui n'a pas pu être terminé : ${phaseLabel('classify')}, ${phaseLabel('plan')}.`),
    ).toBeInTheDocument()
  })

  it('sait dire NON — sans aucune phase complétée, aucune ligne « ce qui a abouti » ne s’affiche', () => {
    failedAnalysisPhases.mockReturnValue([])
    render(<AccountDetailStatusBanners account={account({ status: 'error', error_message: 'Panne réseau' })} />)

    expect(screen.queryByText(/Ce qui a abouti avant l'échec/)).not.toBeInTheDocument()
  })
})

describe('AccountDetailStatusBanners — #2130.48 action en échec (rien n’a checkpointé)', () => {
  it('affiche l’échec SEC — titre et message génériques, aucune phase nommée', () => {
    failedAnalysisPhases.mockReturnValue(null)
    // `error_message` VIDE : le message générique `failedMessage` ne s'affiche
    // que faute de message brut — un `error_message` réel gagnerait sur lui
    // (voir AccountDetailStatusBanners.tsx), ce qui n'est pas ce scénario teste.
    render(<AccountDetailStatusBanners account={account({ status: 'error', error_message: null })} />)

    expect(screen.getByText('Analyse échouée')).toBeInTheDocument()
    expect(screen.getByText(/La reprise repartira de la dernière étape réussie/)).toBeInTheDocument()
    expect(screen.queryByText(/Ce qui a abouti avant l'échec/)).not.toBeInTheDocument()
  })

  it('distingue l’échec sec de l’annulation utilisateur — jamais la même copie', () => {
    failedAnalysisPhases.mockReturnValue(null)
    render(
      <AccountDetailStatusBanners
        account={account({ status: 'error', error_message: "Analyse annulée par l'utilisateur." })}
      />,
    )
    expect(screen.queryByText('Analyse échouée')).not.toBeInTheDocument()
  })
})

// #4295.1 — le vocabulaire partagé (`analysisOperationStatus`) n'avait AUCUN appelant à l'écran :
// l'état d'une analyse arrêtée se lit en un mot, « Partielle » quand des phases ont abouti.
describe('AccountDetailStatusBanners — #4295.1 le statut unifié se lit sur l’analyse arrêtée', () => {
  const statusOf = (container: HTMLElement) => container.querySelector('[data-status]')?.getAttribute('data-status')

  it('dit « interrompue » quand rien n’a abouti', () => {
    failedAnalysisPhases.mockReturnValue([])
    const { container } = render(<AccountDetailStatusBanners account={account({ error_message: INTERRUPTED })} />)
    expect(statusOf(container)).toBe('interrupted')
  })

  it('dit « partielle » quand des phases ont abouti avant l’arrêt', () => {
    failedAnalysisPhases.mockReturnValue(['identity'])
    const { container } = render(<AccountDetailStatusBanners account={account({ error_message: 'Timeout' })} />)
    expect(statusOf(container)).toBe('partial')
  })

  it('sait dire NON — une analyse annulée par l’utilisateur ne porte aucun statut d’arrêt', () => {
    failedAnalysisPhases.mockReturnValue(null)
    const { container } = render(<AccountDetailStatusBanners account={account({ error_message: CANCELLED })} />)
    expect(statusOf(container)).toBeUndefined()
  })
})
