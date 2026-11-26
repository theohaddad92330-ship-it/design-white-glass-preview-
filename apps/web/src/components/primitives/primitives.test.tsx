import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Provenance } from './Provenance'
import { ScoreWithAxes } from './ScoreWithAxes'
import { MeasuredValue, UnknownValue } from './UnknownValue'

describe('UnknownValue — la règle rendue visible', () => {
  it('écrit « non mesuré », jamais un zéro', () => {
    render(<UnknownValue />)
    expect(screen.getByText('non mesuré')).toBeInTheDocument()
  })

  it('porte le POURQUOI quand on le connaît', () => {
    // « non mesuré » répond à « combien ? ». Il ne répond pas à « est-ce que je
    // peux y faire quelque chose ? », qui est la question suivante.
    render(<UnknownValue reason="aucune facture payée sur la période" />)
    expect(screen.getByText(/aucune facture payée/)).toBeInTheDocument()
  })

  /**
   * « On n'a jamais su » et « on a su, c'était il y a huit mois » ne mènent pas
   * au même geste : la première demande d'aller chercher, la seconde de
   * revérifier. Rendues du même gris et de la même phrase, elles se confondent.
   *
   * La notion existe déjà pour les faits d'accès, qui portent leurs demi-vies et
   * affichent « information du 12 mars, à revérifier ». Elle vivait là et nulle
   * part ailleurs : chaque écran qui voulait la même chose devait recomposer la
   * phrase à la main, donc presque aucun ne le faisait.
   */
  it('distingue « jamais su » de « su, mais périmé »', () => {
    const { rerender } = render(<UnknownValue />)
    expect(screen.getByText('non mesuré')).toBeInTheDocument()

    rerender(<UnknownValue staleSince={new Date('2026-03-12T09:00:00Z')} />)
    expect(screen.getByText(/12\/03\/2026/)).toBeInTheDocument()
    expect(screen.getByText(/à revérifier/)).toBeInTheDocument()
    // Ce n'est PAS « non mesuré » : la valeur a existé.
    expect(screen.queryByText(/^non mesuré$/)).toBeNull()
  })

  it('une date illisible retombe sur « non mesuré » plutôt que d’afficher « Invalid Date »', () => {
    // Une date cassée ne doit pas produire un libellé qui ressemble à un bug
    // d'affichage : l'information honnête restante est « je ne sais pas ».
    render(<UnknownValue staleSince={new Date('pas-une-date')} />)
    expect(screen.getByText('non mesuré')).toBeInTheDocument()
  })

  it('la raison explicite l’emporte sur la date — c’est l’écran qui sait', () => {
    render(<UnknownValue staleSince={new Date('2026-03-12')} reason="le fournisseur ne répond plus" />)
    expect(screen.getByText(/ne répond plus/)).toBeInTheDocument()
  })
})

describe('UnknownValue discret — une cellule de tableau dense (#2737)', () => {
  it('montre un tiret atténué, mais son NOM reste « non mesuré » — jamais un zéro', () => {
    const { container } = render(<UnknownValue discreet />)
    // Le lecteur d'écran et l'infobulle disent l'absence ; l'œil voit un tiret
    // qui ne noie pas la ligne sous « non mesuré » répété dix fois.
    expect(screen.getByText('non mesuré')).toHaveClass('sr-only')
    expect(container.firstElementChild?.getAttribute('title')).toBe('non mesuré')
    expect(container.textContent).not.toMatch(/\b0\b/)
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('—')
  })

  it('garde la raison dans l’infobulle et pour le lecteur d’écran', () => {
    const { container } = render(<UnknownValue discreet reason="relecture en attente" />)
    expect(container.firstElementChild?.getAttribute('title')).toBe('relecture en attente')
    expect(screen.getByText('non mesuré — relecture en attente')).toHaveClass('sr-only')
  })
})

describe('MeasuredValue', () => {
  it('rend la valeur quand elle existe — y compris un vrai zéro', () => {
    // Zéro contact EST une valeur. La primitive ne doit pas la manger.
    render(<MeasuredValue value={0} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('bascule sur « non mesuré » sur null et sur undefined', () => {
    const { rerender } = render(<MeasuredValue value={null} />)
    expect(screen.getByText('non mesuré')).toBeInTheDocument()
    rerender(<MeasuredValue value={undefined} />)
    expect(screen.getByText('non mesuré')).toBeInTheDocument()
  })
})

describe('ScoreWithAxes — un score n’est jamais nu', () => {
  it('affiche la note sur son maximum, jamais un pourcentage', () => {
    render(<ScoreWithAxes score={68} max={80} />)
    expect(screen.getByText(/68\/80/)).toBeInTheDocument()
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it('SIMON-FIX S.24 — chaque critère affiche son poids (points / plafond)', () => {
    render(
      <ScoreWithAxes
        score={45}
        max={85}
        axes={[
          { label: 'Périmètre', score: 20, weight: 20 },
          { label: 'Niveau de décision', score: 10, weight: 15 },
          { label: 'Disponibilité', score: null, weight: 10 },
        ]}
      />,
    )
    expect(screen.getByText('20/20')).toBeInTheDocument()
    expect(screen.getByText('10/15')).toBeInTheDocument()
  })

  it('recette 01/11 — critères à 390 px : libellé au-dessus de la valeur, jamais une colonne de valeur à 0 px', () => {
    render(<ScoreWithAxes score={45} max={85} axes={[{ label: 'Périmètre', score: 20, weight: 20, detail: 'x' }]} />)
    const row = screen.getByTestId('score-axis-row')
    // Pas de gabarit de colonnes fixe : la largeur se mesure à la carte, pas à la fenêtre.
    expect(row.className).not.toMatch(/grid-cols-\[/)
    expect(row.className).not.toMatch(/(?:^|\s)(?:sm|md|lg):grid-cols/)
    expect(row.className).toContain('flex-wrap')
    const [label, value] = Array.from(row.children)
    // Le libellé peut prendre la ligne entière ; la valeur garde une base minimale et casse ses mots.
    expect(label?.className).toMatch(/basis-/)
    expect(value?.className).toContain('min-w-0')
    expect(value?.className).toContain('break-words')
    expect(value?.className).toMatch(/basis-/)
    expect(row.className).not.toContain('whitespace-nowrap')
  })

  it('NOMME les axes non évaluables — pas seulement leur nombre', () => {
    render(
      <ScoreWithAxes
        score={61}
        max={100}
        axes={[
          { label: 'Disponibilité', score: null },
          { label: 'Langues', score: null },
          { label: 'Compétences', score: 80 },
        ]}
      />,
    )
    expect(screen.getByText(/Disponibilité, Langues/)).toBeInTheDocument()
  })

  it('dit qu’il n’y a pas de note plutôt que d’en afficher une à zéro', () => {
    render(<ScoreWithAxes score={null} max={100} reason="deux axes évalués sur les trois nécessaires" />)
    expect(screen.getByText(/non mesuré/)).toBeInTheDocument()
    expect(screen.getByText(/deux axes évalués/)).toBeInTheDocument()
  })

  it('garde ses AXES quand il n’y a pas de note', () => {
    // La primitive promet deux choses — « avec ses axes ET ce qui n'a pas pu être
    // évalué » — et n'en tenait qu'une : dès que le score manquait, elle jetait
    // les axes. C'est pourtant le profil dont on a le plus besoin de savoir ce
    // qui a manqué : « non mesuré » répond à « combien ? », les axes répondent à
    // « qu'est-ce que je complète ? », et c'est la seconde qui mène à un geste.
    render(
      <ScoreWithAxes
        score={null}
        max={100}
        axes={[
          { label: 'Compétences', score: 80 },
          { label: 'Disponibilité', score: null },
          { label: 'Langues', score: null },
        ]}
      />,
    )
    expect(screen.getByText(/non mesuré/)).toBeInTheDocument()
    expect(screen.getByText('Compétences')).toBeInTheDocument()
    expect(screen.getByText(/Disponibilité, Langues/)).toBeInTheDocument()
  })

  it('reste sur UNE ligne en cellule de tableau, même sans note', () => {
    // `compact` sert une colonne : les axes y vivent en infobulle, les faire
    // descendre casserait la lecture d'un tableau.
    render(<ScoreWithAxes score={null} max={100} compact axes={[{ label: 'Disponibilité', score: null }]} />)
    expect(screen.getByText(/non mesuré/)).toBeInTheDocument()
    expect(screen.queryByText(/Disponibilité/)).toBeNull()
  })
})

describe('Provenance — d’où vient la valeur, et de quand', () => {
  it('porte la source ET la date', () => {
    // R15-10 — `observedAt` reçoit une date BRUTE, pas une date déjà mise en
    // forme : la primitive la formate elle-même (`formatDate`, la seule
    // dérivation « date lisible » du front, GA-26). Ce test passait
    // « 12/03/2026 », une date d'AFFICHAGE française, que `new Date()` relit à
    // l'américaine — le 12 mars devenait le 3 décembre, sans rien dire.
    render(<Provenance source="public" observedAt="2026-03-12T00:00:00.000Z" />)
    expect(screen.getByText(/source publique/)).toBeInTheDocument()
    expect(screen.getByText(/mars 2026/)).toBeInTheDocument()
  })

  it('se contente de la source quand la date manque', () => {
    render(<Provenance source="human" />)
    expect(screen.getByText('Information de ton équipe')).toBeInTheDocument()
  })

  // #3672.1 — plus aucun nom de brique interne ; la date et la certitude restent.
  it('ne nomme aucune brique interne, quelle que soit la provenance', () => {
    const sources = [
      'human',
      'connector',
      'pipeline',
      'model',
      'public',
      'human_correction',
      'current_data',
      'dataforge',
      'market_memory',
      'inference',
      'registry_identity',
      'connected_tools',
      'public_sources',
    ] as const
    for (const source of sources) {
      const { container, unmount } = render(<Provenance source={source} />)
      expect(container.textContent).not.toMatch(/dataforge|market memory|mémoire marché|rag\b|modèle|model/i)
      unmount()
    }
  })

  // #3672.3 — un historique de 2024 reste identifiable comme historique, daté.
  it('un historique observé garde son libellé ET sa date', () => {
    render(<Provenance source="dataforge" observedAt="2024-06-15T00:00:00.000Z" />)
    expect(screen.getByText(/Historique observé/)).toBeInTheDocument()
    expect(screen.getByText(/2024/)).toBeInTheDocument()
  })

  // #3672.4 — retirer le jargon ne transforme pas une hypothèse en affirmation.
  it('une hypothèse se lit « à valider », jamais « vérifiée »', () => {
    for (const source of ['model', 'inference'] as const) {
      const { container, unmount } = render(<Provenance source={source} />)
      expect(container.textContent).toMatch(/Hypothèse à valider/)
      expect(container.textContent).not.toMatch(/vérifi/i)
      unmount()
    }
  })
})
