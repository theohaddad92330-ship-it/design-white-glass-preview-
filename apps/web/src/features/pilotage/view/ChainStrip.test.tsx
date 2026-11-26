import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PILOTAGE_LEVELS, type PilotageLevelReport, type PilotageMetric } from '@bellum/contracts'
import { describe, expect, it, vi } from 'vitest'

/**
 * #1433 — LA CHAÎNE COMMERCIALE EST UNE CHAÎNE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES GARDES TIENNENT
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Six maillons qui se suivent**, dans l'ordre du PARCOURS. Une grille de
 *    huit cartes égales disait huit mesures indépendantes ; le calcul, lui, juge
 *    chaque maillon en le comparant au précédent.
 * 2. **Économie et Qualité ne sont pas des maillons.** On ne « passe » pas par
 *    la marge : ce sont des lectures transverses, et les aligner avec les six
 *    ferait croire à une septième et une huitième étape.
 * 3. **Un maillon ne montre qu'une métrique** — celle qui mesure le passage.
 *    Les autres ne DISPARAISSENT pas : elles s'ouvrent au clic. C'est la raison
 *    pour laquelle réduire l'affichage ne réduit pas l'information, et c'est le
 *    point qu'une garde doit tenir.
 * 4. **Rien n'est perdu en route** : les huit maillons du contrat sont rendus,
 *    répartis entre la chaîne et les lectures transverses. Un niveau calculé que
 *    personne n'affiche est le défaut n°1 de ce dépôt.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string } & Record<string, unknown>) => (
    <a href={to} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
}))

const { ChainStrip } = await import('./ChainStrip')

function metric(key: string, value: number | null, unit: 'count' | 'rate' = 'count'): PilotageMetric {
  return { key, value, unit, status: value === null ? 'non_mesure' : 'ok' }
}

/** Le rapport complet, tel que le contrat le rend : les huit niveaux. */
function fullChain(overrides: Partial<Record<string, PilotageMetric[]>> = {}): PilotageLevelReport[] {
  return PILOTAGE_LEVELS.map(level => ({
    level,
    status: 'ok' as const,
    metrics: overrides[level] ?? [metric(`${level}_total`, 7)],
  }))
}

function show(levels: PilotageLevelReport[]) {
  return render(<ChainStrip levels={levels} baseline={undefined} known={new Set<string>()} />)
}

/** Les maillons sont des BOUTONS : ce qui se clique se tabule (GA-35). */
function maillons(): string[] {
  return screen.getAllByRole('button').map(button => button.getAttribute('aria-label') ?? '')
}

describe('la chaîne rend six maillons, dans l’ordre du parcours', () => {
  it('lit un corpus non vide : le contrat porte bien huit niveaux', () => {
    // Sans cette ligne, tout ce qui suit passerait au vert sur une liste vide.
    expect(PILOTAGE_LEVELS.length).toBe(8)
    show(fullChain())
    expect(maillons().length).toBeGreaterThan(0)
  })

  it('six boutons, et le rang de chacun est ANNONCÉ', () => {
    show(fullChain())
    const labels = maillons()

    expect(labels).toHaveLength(6)
    expect(labels[0]).toContain('étape 1 sur 6')
    expect(labels[5]).toContain('étape 6 sur 6')
    expect(labels[0]).toContain('Acquisition')
    expect(labels[5]).toContain('Expansion')
  })

  it('#3467 — les cartes d’une rangée ont la même hauteur : le <li> les ÉTIRE, il ne les centre pas', () => {
    // jsdom ne mesure rien : on garde la CLASSE qui donne la hauteur commune.
    // Sans `md:items-stretch`, chaque bouton garde la hauteur de son contenu
    // (92/108/126 px) et les bords hauts se décalent.
    show(fullChain())
    const items = screen.getAllByTestId('chain-item')
    expect(items).toHaveLength(6)
    for (const item of items) expect(item.className).toContain('md:items-stretch')
  })

  it('Économie et Qualité sortent de la chaîne mais RESTENT à l’écran', () => {
    const { container } = show(fullChain())

    expect(maillons().join(' ')).not.toContain('Économie')
    expect(maillons().join(' ')).not.toContain('Qualité')
    // Elles ne disparaissent pas : elles descendent en lectures transverses.
    expect(container.textContent).toContain('Économie')
    expect(container.textContent).toContain('Lectures transverses')
  })

  it('ne rend rien du tout quand le serveur n’a servi aucun maillon', () => {
    const { container } = show([])
    expect(container.textContent).toBe('')
  })
})

describe('un maillon montre la métrique du PASSAGE, et ouvre le reste', () => {
  it('affiche le TAUX plutôt que le volume quand le maillon en porte un', () => {
    show(fullChain({ conversation: [metric('emailsSent', 310), metric('replyRate', 0.42, 'rate')] }))

    const conversation = screen.getByRole('button', { name: /Conversation/ })
    expect(within(conversation).getByText('42 %')).toBeInTheDocument()
    // Le volume n'est pas sur le maillon : il est dans le détail.
    expect(within(conversation).queryByText('310')).toBeNull()
  })

  it('le clic OUVRE le détail, et le détail porte les métriques repliées', async () => {
    show(fullChain({ conversation: [metric('emailsSent', 310), metric('replyRate', 0.42, 'rate')] }))
    const conversation = screen.getByRole('button', { name: /Conversation/ })
    expect(conversation.getAttribute('aria-expanded')).toBe('false')

    await userEvent.click(conversation)

    expect(conversation.getAttribute('aria-expanded')).toBe('true')
    // 310 n'était nulle part avant le clic ; il est là après.
    expect(screen.getByText('310')).toBeInTheDocument()
  })

  it('un second clic referme — le détail n’est pas un aller simple', async () => {
    show(fullChain({ conversation: [metric('emailsSent', 310), metric('replyRate', 0.42, 'rate')] }))
    const conversation = screen.getByRole('button', { name: /Conversation/ })

    await userEvent.click(conversation)
    await userEvent.click(conversation)

    expect(conversation.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('310')).toBeNull()
  })

  it('un maillon SANS aucune métrique dit « non mesuré », jamais un vide', () => {
    show(fullChain({ sourcing: [] }))

    const sourcing = screen.getByRole('button', { name: /Sourcing/ })
    expect(within(sourcing).getByText('non mesuré')).toBeInTheDocument()
  })
})

describe('#3544.3 — « Contacts ciblés » vit sur le maillon Acquisition, sans clic', () => {
  it('la carte fermée porte le chiffre groupé ET son libellé, même quand il n’est pas mesuré', () => {
    show(fullChain({ acquisition: [metric('contactsTargeted', 34896), metric('signals', 12)] }))
    const card = screen.getAllByRole('button').find(b => (b.getAttribute('aria-label') ?? '').includes('1 sur'))
    expect(card).toBeDefined()
    expect(card?.textContent).toMatch(/34\s?896/)
    expect(card?.textContent).toContain('Contacts ciblés')
  })

  it('non mesuré : le libellé reste, le chiffre ne devient jamais 0', () => {
    show(fullChain({ acquisition: [metric('contactsTargeted', null)] }))
    const card = screen.getAllByRole('button').find(b => (b.getAttribute('aria-label') ?? '').includes('1 sur'))
    expect(card?.textContent).toContain('Contacts ciblés')
    expect(card?.textContent).not.toMatch(/\b0\b/)
  })
})
