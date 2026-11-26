import type { AccountAnalysis, AccountRegistryAnnouncements, RegistryAnnouncement } from '@bellum/contracts'
import { fireEvent } from '@testing-library/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CompanyPublicDataSection } from './CompanyPublicDataSection'
import { classifyLegalSeverity, mergeLegalNotices, readLegalNotices } from './legalNotices'

vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: null }),
}))

const registryState = vi.hoisted(() => ({ data: null as AccountRegistryAnnouncements | null }))
vi.mock('@/features/accounts/hooks/useAccountRegistryAnnouncements', () => ({
  useAccountRegistryAnnouncements: () => ({ data: registryState.data }),
}))

describe('legalNotices (#3916)', () => {
  it('une procédure collective est un RISQUE, tout le reste une information', () => {
    expect(classifyLegalSeverity({ type: 'Jugement de redressement judiciaire' })).toBe('risk')
    expect(classifyLegalSeverity({ type: 'Procédures collectives' })).toBe('risk')
    expect(classifyLegalSeverity({ type: 'Ouverture de sauvegarde' })).toBe('risk')
    expect(classifyLegalSeverity({ type: 'Liquidation judiciaire' })).toBe('risk')
    expect(classifyLegalSeverity({ type: 'Dépôts des comptes' })).toBe('info')
    expect(classifyLegalSeverity({ type: 'Dépôts des comptes', severity: 'risk' })).toBe('risk')
  })

  it('ignore les annonces sans type ni date lisibles et trie du plus récent au plus ancien', () => {
    const out = readLegalNotices([
      { type: 'Dépôts des comptes', date: '2026-01-10' },
      { type: null, date: null },
      { type: 'Modifications diverses', date: '2026-06-17' },
    ])
    expect(out.map(n => n.type)).toEqual(['Modifications diverses', 'Dépôts des comptes'])
  })

  it('#3916 — nomme le type PRÉCIS quand l’annonce le porte, jamais un type deviné', () => {
    const out = readLegalNotices([
      {
        type: 'Modifications diverses',
        precision: 'modification survenue sur le capital (diminution)',
        date: '2026-09-04',
      },
      { type: 'Dépôts des comptes', precision: null, date: '2026-06-01' },
    ])
    expect(out.map(n => n.type)).toEqual([
      'Modifications diverses — modification survenue sur le capital (diminution)',
      'Dépôts des comptes',
    ])
  })

  it('absent ou vide → liste vide', () => {
    expect(readLegalNotices(undefined)).toEqual([])
    expect(readLegalNotices([])).toEqual([])
  })
})

describe('Annonces légales sur la fiche compte (#3916)', () => {
  it('aucune annonce → aucune section', () => {
    render(<CompanyPublicDataSection analysis={{ legal_signals: [] }} />)
    expect(screen.queryByText('Annonces légales')).not.toBeInTheDocument()
  })

  it('affiche le libellé, la date, le lien quand il existe et « sans lien » sinon', () => {
    const analysis: AccountAnalysis = {
      legal_signals: [
        { type: 'Dépôts des comptes', date: '2026-06-30', url: 'https://www.bodacc.fr/a' },
        { type: 'Modifications diverses', date: '2026-04-10', url: null },
      ],
    }
    render(<CompanyPublicDataSection analysis={analysis} />)
    expect(screen.getByText('Annonces légales')).toBeInTheDocument()
    expect(screen.getByText('Dépôts des comptes')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: "Voir l'annonce" })
    expect(link).toHaveAttribute('href', 'https://www.bodacc.fr/a')
    expect(screen.getAllByText('sans lien')).toHaveLength(1)
  })

  it('une procédure collective porte le badge « Risque »', () => {
    render(
      <CompanyPublicDataSection
        analysis={{ legal_signals: [{ type: 'Jugement de liquidation judiciaire', date: '2026-06-17', url: null }] }}
      />,
    )
    expect(screen.getByText('Risque')).toBeInTheDocument()
  })
})

function registryRow(over: Partial<RegistryAnnouncement> = {}): RegistryAnnouncement {
  return {
    source: 'bodacc',
    kind: 'sale',
    type: 'Ventes et cessions',
    date: '2026-09-20',
    url: 'https://www.bodacc.fr/pages/annonce-visualisation/?q.id=id:A2',
    tribunal: null,
    ...over,
  }
}

describe('#3916.b — TOUTES les annonces lues en continu, pas les 8 de l’analyse', () => {
  it('fusionne l’analyse et la veille, sans doubler une annonce lue deux fois (même lien)', () => {
    const merged = mergeLegalNotices(
      [{ type: 'Ventes et cessions', date: '2026-09-20', url: registryRow().url }],
      [
        registryRow(),
        registryRow({ kind: 'collective_proceeding', type: 'Procédures collectives', date: '2026-10-05', url: null }),
      ],
    )
    expect(merged.map(n => [n.type, n.date])).toEqual([
      ['Procédures collectives', '2026-10-05'],
      ['Ventes et cessions', '2026-09-20'],
    ])
    // Le genre décidé à la source suffit : une procédure collective est un risque.
    expect(merged[0]?.severity).toBe('risk')
  })

  it('une ouverture d’établissement (Sirene) se nomme et renvoie à la page officielle', () => {
    const merged = mergeLegalNotices(undefined, [
      registryRow({
        source: 'sirene',
        kind: 'new_establishment',
        type: null,
        url: 'https://annuaire-entreprises.data.gouv.fr/etablissement/40335572600044',
      }),
    ])
    expect(merged[0]).toMatchObject({ type: 'Nouvel établissement', source: 'sirene', severity: 'info' })
  })

  it('#3921 (décision Louis 13/10/2026) — un changement d’effectif se nomme « observé », jamais « changé »', () => {
    const merged = mergeLegalNotices(undefined, [
      registryRow({
        source: 'sirene',
        kind: 'headcount_change',
        type: 'Effectif observé — 250 à 499 salariés',
        date: '2026-10-14',
        url: 'https://annuaire-entreprises.data.gouv.fr/entreprise/403355726',
      }),
    ])
    expect(merged[0]).toMatchObject({
      type: 'Effectif observé — 250 à 499 salariés',
      source: 'sirene',
      severity: 'info',
    })
  })

  it('#3921 — sans libellé porté par la ligne, le repli nomme quand même « observé »', () => {
    const merged = mergeLegalNotices(undefined, [
      registryRow({ source: 'sirene', kind: 'headcount_change', type: null, date: '2026-10-14' }),
    ])
    expect(merged[0]?.type).toBe('Effectif observé')
  })

  it('#3921.11 — les événements du registre national (dirigeant, fermeture) sont des annonces datées', () => {
    const merged = mergeLegalNotices(undefined, [
      registryRow({ source: 'rne', kind: 'executive_change', type: 'Changement de dirigeant', date: '2026-10-12' }),
      registryRow({ source: 'rne', kind: 'establishment_closure', type: null, date: '2026-09-02', url: null }),
    ])
    expect(merged.map(n => [n.type, n.source, n.severity])).toEqual([
      ['Changement de dirigeant', 'rne', 'info'],
      ["Fermeture d'établissement", 'rne', 'info'],
    ])
  })

  it('au-delà de 8 annonces, toutes restent accessibles d’un geste', () => {
    registryState.data = {
      announcements: Array.from({ length: 11 }, (_, i) =>
        registryRow({ date: `2026-09-${String(10 + i).padStart(2, '0')}`, url: `https://www.bodacc.fr/a${i}` }),
      ),
      checkedAt: '2026-10-09T04:10:00.000Z',
      truncated: false,
    }
    render(<CompanyPublicDataSection analysis={{}} accountId="acc-1" />)
    expect(screen.getAllByRole('link', { name: "Voir l'annonce" })).toHaveLength(8)
    fireEvent.click(screen.getByRole('button', { name: 'Voir plus (3)' }))
    expect(screen.getAllByRole('link', { name: "Voir l'annonce" })).toHaveLength(11)
    expect(screen.getByText(/Registre relu le/)).toBeInTheDocument()
    registryState.data = null
  })

  it('jamais relu en continu : la carte le DIT', () => {
    registryState.data = { announcements: [], checkedAt: null, truncated: false }
    render(
      <CompanyPublicDataSection
        analysis={{ legal_signals: [{ type: 'Dépôts des comptes', date: '2026-06-30' }] }}
        accountId="acc-1"
      />,
    )
    expect(
      screen.getByText('Pas encore relu en continu : annonces relevées à l’analyse.'.replace('’', "'")),
    ).toBeInTheDocument()
    registryState.data = null
  })
})

// #3921.11 (R41) — 80 lignes « établissement fermé » identiques : UNE ligne dépliable, le détail reste lisible dedans.
describe('Fermetures d’établissement regroupées (#3921.11)', () => {
  it('80 fermetures = « 80 établissements fermés entre … et … », dépliable', () => {
    const analysis: AccountAnalysis = {
      legal_signals: Array.from({ length: 80 }, (_, i) => ({
        type: 'établissement fermé',
        date: `20${10 + (i % 10)}-0${1 + (i % 9)}-15`,
        url: null,
      })),
    }
    render(<CompanyPublicDataSection analysis={analysis} />)
    const group = screen.getByTestId('legal-closures-group')
    expect(group).toHaveTextContent(/80 établissements fermés entre .+ et /)
    expect(group.querySelectorAll('li')).toHaveLength(80)
    // une seule ligne de premier niveau : le groupe
    expect(screen.getAllByTestId('legal-closures-group')).toHaveLength(1)
  })
})
