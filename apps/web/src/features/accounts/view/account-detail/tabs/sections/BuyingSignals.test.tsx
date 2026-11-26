import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BuyingSignals } from './BuyingSignals'

describe('BuyingSignals — #3668', () => {
  it('range le contexte après les pistes et le marque « Contexte »', () => {
    render(
      <BuyingSignals
        signals={[
          {
            signal: 'Programme climat 2030',
            selection_role: 'context',
            selection_reason: 'Programme général',
            date: '2026-09-10',
          },
          { signal: 'Appel d’offres lot 2', selection_role: 'lead', date: '2026-09-10' },
        ]}
      />,
    )
    const rows = screen.getAllByText(/Programme climat 2030|Appel d’offres lot 2/)
    expect(rows[0]?.textContent).toContain('Appel d’offres lot 2')
    expect(rows[1]?.textContent).toMatch(/^Contexte ·/)
  })

  // #3668.7 (recette démo 10/10) — « Contexte · Programme climat » introuvable sur SNCF : rangé APRÈS
  // les pistes, il tombait derrière « Voir plus » (3 lignes). Le contexte reste VISIBLE, comme promis.
  it('#3668.7 — le contexte rangé après de nombreuses pistes n’est pas replié derrière « Voir plus »', () => {
    render(
      <BuyingSignals
        signals={[
          ...Array.from({ length: 6 }, (_, index) => ({
            signal: `Piste ${index}`,
            selection_role: 'lead' as const,
            date: '2026-09-10',
          })),
          {
            signal: 'Programme climat 2030',
            selection_role: 'context',
            selection_reason: 'Programme général',
            date: '2026-09-10',
          },
        ]}
      />,
    )
    expect(screen.getByText(/Contexte · Programme climat 2030/)).toBeTruthy()
    expect(screen.queryByText('Piste 5')).toBeNull()
  })

  it('une source injoignable ne se lit pas « aucun signal » et nomme une famille, jamais un fournisseur', () => {
    render(
      <BuyingSignals
        signals={[]}
        coverage={{ status: 'incomplete', unreachable: [{ source: 'brave_news', reason: 'timeout' }] }}
      />,
    )
    expect(screen.getByText(/Recherche incomplète : presse/)).toBeTruthy()
    expect(screen.queryByText(/brave/i)).toBeNull()
  })

  it('sources consultées sans résultat : la formulation « dans les sources consultées »', () => {
    render(<BuyingSignals signals={[]} coverage={{ status: 'none_found' }} />)
    expect(screen.getByText(/dans les sources consultées/)).toBeTruthy()
  })

  it('#3925 — « Voir l’offre » sur la carte du signal d’offre elle-même, vers l’URL source', () => {
    render(
      <BuyingSignals
        signals={[
          {
            signal: 'Offre : Architecte cloud',
            url: 'https://carrieres.example/offre-42',
            source_kind: 'job',
            date: '2026-09-10',
          },
        ]}
      />,
    )
    const link = screen.getByRole('link', { name: /Voir l.offre/ })
    expect(link.getAttribute('href')).toBe('https://carrieres.example/offre-42')
  })

  it('#3925 — SAIT DIRE NON : sans URL, aucun lien et aucune mention de lien manquant', () => {
    render(<BuyingSignals signals={[{ signal: 'Offre : Architecte cloud', source_kind: 'job', date: '2026-09-10' }]} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText(/Sans lien/)).toBeNull()
  })

  it('#3817.3 — un seul signal suffit à s’afficher, aucun nombre minimal imposé', () => {
    render(<BuyingSignals signals={[{ signal: 'Un seul signal détecté', date: '2026-09-10' }]} />)
    expect(screen.getByText('Un seul signal détecté')).toBeTruthy()
  })

  // #3917.1 — chaque article de la liste porte son média et sa date quand la donnée les a.
  it('#3917.1 — la ligne de liste nomme le média et la date du signal', () => {
    render(
      <BuyingSignals
        signals={[
          { signal: 'Contrat cloud remporté', source: "L'Usine Nouvelle", date: '2026-04-12' },
          { signal: 'Nouvelle DSI nommée', source: 'Les Échos', date: '2026-04-02' },
        ]}
      />,
    )
    expect(screen.getByText(/L'Usine Nouvelle · 12 avr\. 2026/)).toBeTruthy()
    expect(screen.getByText(/Les Échos · 2 avr\. 2026/)).toBeTruthy()
    // SAIT DIRE NON : rien d'inventé quand la date n'est pas connue.
    expect(screen.queryByText(/non daté/i)).toBeNull()
  })

  it('#3917.1 — un jeton de traçabilité « [P1] » ne tient pas lieu de média', () => {
    render(<BuyingSignals signals={[{ signal: 'Signal X', source: '[P1]', date: '2026-04-12' }]} />)
    expect(screen.queryByText(/\[P1\]/)).toBeNull()
    expect(screen.getByText(/12 avr\. 2026/)).toBeTruthy()
  })

  // #4142 — Veolia : le même fait servi deux fois, sous deux formulations. Dédoublonné AU RENDU.
  it('#4142 — deux formulations du même fait (même lien, jour voisin) : UNE ligne, la plus riche', () => {
    render(
      <BuyingSignals
        signals={[
          {
            signal: 'Veolia lance un appel d’offres cloud pour sa DSI',
            url: 'https://www.lemagit.fr/actualites/veolia-cloud',
            date: '2026-09-10',
          },
          {
            signal: 'Appel d’offres cloud lancé par Veolia pour sa DSI',
            url: 'https://www.lemagit.fr/actualites/veolia-cloud?utm_source=x',
            date: '2026-09-11',
            selection_reason: 'Budget de 12 M€ sur trois ans.',
          },
        ]}
      />,
    )
    expect(screen.getAllByText(/appel d’offres cloud/i)).toHaveLength(1)
  })

  it('#4142 — ⚠️ SAIT DIRE NON : deux faits distincts le même jour restent deux lignes', () => {
    render(
      <BuyingSignals
        signals={[
          { signal: 'Veolia lance un appel d’offres cloud pour sa DSI', date: '2026-09-10' },
          { signal: 'Veolia nomme un nouveau directeur des achats IT', date: '2026-09-10' },
        ]}
      />,
    )
    expect(screen.getByText(/appel d’offres cloud/i)).toBeTruthy()
    expect(screen.getByText(/directeur des achats IT/i)).toBeTruthy()
  })
})

// #3917.r39 — Thales : 18 items dont 2 sans date et 1 « 2026 » seul ; « Voir plus (25) » pour 18 au total.
describe('BuyingSignals — #3917.r39', () => {
  // Trois jours d'écart : « Actu 1 » et « Actu 2 » la veille l'une de l'autre seraient le MÊME fait pour le
  // prédicat de quasi-doublon (#4142, `signal-dedupe`) — ici on compte des actualités distinctes.
  const dated = (n: number) => ({ signal: `Actu ${n}`, date: `2026-09-${String(n * 3 + 1).padStart(2, '0')}` })

  it('retire les actualités sans date au jour (absente ou année seule)', () => {
    render(
      <BuyingSignals
        signals={[
          dated(1),
          { signal: 'Sans date' },
          { signal: 'Année seule', date: '2026' },
          { signal: 'Mois seul', date: 'septembre 2026' },
        ]}
      />,
    )
    expect(screen.getByText('Actu 1')).toBeTruthy()
    expect(screen.queryByText('Sans date')).toBeNull()
    expect(screen.queryByText('Année seule')).toBeNull()
    expect(screen.queryByText('Mois seul')).toBeNull()
  })

  it('« Voir plus (N) » égale exactement ce que le clic révèle, calculé après filtrage', () => {
    const signals = [
      ...Array.from({ length: 10 }, (_, i) => dated(i)),
      ...Array.from({ length: 6 }, (_, i) => ({ signal: `Undated ${i}` })),
    ]
    render(<BuyingSignals signals={signals} />)
    expect(screen.getAllByTestId('why-now-item-meta')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: /Voir plus \(7\)/ }))
    expect(screen.getAllByTestId('why-now-item-meta')).toHaveLength(10)
  })

  // #4294.10 (#4142.5) — cas réel Thales : deux offres quasi jumelles, deux villes, UNE ligne.
  it('#4294.10 — deux offres au même intitulé normalisé se replient en « 2 offres (Toulouse, Aix) »', () => {
    render(
      <BuyingSignals
        signals={[
          {
            signal: 'Senior Consultant Stratégie DATA / IA',
            location: 'Toulouse',
            source_kind: 'job',
            date: '2026-09-10',
          },
          { signal: 'Senior consultant Stratégie Data et IA', location: 'Aix', source_kind: 'job', date: '2026-09-10' },
        ]}
      />,
    )
    expect(screen.getAllByText(/Senior consultant Stratégie/i)).toHaveLength(1)
    expect(screen.getByText(/2 offres \(Toulouse, Aix\)/)).toBeTruthy()
  })
})
