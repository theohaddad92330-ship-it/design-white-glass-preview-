import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MessageBrief, MessageInsight } from '@/lib/message-insight'
import { MessageInsightPanel } from './MessageInsightPanel'

describe('MessageInsightPanel — champs absents (API ancienne pendant le déploiement)', () => {
  it('ne rend rien pour une réponse sans aucun de ces champs', () => {
    const { container } = render(<MessageInsightPanel insight={{}} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('MessageInsightPanel — raison du choix et données utilisées (#1926.29 / .30)', () => {
  const insight: MessageInsight = {
    rationale: 'Le contact a récemment recruté sur la cybersécurité.',
    specificity: {
      status: 'specifique',
      count: 2,
      minimum: 2,
      elements: [
        { kind: 'precise_contact', value: 'Camille Martin' },
        { kind: 'dated_signal', value: 'Recrutement RSSI, mars 2026' },
      ],
      unavailable: [],
    },
  }

  it('affiche la raison et les données utilisées avec des libellés humains, dans un bloc repliable', async () => {
    const u = userEvent.setup()
    render(<MessageInsightPanel insight={insight} />)

    const toggle = screen.getByRole('button', { name: 'Pourquoi ce message' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await u.click(toggle)

    expect(screen.getByText('Le contact a récemment recruté sur la cybersécurité.')).toBeInTheDocument()
    expect(screen.getByText('Camille Martin')).toBeInTheDocument()
    expect(screen.getByText('Recrutement RSSI, mars 2026')).toBeInTheDocument()
    // Jamais un nom de champ technique.
    expect(screen.queryByText('precise_contact')).not.toBeInTheDocument()
    expect(screen.queryByText('dated_signal')).not.toBeInTheDocument()
  })
})

describe('MessageInsightPanel — message générique (décision : avertir, sans surcoût)', () => {
  it('avertit sur un verdict générique et propose les éléments disponibles pour enrichir', () => {
    render(
      <MessageInsightPanel
        insight={{
          specificity: {
            status: 'generique',
            count: 0,
            minimum: 2,
            elements: [],
            unavailable: ['available_consultant', 'access_path'],
          },
        }}
      />,
    )

    expect(screen.getByText('Message peu personnalisé')).toBeInTheDocument()
    expect(screen.getByText(/territoire/)).toBeInTheDocument()
    expect(screen.queryByText(/consultant disponible/)).not.toBeInTheDocument()
  })

  it('n’avertit jamais sur un dossier non évaluable', () => {
    render(
      <MessageInsightPanel
        insight={{
          specificity: { status: 'non_evaluable', count: 0, minimum: 2, elements: [], unavailable: [] },
        }}
      />,
    )

    expect(screen.queryByText('Message peu personnalisé')).not.toBeInTheDocument()
  })
})

const BRIEF_BASE: MessageBrief = {
  objective: null,
  objectiveSource: 'defaut',
  relationship: null,
  persona: null,
  formality: 'vous',
  formalitySource: 'defaut',
  cta: 'question_facile',
  ctaSource: 'defaut',
  missing: [],
}

describe('MessageInsightPanel — brief manquant', () => {
  it('dit ce qui n’a pas pu être déterminé avant la rédaction', () => {
    render(
      <MessageInsightPanel insight={{ brief: { ...BRIEF_BASE, missing: ['objective', 'persona', 'decisionRole'] } }} />,
    )

    expect(screen.getByText(/l'objectif du message/)).toBeInTheDocument()
    expect(screen.getByText(/le niveau hiérarchique du contact/)).toBeInTheDocument()
    expect(screen.getByText(/le rôle dans la décision/)).toBeInTheDocument()
  })
})

describe('MessageInsightPanel — rôle dans la décision (#3418.4, retour bêta 30/09)', () => {
  it('nomme le rôle avec son libellé humain quand il est connu', async () => {
    const u = userEvent.setup()
    render(<MessageInsightPanel insight={{ brief: { ...BRIEF_BASE, decisionRole: 'economic' } }} />)

    await u.click(screen.getByRole('button', { name: 'Pourquoi ce message' }))

    expect(screen.getByText('Décideur économique')).toBeInTheDocument()
    expect(screen.queryByText('economic')).not.toBeInTheDocument()
  })
})

describe('MessageInsightPanel — interdits de stade (#2887.5, composition des six attributs)', () => {
  it('nomme ce qui est évité pour cette relation quand le cadrage le porte', async () => {
    const u = userEvent.setup()
    render(
      <MessageInsightPanel
        insight={{
          brief: {
            ...BRIEF_BASE,
            forbidden: 'rappeler un historique flou ou reconstitué',
            forbiddenSource: 'relation',
          },
        }}
      />,
    )

    await u.click(screen.getByRole('button', { name: 'Pourquoi ce message' }))

    expect(screen.getByText('rappeler un historique flou ou reconstitué')).toBeInTheDocument()
  })

  it('ne nomme rien quand la relation ne porte aucune interdiction propre (froid, ou non mesurée)', () => {
    render(
      <MessageInsightPanel insight={{ brief: { ...BRIEF_BASE, forbidden: null, forbiddenSource: 'sans_objet' } }} />,
    )

    expect(screen.queryByRole('button', { name: 'Pourquoi ce message' })).not.toBeInTheDocument()
  })
})

describe('MessageInsightPanel — angle alternatif (#1926.28)', () => {
  const alternativeAngle = "L'autre angle : le renouvellement de leur contrat cloud."

  it('affiche l’angle alternatif SANS bouton quand aucun chemin de régénération n’est fourni', () => {
    render(<MessageInsightPanel insight={{ alternativeAngle }} />)

    expect(screen.getByText(new RegExp(alternativeAngle))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Utiliser cet angle' })).not.toBeInTheDocument()
  })

  it('propose « Utiliser cet angle » quand un chemin de régénération est fourni, et le passe verbatim', async () => {
    const u = userEvent.setup()
    const onUseAlternativeAngle = vi.fn()
    render(<MessageInsightPanel insight={{ alternativeAngle }} onUseAlternativeAngle={onUseAlternativeAngle} />)

    await u.click(screen.getByRole('button', { name: 'Utiliser cet angle' }))

    expect(onUseAlternativeAngle).toHaveBeenCalledWith(alternativeAngle)
  })
})

describe('MessageInsightPanel — changer le ton (#1926.31)', () => {
  const toneOptions = [
    { id: 'tutoiement', instruction: 'tutoiement' },
    { id: 'plus_court', instruction: 'plus court' },
  ]

  it('n’affiche aucun bouton de ton quand aucune régénération par ton n’existe', () => {
    render(<MessageInsightPanel insight={{ toneOptions }} />)

    expect(screen.queryByRole('button', { name: 'Tutoiement' })).not.toBeInTheDocument()
  })

  it('affiche un bouton par option de ton et transmet l’option cliquée', async () => {
    const u = userEvent.setup()
    const onChangeTone = vi.fn()
    render(<MessageInsightPanel insight={{ toneOptions }} onChangeTone={onChangeTone} />)

    await u.click(screen.getByRole('button', { name: 'Tutoiement' }))

    expect(onChangeTone).toHaveBeenCalledWith(toneOptions[0])
  })
})

describe('MessageInsightPanel — sources documentaires et mots interdits (#3752)', () => {
  it('nomme les documents de l’espace réellement injectés, dans « Pourquoi ce message »', async () => {
    const u = userEvent.setup()
    const insight: MessageInsight = {
      knowledgeSources: [
        { docId: 'd1', title: 'Cas client WMS' },
        { docId: 'd2', title: 'Offre forfait' },
      ],
    }
    render(<MessageInsightPanel insight={insight} />)

    await u.click(screen.getByRole('button', { name: /Pourquoi ce message/ }))

    expect(screen.getByText('Sources documentaires')).toBeInTheDocument()
    expect(screen.getByText('Cas client WMS')).toBeInTheDocument()
    expect(screen.getByText('Offre forfait')).toBeInTheDocument()
  })

  it('nomme les mots interdits qui ont survécu à la régénération', () => {
    render(<MessageInsightPanel insight={{ lexiconWarning: { terms: ['synergie', 'ESN'] } }} />)

    expect(screen.getByText(/Mots que ton ESN s'interdit/)).toHaveTextContent('synergie · ESN')
  })

  it('ne rend rien sans source ni avertissement', () => {
    const { container } = render(<MessageInsightPanel insight={{ knowledgeSources: [], lexiconWarning: null }} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('MessageInsightPanel — longueur du canal (#2371.5, sixième attribut composé)', () => {
  it('nomme la longueur visée quand le cadrage la porte', async () => {
    const u = userEvent.setup()
    render(
      <MessageInsightPanel
        insight={{ brief: { ...BRIEF_BASE, length: 'Corps de 70 à 130 mots', lengthSource: 'canal' } }}
      />,
    )

    await u.click(screen.getByRole('button', { name: 'Pourquoi ce message' }))

    expect(screen.getByText('Longueur visée')).toBeInTheDocument()
    expect(screen.getByText('Corps de 70 à 130 mots')).toBeInTheDocument()
  })

  it('ne nomme aucune longueur quand le canal est inconnu (jamais devinée)', () => {
    render(<MessageInsightPanel insight={{ brief: { ...BRIEF_BASE, length: null, lengthSource: 'non_mesure' } }} />)

    expect(screen.queryByText('Longueur visée')).not.toBeInTheDocument()
  })
})
