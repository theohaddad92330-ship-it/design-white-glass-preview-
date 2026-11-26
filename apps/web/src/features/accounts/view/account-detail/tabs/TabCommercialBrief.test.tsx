import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { CommercialBrief } from '@bellum/contracts'
import bpce from '../../../../../../../../packages/contracts/src/commercial-brief/bpce.fixture.json'
import { parseCommercialBrief } from './brief/parseCommercialBrief'
import { TabCommercialBrief } from './TabCommercialBrief'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const brief = (patch: Partial<CommercialBrief> = {}): CommercialBrief => {
  const parsed = parseCommercialBrief({ commercial_brief: structuredClone(bpce) })
  if (!parsed) throw new Error('la fixture BPCE doit être valide')
  return { ...parsed, ...patch }
}

describe('#brief-commercial — parseCommercialBrief', () => {
  it('lit raw_analysis.commercial_brief quand il est valide', () => {
    expect(parseCommercialBrief({ commercial_brief: structuredClone(bpce) })?.account_name).toBe('BPCE')
  })

  it('rend null quand la clé est absente, nulle ou raw_analysis vide', () => {
    expect(parseCommercialBrief({})).toBeNull()
    expect(parseCommercialBrief(null)).toBeNull()
    expect(parseCommercialBrief({ commercial_brief: null })).toBeNull()
  })

  it('rend null quand le brief est invalide (colonne en trop : contrat fermé)', () => {
    expect(parseCommercialBrief({ commercial_brief: { ...structuredClone(bpce), colonne_brute: 1 } })).toBeNull()
    expect(parseCommercialBrief({ commercial_brief: { account_name: 'X' } })).toBeNull()
  })
})

describe('#brief-commercial — TabCommercialBrief', () => {
  it('R24 (15/10) — « Ce que je sais » ne s’écrit qu’UNE fois dans la page : le titre du brief, pas un second intertitre', () => {
    render(<TabCommercialBrief brief={brief()} />)
    expect(screen.getByText('title')).toBeTruthy()
    expect(screen.queryByText('knowledge.title')).toBeNull()
    expect(screen.getByTestId('brief-knowledge')).toBeTruthy()
  })

  it('rend les rubriques en deux colonnes « ce qu’on sait » / « ce que ça veut dire »', () => {
    render(<TabCommercialBrief brief={brief()} />)
    expect(screen.getByText('IDENTITÉ')).toBeTruthy()
    expect(screen.getByText(/Siège à Tours Duo, Paris 13e/)).toBeTruthy()
    expect(screen.getByText(/Les décisions se prennent à Paris/)).toBeTruthy()
    expect(screen.getAllByText('known').length).toBeGreaterThan(0)
    expect(screen.getAllByText('meaning').length).toBeGreaterThan(0)
  })

  it('14/10 : un siège « non confirmé » n’est pas répété dans l’en-tête du brief (la fiche le dit déjà)', () => {
    render(<TabCommercialBrief brief={brief({ headquarters: { label: 'Siège non confirmé', city: 'Paris' } })} />)
    expect(screen.queryByText(/Siège non confirmé/)).toBeNull()
    expect(screen.queryByText('headquarters')).toBeNull()
  })

  it('rend le bandeau KPI avec légende, sans jamais fabriquer de « 0 »', () => {
    render(<TabCommercialBrief brief={brief()} />)
    const kpis = screen.getByTestId('brief-kpis')
    expect(within(kpis).getByText('650 €/j')).toBeTruthy()
    expect(within(kpis).getByText('canal direct uniquement')).toBeTruthy()
    expect(within(kpis).queryByText('0')).toBeNull()
  })

  it('n’affiche pas de bandeau KPI quand il n’y a aucune tuile', () => {
    render(<TabCommercialBrief brief={brief({ kpis: [] })} />)
    expect(screen.queryByTestId('brief-kpis')).toBeNull()
  })

  it('groupe les prix PAR CANAL, jamais de moyenne', () => {
    const b = brief({
      prices: [
        { label: 'Dev senior', amount_eur_per_day: 650, channel: 'direct' },
        { label: 'Dev senior', amount_eur_per_day: 480, channel: 'portage' },
        { label: 'Architecte', amount_eur_per_day: 800, channel: 'direct' },
      ],
    })
    render(<TabCommercialBrief brief={b} />)
    const direct = screen.getByTestId('brief-prices-direct')
    expect(within(direct).getByText('Dev senior')).toBeTruthy()
    expect(within(direct).getByText('Architecte')).toBeTruthy()
    const portage = screen.getByTestId('brief-prices-portage')
    expect(within(portage).getByText('Dev senior')).toBeTruthy()
    expect(within(portage).queryByText('Architecte')).toBeNull()
    expect(screen.queryByTestId('brief-prices-msp')).toBeNull()
    // pas de moyenne : (650+480+800)/3 ≈ 643, (650+800)/2 = 725
    expect(screen.queryByText(/643|725/)).toBeNull()
  })

  it('porte le badge « Sorti du groupe » sur une entité exited, pas sur une active', () => {
    render(<TabCommercialBrief brief={brief()} />)
    const exited = screen.getByTestId('brief-entity-Ancienne Filiale')
    expect(within(exited).getByText('entities.exited')).toBeTruthy()
    const active = screen.getByTestId('brief-entity-BPCE IT')
    expect(within(active).queryByText('entities.exited')).toBeNull()
  })

  it('#4994 — une entité à explorer ne montre ni code NAF ni SIREN (note, nature, nom), et une note vidée ne fait aucune ligne', () => {
    const base = brief()
    const entities = [
      {
        name: 'Cartier',
        nature: 'NAF 92.3B, SIREN 341902898',
        note: 'NAF 90.01Z, arts du spectacle',
        status: 'active' as const,
      },
      { name: 'Cartier Bis', nature: 'SIREN 321130346', note: 'NAF 92.3B', status: 'active' as const },
    ]
    render(<TabCommercialBrief brief={{ ...base, entities }} />)
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/NAF\s*\d/)
    expect(text).not.toMatch(/SIREN\s*\d/)
    expect(within(screen.getByTestId('brief-entity-Cartier')).getByText('arts du spectacle')).toBeTruthy()
    expect(screen.getByTestId('brief-entity-Cartier Bis').querySelectorAll('p, span').length).toBe(1)
  })

  it('badge de niveau de preuve ESN', () => {
    render(<TabCommercialBrief brief={brief()} />)
    expect(screen.getByText('esn.evidence.observed')).toBeTruthy()
  })

  it('les personnes ne sont PAS listées : seulement le compte par rôle', () => {
    render(<TabCommercialBrief brief={brief()} />)
    expect(screen.queryByText('Camille Exemple')).toBeNull()
    expect(screen.getByTestId('brief-people-count')).toBeTruthy()
  })

  it('rend une section générique en tableau', () => {
    render(<TabCommercialBrief brief={brief()} />)
    expect(screen.getByText('Migration cloud')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Projet' })).toBeTruthy()
  })

  it('rend les graphiques en barres', () => {
    render(<TabCommercialBrief brief={brief()} />)
    expect(screen.getByText('Contacts par direction')).toBeTruthy()
    expect(screen.getByText('DSI')).toBeTruthy()
  })

  it('démo clients 04/10 — un libellé de graphique n’est ni tronqué sur une ligne ni borné à 160 px', () => {
    const long = 'Support Technique Cloud et infrastructure managée'
    render(
      <TabCommercialBrief
        brief={brief({ charts: [{ title: 'Prix observés', items: [{ label: long, value: 3 }] }] })}
      />,
    )
    const label = screen.getByText(long)
    expect(label.getAttribute('title')).toBe(long)
    // retour à la ligne (2 lignes max puis ellipsis), jamais `truncate` (nowrap)
    expect(label.className).not.toMatch(/\btruncate\b|whitespace-nowrap/)
    expect(label.className).toContain('line-clamp-2')
    const row = label.closest('li')
    // colonne de libellé fluide à partir de 768 px, jamais 10rem (160 px) figés
    expect(row?.className).toMatch(/md:grid-cols-\[minmax\(10rem,22rem\)_1fr_auto\]/)
    expect(row?.className).not.toMatch(/(^|\s)grid-cols-\[minmax\(0,10rem\)/)
    // sous 768 px : libellé au-dessus de la barre (sur toute la largeur)
    expect(label.className).toContain('col-span-2')
  })

  it('ne rend PLUS la section Garde-fous (Louis 13/10/2026), même si le brief en porte', () => {
    render(<TabCommercialBrief brief={brief()} />)
    expect(screen.queryByTestId('brief-guardrails')).toBeNull()
    expect(screen.queryByText(/Le siège est Tours Duo/)).toBeNull()
  })
})

describe('#5106.9 — la section achats n’est plus un tableau dans « Ce que je sais »', () => {
  const procurement = {
    key: 'achats-avant-d-appeler',
    title: 'ACHATS AVANT D’APPELER',
    columns: [
      { key: 'element', label: 'ÉLÉMENT' },
      { key: 'nom', label: 'NOM' },
    ],
    rows: [{ element: 'Plateforme', nom: 'Portail A' }],
  }

  it('rend une ligne-lien vers Pratiques achats, et plus le tableau', () => {
    const open = vi.fn()
    const base = brief()
    render(
      <TabCommercialBrief brief={{ ...base, sections: [...base.sections, procurement] }} onOpenProcurement={open} />,
    )
    expect(screen.queryByTestId('brief-section-achats-avant-d-appeler')).toBeNull()
    expect(screen.queryByText('Portail A')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'procurement.briefLink' }))
    expect(open).toHaveBeenCalledTimes(1)
    // Les autres sections du brief restent rendues.
    expect(screen.getByTestId(`brief-section-${base.sections[0]!.key}`)).toBeTruthy()
  })

  it('sans renvoi fourni (brief de marché), la section reste un tableau', () => {
    const base = brief()
    render(<TabCommercialBrief brief={{ ...base, sections: [...base.sections, procurement] }} />)
    expect(screen.getByTestId('brief-section-achats-avant-d-appeler')).toBeTruthy()
  })
})
