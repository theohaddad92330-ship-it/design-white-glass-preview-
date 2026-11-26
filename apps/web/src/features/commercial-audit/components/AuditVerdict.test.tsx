import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AuditVerdict } from './AuditVerdict'

describe('AuditVerdict — #2090.12 / #2090.13', () => {
  it('nomme honnêtement l’absence de verdict — jamais une phrase inventée', async () => {
    renderWithRouter(<AuditVerdict verdict={null} />)
    expect(await screen.findByText(/Rien n'a pu être tranché/)).toBeInTheDocument()
  })

  it('rend la ligne primaire, sa conséquence et la confiance — deux lignes, pas un résumé', async () => {
    renderWithRouter(
      <AuditVerdict
        verdict={{
          primary: 'Plus de 3 secteurs visés à la fois.',
          secondary: 'La prospection se disperse.',
          source: 'contradiction',
          ruleId: 'tooManySimultaneousMarkets',
          confidence: 'deduced',
        }}
      />,
    )
    expect(await screen.findByText('Plus de 3 secteurs visés à la fois.')).toBeInTheDocument()
    expect(screen.getByText('La prospection se disperse.')).toBeInTheDocument()
    expect(screen.getByText('Déduit')).toBeInTheDocument()
  })

  it('rend la ligne primaire seule quand il n’y a pas de conséquence connue', async () => {
    renderWithRouter(
      <AuditVerdict
        verdict={{
          primary: 'Les dossiers avancent sans responsable nommé',
          secondary: null,
          source: 'breakpoint',
          ruleId: null,
          confidence: null,
        }}
      />,
    )
    expect(await screen.findByText('Les dossiers avancent sans responsable nommé')).toBeInTheDocument()
  })

  /**
   * #2075.12 — la CONCLUSION porte désormais son affordance de commentaire,
   * `target_key: 'verdict'` — même clé que celle qui NOMME le verdict dans
   * `unestablished` (`build-audit.ts`).
   */
  it('#2075.12 — porte l’affordance « Commenter » quand un verdict existe', async () => {
    renderWithRouter(
      <AuditVerdict
        verdict={{
          primary: 'Plus de 3 secteurs visés à la fois.',
          secondary: null,
          source: 'contradiction',
          ruleId: 'tooManySimultaneousMarkets',
          confidence: 'deduced',
        }}
      />,
    )
    expect(await screen.findByRole('button', { name: /commenter/i })).toBeInTheDocument()
  })
})
