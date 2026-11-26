import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CommercialAuditContext } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AuditDeclaredSignals } from './AuditDeclaredSignals'

/**
 * #2042.15 · #2043.10 · #2049.15 · #2050.14 · #2051.16 — L'ÉCRAN, mesuré.
 *
 * Ce que ce fichier garde : que les cinq signaux ARRIVENT à l'œil, et que
 * l'écran ne s'autorise jamais un pourcentage ni un « 0 » de remplissage sur
 * une étape non comptée.
 */

type Signals = NonNullable<CommercialAuditContext['declaredSignals']>

const SIGNALS: Signals = {
  funnelBreak: {
    kind: 'break',
    stage: 'Réponses obtenues',
    unit: 'réponses',
    trackedStages: ['Comptes travaillés', 'Contacts sollicités'],
    untrackedStages: ['Réponses obtenues'],
  },
  startingPoint: {
    kind: 'differsFromAmbition',
    declaredStates: ['Correspond au profil théorique'],
    reachableToday: [],
    gaps: ['Hors réseau actuel, prospection à froid nécessaire'],
  },
  entryAxis: {
    kind: 'measured',
    axis: 'bottomUp',
    declaredResponseLevel: 'Niveau opérationnel',
    aimedEntryStrategy: 'topDown',
    divergesFromAim: true,
  },
  frontsBudget: {
    kind: 'measured',
    maxFronts: 1,
    band: '2 à 5 heures par semaine',
    source: 'protected',
    erosionRisks: ['Je bloque des créneaux mais ils sautent souvent'],
  },
  routineSeeds: {
    kind: 'measured',
    seeds: [
      {
        breakDeclared: 'Un compte reste sans prochaine action',
        practice: 'Une prochaine action datée sur chaque compte',
        alreadyHeld: false,
      },
    ],
    unrouted: ['Un besoin est mal qualifié au départ'],
  },
}

const FUNNEL: CommercialAuditContext['funnel'] = [
  { stage: 'Comptes travaillés', count: null, measurement: 'tracked' },
  { stage: 'Contacts sollicités', count: null, measurement: 'tracked' },
  { stage: 'Réponses obtenues', count: null, measurement: 'notTracked' },
]

const ALL_NOT_DECLARED: Signals = {
  funnelBreak: { kind: 'notDeclared' },
  startingPoint: { kind: 'notDeclared' },
  entryAxis: { kind: 'notDeclared' },
  frontsBudget: { kind: 'notDeclared' },
  routineSeeds: { kind: 'notDeclared' },
}

describe('AuditDeclaredSignals', () => {
  it('#2049.15 — NOMME l’étape où la trace s’arrête, et n’écrit AUCUN chiffre', async () => {
    renderWithRouter(<AuditDeclaredSignals declaredSignals={SIGNALS} funnel={FUNNEL} />)
    await screen.findByText('Comptes travaillés — compté')
    expect(screen.getByText('Réponses obtenues — non compté')).toBeInTheDocument()
    // Un « % » ou un compte inventé sur une étape non comptée serait le défaut
    // EXACT que cette issue répare.
    expect(screen.queryByText(/%/)).toBeNull()
    expect(document.body.textContent).not.toMatch(/\b0\s*(?:réponses|rendez-vous|contacts)/)
  })

  it('#2042.15 / #2043.10 / #2050.14 / #2051.16 — les quatre autres signaux sont à l’écran', async () => {
    renderWithRouter(<AuditDeclaredSignals declaredSignals={SIGNALS} funnel={FUNNEL} />)
    // Le point de départ diverge, et l'écart est cité VERBATIM.
    expect(await screen.findByText('Hors réseau actuel, prospection à froid nécessaire')).toBeInTheDocument()
    // L'axe RÉEL et l'axe VISÉ, tous deux nommés — libellés lus dans `strategy.*`.
    expect(screen.getByText('entrée par le terrain')).toBeInTheDocument()
    expect(screen.getByText(/entrée par le haut/)).toBeInTheDocument()
    // Le budget de fronts, et la phrase qui interdit « plus d'outils ».
    expect(screen.getByText(/1 front à la fois/)).toBeInTheDocument()
    expect(screen.getByText(/pas plus d’outils/)).toBeInTheDocument()
    // La routine à configurer, et la rupture qu'aucune routine ne tient.
    expect(screen.getByText(/Une prochaine action datée sur chaque compte/)).toBeInTheDocument()
    expect(screen.getByText('Un besoin est mal qualifié au départ')).toBeInTheDocument()
  })

  it('un signal NON DÉCLARÉ se NOMME, il ne se tait pas et ne vaut pas zéro', async () => {
    renderWithRouter(<AuditDeclaredSignals declaredSignals={ALL_NOT_DECLARED} funnel={null} />)
    expect(await screen.findAllByText('non mesuré')).toHaveLength(5)
    expect(screen.getByText(/quelles unités tu comptes/)).toBeInTheDocument()
    expect(screen.getByText(/où tes dossiers décrochent/)).toBeInTheDocument()
  })

  it('« je ne sais pas encore où ça décroche » est rendu comme une RÉPONSE, pas comme un vide', async () => {
    renderWithRouter(
      <AuditDeclaredSignals
        declaredSignals={{ ...ALL_NOT_DECLARED, routineSeeds: { kind: 'notLocatedYet' } }}
        funnel={null}
      />,
    )
    expect(await screen.findByText(/c’est une réponse, pas un vide/)).toBeInTheDocument()
  })

  it('le zéro DÉCLARÉ a sa propre phrase — jamais « 0 fronts » par un pluriel', async () => {
    renderWithRouter(
      <AuditDeclaredSignals
        declaredSignals={{
          ...ALL_NOT_DECLARED,
          frontsBudget: {
            kind: 'measured',
            maxFronts: 0,
            band: 'Aucune heure dans une semaine ordinaire',
            source: 'declared',
            erosionRisks: [],
          },
        }}
        funnel={null}
      />,
    )
    expect(await screen.findByText(/Aucun front/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/0 fronts/)
  })

  it('aucune réponse LUE : le bloc entier se déclare non mesuré, pas vide', async () => {
    renderWithRouter(<AuditDeclaredSignals declaredSignals={null} funnel={null} />)
    expect(await screen.findByText(/n’ont pas pu être lues/)).toBeInTheDocument()
  })
})
