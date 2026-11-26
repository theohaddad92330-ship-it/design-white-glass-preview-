import type { JobTrackingCard } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params }: { children: React.ReactNode; to: string; params?: Record<string, string> }) => (
    <a href={Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace('$' + key, value), to)}>
      {children}
    </a>
  ),
  useNavigate: () => navigateMock,
}))

const cancelMutate = vi.fn()
vi.mock('@/features/accounts/hooks/useCancelAnalysis', () => ({
  useCancelAnalysis: () => ({ mutate: cancelMutate, isPending: false }),
}))

const cancelLauraJobMutate = vi.fn()
vi.mock('../api', () => ({
  useCancelLauraJob: () => ({ mutate: cancelLauraJobMutate, isPending: false }),
}))

const { RunningJobsBlock } = await import('./RunningJobsBlock')

function job(overrides: Partial<JobTrackingCard> = {}): JobTrackingCard {
  return {
    id: 'run-1',
    kind: 'account_analysis',
    title: 'ACME',
    currentStepLabel: 'analyzing',
    progressSteps: null,
    reservedCredits: null,
    estimatedDurationMinutes: null,
    intermediateResults: null,
    pendingValidations: null,
    openHref: '/accounts/acc-1',
    cancelable: true,
    ...overrides,
  }
}

describe('RunningJobsBlock — #2147.5', () => {
  it('affiche le vide plutôt qu’une carte inventée quand rien ne tourne', () => {
    render(<RunningJobsBlock jobs={[]} />)
    expect(screen.getByText('Rien en cours pour le moment.')).toBeInTheDocument()
  })

  it('nomme le job, son étape, et ouvre son compte', () => {
    render(<RunningJobsBlock jobs={[job()]} />)
    expect(screen.getByText('ACME')).toBeInTheDocument()
    expect(screen.getByText('En cours')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ouvrir' })).toHaveAttribute('href', '/accounts/acc-1')
  })

  it('propose annuler seulement quand le job le permet réellement', () => {
    const { rerender } = render(<RunningJobsBlock jobs={[job({ cancelable: false })]} />)
    expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument()

    rerender(<RunningJobsBlock jobs={[job({ cancelable: true })]} />)
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
  })

  it('omet les cinq champs qu’une analyse de compte ne porte pas, jamais un zéro deviné', () => {
    render(<RunningJobsBlock jobs={[job()]} />)
    expect(screen.queryByText(/% fait/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Durée prévue/)).not.toBeInTheDocument()
    expect(screen.queryByText(/crédit/)).not.toBeInTheDocument()
  })

  /**
   * #2147.5 (correctif 26/09 soir) — le job composite de Laura porte
   * RÉELLEMENT ces champs (voir `BriefingService.buildLauraJobCards`) : cette
   * carte doit les rendre, pas seulement les transporter sans les afficher.
   */
  describe('kind: laura_job (correctif 26/09 soir)', () => {
    function lauraJob(overrides: Partial<JobTrackingCard> = {}): JobTrackingCard {
      return job({
        id: 'job-1',
        kind: 'laura_job',
        title: 'Préparer la campagne filiales',
        currentStepLabel: 'Préparer les messages',
        progressSteps: { done: 1, total: 2 },
        reservedCredits: 8,
        estimatedDurationMinutes: 10,
        openHref: '/chat?conversationId=conv-1',
        cancelable: true,
        ...overrides,
      })
    }

    it('rend la progression et la durée prévue — sans coût réservé (#4463)', () => {
      render(<RunningJobsBlock jobs={[lauraJob()]} />)
      expect(screen.getByText('Préparer la campagne filiales')).toBeInTheDocument()
      // #3666 (Louis 13/10) — les étapes du job, jamais un pourcentage.
      expect(screen.getByText('1 étape sur 2 terminée')).toBeInTheDocument()
      expect(screen.queryByText(/%/)).toBeNull()
      expect(screen.getByText('Durée prévue : 10 min')).toBeInTheDocument()
      // #4463 — le job porte `reservedCredits: 8`, l'écran ne le dit pas : ni « réservés », ni « crédit ».
      expect(screen.queryByText(/crédit|réservé/i)).not.toBeInTheDocument()
    })

    it('rend les résultats intermédiaires et les validations attendues, seulement quand ils existent', () => {
      const { rerender } = render(<RunningJobsBlock jobs={[lauraJob()]} />)
      expect(screen.queryByText(/résultat/)).not.toBeInTheDocument()
      expect(screen.queryByText(/validation/)).not.toBeInTheDocument()

      rerender(
        <RunningJobsBlock
          jobs={[lauraJob({ intermediateResults: ['20 filiales trouvées'], pendingValidations: ['Envoyer le CRM'] })]}
        />,
      )
      expect(screen.getByText('1 résultat intermédiaire')).toBeInTheDocument()
      expect(screen.getByText('1 validation attendue')).toBeInTheDocument()
    })

    it('ouvre le fil qui a proposé le job, jamais /accounts/:id', () => {
      render(<RunningJobsBlock jobs={[lauraJob()]} />)
      screen.getByRole('button', { name: 'Ouvrir' }).click()
      expect(navigateMock).toHaveBeenCalledWith({ to: '/chat', search: { conversationId: 'conv-1' } })
    })

    it('annule via le geste du job composite, jamais le geste d’analyse de compte', () => {
      render(<RunningJobsBlock jobs={[lauraJob()]} />)
      screen.getByRole('button', { name: 'Annuler' }).click()
      expect(cancelLauraJobMutate).toHaveBeenCalledWith('job-1')
      expect(cancelMutate).not.toHaveBeenCalled()
    })
  })
})
