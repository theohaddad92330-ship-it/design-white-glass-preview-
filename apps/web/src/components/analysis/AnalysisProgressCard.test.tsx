import { render, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AnalysisProgressCard } from './AnalysisProgressCard'

const mockUseAnalysisRun = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

/**
 * ⚠️ Le Proxy MÉMORISE ses composants.
 *
 * Sans ce cache, chaque accès à `motion.div` rend une closure NEUVE : React voit
 * un type différent d'un rendu à l'autre, démonte tout le sous-arbre et le
 * remonte — l'état local des enfants part avec, et le test devient aveugle à
 * toute interaction qui change un état. Mesuré le 03/09 : un clic passait, le
 * `setState` était bien appelé, et l'écran entier disparaissait du DOM.
 */
const motionComponents = new Map<string, unknown>()

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          const Rendered = ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
            createElement(prop, props, children)
          motionComponents.set(prop, Rendered)
          return Rendered
        }
      },
    },
  ),
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))

vi.mock('@/stores/analysisStore', () => ({
  STEP_KEYS: ['scope', 'crosscheck', 'account_sheet', 'decision_makers', 'orga_chain', 'classification', 'messages'],
  useAnalysisRun: (...args: unknown[]) => mockUseAnalysisRun(...args),
}))

describe('AnalysisProgressCard', () => {
  it('renders the live phase with the animated progress indicator', () => {
    mockUseAnalysisRun.mockReturnValue(null)

    const { container } = render(
      <AnalysisProgressCard companyName="Acme" phase="Croisement des sources" accountId={null} />,
    )

    // #2436.6 — le texte de la phase existe aussi dans la région `role="status"`
    // (sr-only) qui l'annonce au lecteur d'écran : le libellé VISIBLE est le
    // premier des deux dans l'ordre du DOM.
    const phase = screen.getAllByText('Croisement des sources')[0]
    expect(phase).toBeInTheDocument()
    expect(phase.closest('div')).toHaveClass('border-l-2')
    expect(container.firstChild).toHaveClass('flex', 'flex-col', 'flex-1', 'min-h-0')
  })

  it('renders the latest generated analysis events under the phase label', () => {
    mockUseAnalysisRun.mockReturnValue({
      phase: 'Croisement des sources',
      completedSteps: [],
      currentStep: 'crosscheck',
      warnings: [],
      sourceHealth: {},
      events: [
        { at: 1, key: 'analysis_start', label: 'Lancement de l’analyse', percent: 0, status: 'running' },
        { at: 2, key: 'step:research:scope', label: 'Cadrage de la cible', percent: 8, status: 'running' },
        { at: 3, key: 'step:research:crosscheck', label: 'Lecture du site corporate', percent: 16, status: 'running' },
      ],
    })
    render(<AnalysisProgressCard companyName="Acme" phase="Croisement des sources" accountId="acct-1" />)

    // #2436.6 — le texte apparaît maintenant DEUX fois : la version visible
    // (`AnimatedProgressLabel`) et la région `role="status"` qui l'annonce au
    // lecteur d'écran (sr-only). Les deux sont attendues.
    expect(screen.getAllByText('Lecture du site corporate').length).toBe(2)
    expect(screen.getByText('Ce que Bellum vérifie')).toBeInTheDocument()
    expect(screen.getByText('Les signaux utiles commencent à se confirmer.')).toBeInTheDocument()
    expect(screen.getByText(/Bellum confronte les sources publiques/)).toBeInTheDocument()
  })

  // #3143 (retour bêta, 27/09/2026) — « énorme bloc gris qui prend toute la
  // hauteur de la page ». Le variant `embed` (actualisation sur un dossier
  // déjà lisible, `AccountDetailStatusBanners`) rend désormais une LIGNE
  // compacte — état, étape en cours, progression — jamais la carte complète
  // (titre, séparateur, aperçu d'étape, pied) pensée pour un écran d'attente
  // plein écran.
  it('le variant embed rend une ligne compacte, pas la carte complète', () => {
    mockUseAnalysisRun.mockReturnValue(null)

    render(
      <AnalysisProgressCard companyName="Acme" phase="Croisement des sources" accountId="acct-1" variant="embed" />,
    )

    const compact = screen.getByTestId('analysis-progress-compact')
    // #3666.2 — l'ancien dossier reste affiché dessous : on dit « Actualisation
    // en cours », pas « Analyse en cours » (qui annoncerait un nouveau résultat).
    expect(compact).toHaveTextContent('Actualisation en cours')
    expect(compact).toHaveTextContent('Croisement des sources')
    expect(compact).toHaveTextContent('dossier affiché date de la précédente analyse')
    // #3666.3 — jamais de pourcentage : l'étape connue suffit.
    expect(compact).not.toHaveTextContent(/\d+\s?%/)
    // Ce que la carte complète montrait pour un écran d'attente plein écran
    // n'a rien à faire dans une ligne posée AU-DESSUS d'un dossier déjà lisible.
    expect(screen.queryByText('Acme')).not.toBeInTheDocument()
    expect(screen.queryByText(/Bellum confronte les sources publiques/)).not.toBeInTheDocument()
    expect(screen.queryByText('progressCard.durationHint', { exact: false })).not.toBeInTheDocument()
  })

  it('le variant embed garde le bouton Annuler et l’annonce accessible', () => {
    mockUseAnalysisRun.mockReturnValue(null)
    const onCancel = vi.fn()

    render(
      <AnalysisProgressCard
        companyName="Acme"
        phase="Croisement des sources"
        accountId="acct-1"
        variant="embed"
        onCancel={onCancel}
      />,
    )

    screen.getByRole('button', { name: /annuler/i }).click()
    expect(onCancel).toHaveBeenCalledTimes(1)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('Croisement des sources')
  })

  // #3666.3 — « Statut par opération : étape connue, pas de %. » Le chiffre
  // reçu du serveur est un JALON de phase (plancher de heartbeat), pas une
  // mesure : l'afficher, c'est inventer une progression. L'écran dit « En cours »
  // + l'étape ; la prop reste acceptée, elle n'est plus rendue.
  describe('aucun pourcentage rendu (#3666.3)', () => {
    it.each([null, 0, 75])('percent=%s : « En cours » et AUCUN pourcentage', percent => {
      mockUseAnalysisRun.mockReturnValue(null)

      render(<AnalysisProgressCard companyName="ALSEDIS" phase="Classification" accountId={null} />)

      expect(screen.getByText('En cours')).toBeInTheDocument()
      expect(screen.queryByText(/\d+\s?%/)).not.toBeInTheDocument()
      expect(screen.getAllByText('Classification')[0]).toBeInTheDocument()
    })
  })

  // #3666.4 — « Attente anormale : Continuer à consulter. » Passé le délai sans
  // signe de vie, l'écran plein propose de quitter vers les dossiers ; la
  // course continue côté serveur (aucune annulation, aucun second débit).
  describe('attente anormale (#3666.4)', () => {
    const run = (lastAt: number) => ({
      phase: 'Classification',
      percent: 40,
      state: 'analyzing',
      completedSteps: [],
      currentStep: null,
      warnings: [],
      sourceHealth: {},
      events: [{ at: lastAt, key: 'k', label: 'Classification', percent: 40, status: 'running' }],
      syncedAt: lastAt,
    })

    it('silence récent : pas de « Continuer à consulter »', () => {
      mockUseAnalysisRun.mockReturnValue(run(Date.now()))
      render(<AnalysisProgressCard companyName="Acme" phase="x" accountId="a1" />)
      expect(screen.queryByRole('link', { name: 'Continuer à consulter' })).not.toBeInTheDocument()
    })

    it('silence prolongé : « Continuer à consulter » mène aux dossiers et dit que la course continue', () => {
      mockUseAnalysisRun.mockReturnValue(run(Date.now() - 11 * 60 * 1000))
      render(<AnalysisProgressCard companyName="Acme" phase="x" accountId="a1" />)
      expect(screen.getByRole('link', { name: 'Continuer à consulter' })).toHaveAttribute('href', '/accounts')
      expect(screen.getByText(/continue côté serveur/)).toBeInTheDocument()
    })

    // #4295.2 — « Reprendre » n'a de sens que sur un échec CONNU (bannière d'erreur du dossier,
    // `AccountDetailStatusBanners`). Ici le silence est un `unknown` : on ignore si la course a abouti, et un
    // timeout n'est pas un échec — `unknown` arrête la reprise. Reprendre risquerait de relancer (et redébiter)
    // une analyse qui tourne encore ; la carte ne le propose donc JAMAIS, silence récent ou prolongé.
    it.each([
      ['silence récent', 0],
      ['silence prolongé', 11 * 60 * 1000],
    ])('%s : aucun « Reprendre » (un silence est un `unknown`, pas un échec)', (_label, silenceMs) => {
      mockUseAnalysisRun.mockReturnValue(run(Date.now() - silenceMs))
      render(<AnalysisProgressCard companyName="Acme" phase="x" accountId="a1" />)
      expect(screen.queryByRole('button', { name: 'Reprendre' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Reprendre' })).not.toBeInTheDocument()
      expect(screen.queryByText('Reprendre')).not.toBeInTheDocument()
    })
  })

  // #2436.6 — trois à six minutes d'analyse, et RIEN n'était annoncé au lecteur
  // d'écran pendant tout ce temps (aucun `aria-live`/`role="status"` dans ce
  // composant). Le correctif annonce la PHASE, jamais le pourcentage : le
  // pourcentage change en continu (animation `width`), et le lire à chaque
  // tick serait exactement le défaut que #1944.18 a déjà corrigé côté Chat.
  describe('annonce au lecteur d’écran (#2436.6)', () => {
    it('une région `role="status"` porte la phase courante', () => {
      mockUseAnalysisRun.mockReturnValue({
        phase: 'Croisement des sources',
        completedSteps: [],
        currentStep: null,
        warnings: [],
        sourceHealth: {},
        events: [{ at: 1, key: 'step:research:scope', label: 'Cadrage de la cible', percent: 8, status: 'running' }],
      })

      render(<AnalysisProgressCard companyName="Acme" phase="Cadrage de la cible" accountId="acct-1" />)

      const status = screen.getByRole('status')
      expect(status).toHaveAttribute('aria-live', 'polite')
      expect(status).toHaveTextContent('Cadrage de la cible')
    })

    it('un changement de PHASE, lui, change le texte annoncé', () => {
      mockUseAnalysisRun.mockReturnValue({
        phase: 'Croisement des sources',
        completedSteps: [],
        currentStep: null,
        warnings: [],
        sourceHealth: {},
        events: [{ at: 1, key: 'step:research:scope', label: 'Cadrage de la cible', percent: 8, status: 'running' }],
      })

      const { rerender } = render(
        <AnalysisProgressCard companyName="Acme" phase="Cadrage de la cible" accountId="acct-1" />,
      )

      mockUseAnalysisRun.mockReturnValue({
        phase: 'Croisement des sources',
        completedSteps: [],
        currentStep: null,
        warnings: [],
        sourceHealth: {},
        events: [
          { at: 1, key: 'step:research:scope', label: 'Cadrage de la cible', percent: 8, status: 'running' },
          {
            at: 2,
            key: 'step:research:crosscheck',
            label: 'Lecture du site corporate',
            percent: 16,
            status: 'running',
          },
        ],
      })
      rerender(<AnalysisProgressCard companyName="Acme" phase="Croisement des sources" accountId="acct-1" />)

      expect(screen.getByRole('status')).toHaveTextContent('Lecture du site corporate')
    })
  })

  // #3666 (Louis 13/10, « étapes, pas de % ») — l'étape MESURÉE du job, jamais un pourcentage.
  describe('l’avancement se dit en étapes (#3666)', () => {
    function runAt(currentStep: string | null) {
      return {
        phase: 'Croisement des sources',
        completedSteps: [],
        currentStep,
        warnings: [],
        sourceHealth: {},
        percent: 72,
        events: [{ at: 1, key: 'k', label: 'Lecture du site corporate', percent: 72, status: 'running' }],
      }
    }

    it('dit « Étape 2 sur 9 : recoupement des sources », et aucun pourcentage', () => {
      mockUseAnalysisRun.mockReturnValue(runAt('crosscheck'))
      render(<AnalysisProgressCard companyName="Acme" phase="x" accountId="acct-1" />)
      expect(screen.getByText('Étape 2 sur 9 : recoupement des sources')).toBeInTheDocument()
      expect(screen.queryByText(/%/)).toBeNull()
    })

    it('la ligne compacte du dossier dit la même étape', () => {
      mockUseAnalysisRun.mockReturnValue(runAt('decision_makers'))
      render(<AnalysisProgressCard companyName="Acme" phase="x" accountId="acct-1" variant="embed" />)
      expect(screen.getByText('Étape 4 sur 9 : décideurs')).toBeInTheDocument()
      expect(screen.queryByText(/72/)).toBeNull()
    })

    it('sait dire NON : étape inconnue ⇒ « En cours », jamais une étape devinée', () => {
      mockUseAnalysisRun.mockReturnValue(runAt(null))
      render(<AnalysisProgressCard companyName="Acme" phase="x" accountId="acct-1" />)
      expect(screen.getByText('En cours')).toBeInTheDocument()
      expect(screen.queryByText(/Étape \d/)).toBeNull()
    })
  })
})
