import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { AuditChainStage } from '../lib/audit-chain'
import { AuditChain } from './AuditChain'

/**
 * #2090.15 / #2090.16 / #2090.17, #2066.1-.10/.17/.18 — la chaîne, ses
 * ruptures, leur porte, et la conclusion NOMMÉE qui situe le premier endroit
 * cassé.
 *
 * Le cas que ce fichier garde le plus fort : GA-35 — ce qui se clique se
 * tabule. Une étape en rupture DOIT être un `<button>` (rôle accessible,
 * atteignable au clavier) ; une étape sans rupture ne doit PAS en être un —
 * un bouton inerte tromperait un lecteur d'écran en laissant croire qu'il y
 * a quelque chose à activer.
 */

function stage(overrides: Partial<AuditChainStage> & { key: AuditChainStage['key'] }): AuditChainStage {
  return { state: 'unknown', ruptures: [], ...overrides }
}

const RUPTURE_STAGE: AuditChainStage = stage({
  key: 'contact',
  state: 'rupture',
  ruptures: [
    {
      ruleId: 'tooManySimultaneousMarkets',
      facts: ['4 secteurs prioritaires nommés : Banque, Assurance, Retail, Énergie'],
      tension: 'Plus de 3 secteurs visés à la fois, pour une seule activité commerciale.',
      possibleExplanation: 'Une phase exploratoire avant resserrement peut expliquer ce nombre.',
      questionToValidate: 'Combien de secteurs comptes-tu vraiment travailler activement ce trimestre ?',
      consequenceIfUnaddressed: 'La prospection se disperse et aucun secteur ne devient un point fort reconnu.',
      recommendation: 'Resserrer la liste des secteurs prioritaires à trois au maximum pour ce trimestre.',
      indicator: 'Nombre de secteurs prioritaires nommés simultanément.',
      confidence: 'deduced',
    },
  ],
})

describe('AuditChain', () => {
  it('rend les neuf étapes, dans l’ordre', () => {
    const stages = [
      stage({ key: 'contact' }),
      stage({ key: 'exchange' }),
      stage({ key: 'need' }),
      stage({ key: 'profile' }),
      stage({ key: 'interview' }),
      stage({ key: 'agreement' }),
      stage({ key: 'kickoff' }),
      stage({ key: 'followUp' }),
      stage({ key: 'capitalisation' }),
    ]
    render(<AuditChain stages={stages} />)
    expect(screen.getByText('Contact')).toBeInTheDocument()
    expect(screen.getByText('Capitalisation')).toBeInTheDocument()
  })

  it('⚠️ GA-35 — une étape en RUPTURE est un vrai bouton, atteignable au clavier', () => {
    render(<AuditChain stages={[RUPTURE_STAGE, stage({ key: 'exchange' })]} />)
    const button = screen.getByRole('button', { name: /Contact/ })
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAttribute('type', 'button')
  })

  it('⚠️ GA-35 — une étape SANS rupture n’est PAS un bouton', () => {
    render(<AuditChain stages={[stage({ key: 'exchange', state: 'measured' })]} />)
    expect(screen.queryByRole('button', { name: /Échange/ })).not.toBeInTheDocument()
  })

  it('nomme « non mesuré » une étape sans aucun signal — jamais « rien à signaler »', () => {
    render(<AuditChain stages={[stage({ key: 'followUp', state: 'unknown' })]} />)
    expect(screen.getByText('Non mesuré à cette étape')).toBeInTheDocument()
  })

  it('affiche le compte de ruptures sur l’étape, sans révéler le détail avant le clic', () => {
    render(<AuditChain stages={[RUPTURE_STAGE]} />)
    expect(screen.getByText('1 rupture détectée')).toBeInTheDocument()
    expect(screen.queryByText(/Combien de secteurs/)).not.toBeInTheDocument()
  })

  it('au clic, révèle les FAITS, la question à valider, la conséquence, la recommandation et l’indicateur — reliés au ruleId', async () => {
    const user = userEvent.setup()
    render(<AuditChain stages={[RUPTURE_STAGE]} />)
    await user.click(screen.getByRole('button', { name: /Contact/ }))
    expect(screen.getByText('Trop de marchés simultanés')).toBeInTheDocument()
    expect(screen.getByText(/4 secteurs prioritaires nommés/)).toBeInTheDocument()
    expect(screen.getByText(/Combien de secteurs comptes-tu vraiment travailler/)).toBeInTheDocument()
    expect(screen.getByText(/La prospection se disperse/)).toBeInTheDocument()
    // #2066.18 — une rupture n'est plus un simple constat.
    expect(screen.getByText(/Resserrer la liste des secteurs prioritaires/)).toBeInTheDocument()
    expect(screen.getByText(/Nombre de secteurs prioritaires nommés simultanément/)).toBeInTheDocument()
    expect(screen.getByText('Déduit')).toBeInTheDocument()
  })

  // #2066.10/.17 — la conclusion NOMMÉE, jamais inventée sans rupture.
  describe('conclusion — situer OÙ l’information ou l’action se perd', () => {
    it('n’affiche AUCUNE conclusion quand aucune étape n’est en rupture', () => {
      render(<AuditChain stages={[stage({ key: 'contact' }), stage({ key: 'exchange' })]} />)
      expect(screen.queryByText(/Le problème se situe/)).not.toBeInTheDocument()
    })

    it('nomme la rupture ET l’étape juste avant, quand la première rupture n’est pas la première étape', () => {
      render(<AuditChain stages={[stage({ key: 'contact' }), RUPTURE_STAGE_AT_EXCHANGE]} />)
      expect(
        screen.getByText(/Le problème se situe entre l.étape « Contact » et l.étape « Échange »\./),
      ).toBeInTheDocument()
    })

    it('nomme SEULEMENT l’étape quand la toute première étape est déjà en rupture', () => {
      render(<AuditChain stages={[RUPTURE_STAGE]} />)
      expect(screen.getByText(/Le problème se situe au niveau de l.étape « Contact »\./)).toBeInTheDocument()
    })
  })
})

const RUPTURE_STAGE_AT_EXCHANGE: AuditChainStage = stage({
  key: 'exchange',
  state: 'rupture',
  ruptures: [
    {
      ruleId: 'offerWithoutProof',
      facts: ['Angle de valeur formulé'],
      tension: 'Une offre affirmée, sans aucun point de différenciation nommé pour la crédibiliser.',
      possibleExplanation: null,
      questionToValidate: null,
      consequenceIfUnaddressed: null,
      recommendation: "Nommer au moins un point de différenciation concret pour appuyer l'angle de valeur.",
      indicator: 'Nombre de points de différenciation nommés.',
      confidence: 'deduced',
    },
  ],
})
