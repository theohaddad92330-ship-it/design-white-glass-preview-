import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAccountRankReasons, type WatchlistAccountGroup, type WatchlistItem } from '../model/watchlist'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))

const { WatchlistTable } = await import('./WatchlistTable')

const item = (over: Partial<WatchlistItem> = {}): WatchlistItem => ({
  accountId: 'a-1',
  companyName: 'Nordia',
  id: 's-1',
  sector: 'Services',
  signalDate: '2026-07-05',
  signalLabel: 'Recrute 12 data engineers',
  signalSource: 'Communiqué',
  signalType: 'Recrutement',
  score: 8,
  status: 'new',
  archived: false,
  firstDetectedAt: null,
  firstDetectionExact: false,
  lastSeenAt: null,
  changeCount: 0,
  resolved: false,
  resolvedAt: null,
  importance: null,
  triggeredActionLabel: null,
  lastVerifiedAt: null,
  temporalStatus: null,
  salesImplication: null,
  impact: null,
  logoUrl: null,
  website: null,
  ...over,
})

const group = (
  over: Partial<WatchlistItem> = {},
  extra: Partial<WatchlistAccountGroup> = {},
): WatchlistAccountGroup => {
  const latest = item(over)
  return {
    accountId: latest.accountId,
    companyName: latest.companyName,
    sector: latest.sector,
    score: latest.score,
    latest,
    others: [],
    decisionMaker: latest.decisionMaker ?? null,
    discardReason: null,
    activeSignalCount: 1,
    totalSignalCount: 1,
    status: latest.status,
    ...extra,
  }
}

const marie = { name: 'Marie Durand', title: 'Directrice des systèmes d’information' }

function renderTable(groups: WatchlistAccountGroup[], onSelect = vi.fn()) {
  return renderWithRouter(<WatchlistTable groups={groups} onSelect={onSelect} />, '/mes-cibles')
}

beforeEach(() => apiFetch.mockReset())

/**
 * #4088 — LA LIGNE D'UN COMPTE : ce qui bouge, pourquoi ça compte, qui ça concerne,
 * la prochaine action. Le badge « 8/10 » nu a disparu (#4088.3).
 */
describe('WatchlistTable — un compte, cinq colonnes (#4088)', () => {
  // Refonte Théo (maquette validée `decouvrir/mes-cibles.html`) : la Date en tête ; « Qui ça concerne »
  // rejoint « Prochaine action », qui nomme la personne.
  it('les cinq colonnes portent leurs en-têtes, dans l’ordre de la maquette', async () => {
    renderTable([group()])
    await screen.findByRole('columnheader', { name: 'Date' })
    expect(screen.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual([
      'Date',
      'Compte',
      'Ce qui bouge',
      'Pourquoi ça compte',
      'Prochaine action',
    ])
    expect(screen.queryByRole('columnheader', { name: 'Qui ça concerne' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Score' })).not.toBeInTheDocument()
  })

  it('« Ce qui bouge » garde la place principale : les autres colonnes sont en pourcentage dès lg (#4403.2)', async () => {
    renderTable([group()])
    const widthOf = async (name: string) =>
      (await screen.findByRole('columnheader', { name })).className.match(/lg:w-\[(\d+)%\]/)?.[1]
    const others = await Promise.all(['Compte', 'Pourquoi ça compte', 'Prochaine action'].map(widthOf))
    // Aucune colonne fixe en px à lg : 260/210/170/220 px laissaient 103 px à « Ce qui bouge » dans 963 px.
    expect(others.every(Boolean)).toBe(true)
    const fixed = others.reduce((sum, pct) => sum + Number(pct), 0)
    expect(100 - fixed).toBeGreaterThanOrEqual(35)
  })

  it('le nom du compte est le lien vers la fiche (#4088.4)', async () => {
    renderTable([group({ accountId: 'acc-42' })])
    const link = await screen.findByRole('link', { name: /Nordia/ })
    expect(link.getAttribute('href')).toBe('/accounts/acc-42')
  })

  it('ce qui bouge : le signal le plus fort, sa date, et « +N autres » qui se déplie (#4088.2)', async () => {
    const other = item({ id: 's-2', signalLabel: 'Rachat de Datafab', signalType: 'acquisition' })
    renderTable([group({}, { others: [other] })])
    expect((await screen.findAllByText('Recrute 12 data engineers')).length).toBeGreaterThan(0)
    expect(screen.queryByText('Rachat de Datafab')).not.toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: /\+1 autre/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Rachat de Datafab')).toBeInTheDocument()
  })

  // #4182.5 — cliquer un SOUS-signal ouvre le détail DE ce signal, jamais celui du primaire.
  it('un sous-signal déplié ouvre son propre détail (#4182.5)', async () => {
    const other = item({ id: 's-2', signalLabel: 'Data engineer — plateforme data voyageurs' })
    const onSelect = vi.fn()
    renderTable([group({}, { others: [other] })], onSelect)
    fireEvent.click(await screen.findByRole('button', { name: /\+1 autre/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Data engineer — plateforme data voyageurs' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(other)
  })

  it('pourquoi ça compte : une phrase dérivée du TYPE ; type inconnu = aucune phrase', async () => {
    const { unmount } = renderTable([group({ signalType: 'Recrutement' })])
    expect((await screen.findAllByText(/besoin de renfort est probable/)).length).toBeGreaterThan(0)
    unmount()
    renderTable([group({ signalType: 'Météo', signalLabel: 'Canicule' })])
    await screen.findAllByText('Canicule')
    expect(screen.queryByText(/probable|projet est lancé/)).not.toBeInTheDocument()
  })

  it('#4088.12 — type sans besoin établi : la ligne DIT pourquoi on la montre, jamais une case vide', async () => {
    renderTable([group({ signalType: 'Météo', signalLabel: 'Canicule', sector: 'Banque' })])
    expect(
      (await screen.findAllByText(/Signal « Météo » · Banque : aucun besoin de prestation identifié/)).length,
    ).toBeGreaterThan(0)
  })

  it('qui ça concerne : nom et poste en clair, et l’action nomme la personne (#4088.4)', async () => {
    renderTable([group({ decisionMaker: marie })])
    expect((await screen.findAllByText('Marie Durand')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Directrice des systèmes d’information').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /Proposer un profil à Marie D\./ }).length).toBeGreaterThan(0)
  })

  it('refonte Théo — la personne porte le badge « Décideur », dans la cellule de l’action', async () => {
    renderTable([group({ decisionMaker: marie })])
    const who = (await screen.findAllByTestId('watchlist-who'))[0]!
    expect(who).toHaveTextContent('Marie Durand')
    expect(who).toHaveTextContent('Décideur')
  })

  it('NON : sans décideur connu, aucun badge « Décideur »', async () => {
    renderTable([group({ decisionMaker: null })])
    await screen.findAllByRole('button', { name: /Identifier le décideur/ })
    expect(screen.queryByText('Décideur')).not.toBeInTheDocument()
  })

  it('NON : sans contact connu, aucun nom — l’action devient « Identifier le décideur »', async () => {
    renderTable([group({ decisionMaker: null })])
    expect((await screen.findAllByRole('button', { name: /Identifier le décideur/ })).length).toBeGreaterThan(0)
    expect(screen.queryByText(/ à Marie|Marie D\./)).not.toBeInTheDocument()
  })

  it('la raison de rang remplace le badge de score : jamais « 8/10 » nu, jamais de %', async () => {
    renderTable([group({ score: 8 })])
    await screen.findAllByText('Recrute 12 data engineers')
    expect(screen.queryByText('8/10')).not.toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
    expect(screen.getByText(/Compte prioritaire/)).toBeInTheDocument()
    expect(buildAccountRankReasons(group({ score: 8 }), [])).toContain('Compte prioritaire')
  })

  it('NON : un score absent ne dit pas « non mesuré » ni « 0 » dans la ligne', async () => {
    renderTable([group({ score: null, status: 'follow-up' })])
    await screen.findAllByText('Recrute 12 data engineers')
    expect(screen.queryByText(/non mesuré|0\/10/)).not.toBeInTheDocument()
  })

  it('un compte écarté dit POURQUOI il l’est, à la place d’une raison de rang (#4088.7)', async () => {
    renderTable([group({ signalLabel: 'Stage développeur' }, { discardReason: 'internship' })])
    expect(await screen.findByText('Offre de stage ou d’alternance')).toBeInTheDocument()
    expect(screen.queryByText(/Compte prioritaire/)).not.toBeInTheDocument()
  })

  it('l’action ÉCRIT dans le plan du compte (libellé du signal) et n’envoie rien (#4088.4)', async () => {
    apiFetch.mockResolvedValue({ actionId: 'act-1', actionLabel: 'Traiter le signal' })
    renderTable([group({ decisionMaker: marie, accountId: 'acc-7' })])
    const [button] = await screen.findAllByRole('button', { name: /Proposer un profil à Marie D\./ })
    fireEvent.click(button!)
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    const call = apiFetch.mock.calls[0]![0] as { path: string; method: string; body: Record<string, unknown> }
    expect(call.path).toBe('/signal-history/actions')
    expect(call.method).toBe('POST')
    expect(call.body).toEqual({ accountId: 'acc-7', label: 'Recrute 12 data engineers' })
    // Aucun appel de messagerie / séquence : un seul appel, le plan.
    expect(
      apiFetch.mock.calls.map(c => (c[0] as { path: string }).path).filter(p => /mail|send|sequence/.test(p)),
    ).toEqual([])
  })

  it('une action déjà créée ouvre le détail au lieu d’en créer une seconde', async () => {
    const onSelect = vi.fn()
    renderTable([group({ decisionMaker: marie, triggeredActionLabel: 'Appeler la DSI' })], onSelect)
    const [button] = await screen.findAllByRole('button', { name: /Proposer un profil à Marie D\./ })
    fireEvent.click(button!)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('une ligne par compte : deux groupes, deux liens de fiche', async () => {
    renderTable([group({ accountId: 'a-1' }), group({ accountId: 'a-2', companyName: 'Velmore', id: 's-9' })])
    const links = await screen.findAllByRole('link', { name: /Nordia|Velmore/ })
    expect(links).toHaveLength(2)
    expect(within(links[1]!).getByText('Velmore')).toBeInTheDocument()
  })

  // #4182.5 — l'aperçu d'un signal (Signal détecté, date, Voir l'offre) nomme le DEMANDEUR quand il est connu, rien sinon.
  describe('demandeur dans l’aperçu (#4182.5)', () => {
    it('affiche le demandeur étayé par l’offre', async () => {
      const requester = {
        author: 'rh' as const,
        possibleManagerFunction: 'Directeur de la plateforme data',
        team: 'Data & IA',
        city: null,
        status: 'etaye' as const,
        method: [],
      }
      renderTable([group({ requester })])
      fireEvent.focus(await screen.findByRole('button', { name: 'Recrute 12 data engineers' }))
      expect(await screen.findByTestId('need-requester')).toHaveTextContent('Directeur de la plateforme data')
    })

    // G.8 (recette R4 18/10, 4182.5) — le demandeur manquait sur les SOUS-signaux dépliés (SNCF, démo).
    it('G.8 — un sous-signal déplié nomme son demandeur étayé ; non étayé ou inconnu : aucune ligne', async () => {
      const requester = {
        author: 'rh' as const,
        possibleManagerFunction: 'Directeur des données voyageurs',
        team: 'plateforme data',
        city: null,
        status: 'etaye' as const,
        method: [],
      }
      const other = item({ id: 's-2', signalLabel: 'Data engineer — plateforme data voyageurs', requester })
      const mute = item({
        id: 's-3',
        signalLabel: 'Ingénieur DevOps',
        requester: { ...requester, status: 'a_identifier' as const, possibleManagerFunction: null },
      })
      const unknown = item({ id: 's-4', signalLabel: 'Chef de projet SI billettique' })
      renderTable([group({}, { others: [other, mute, unknown] })])
      fireEvent.click(await screen.findByRole('button', { name: /\+3 autres/ }))
      const lines = screen.getAllByTestId('need-requester')
      expect(lines).toHaveLength(1)
      expect(lines[0]).toHaveTextContent('Directeur des données voyageurs')
    })

    // V4-CORRECTIFS-C 4286.12 — l'aperçu DIT « à identifier » quand l'offre n'établit pas le demandeur.
    it('4286.12 — demandeur non étayé : l’aperçu dit « à identifier » (sans inventer de nom)', async () => {
      const requester = {
        author: 'non_precise' as const,
        possibleManagerFunction: null,
        team: null,
        city: 'Paris',
        status: 'a_identifier' as const,
        method: ['lire_offre' as const],
      }
      renderTable([group({ requester })])
      fireEvent.focus(await screen.findByRole('button', { name: 'Recrute 12 data engineers' }))
      expect(await screen.findByTestId('need-requester-toidentify')).toHaveTextContent('Demandeur à identifier')
    })

    it('demandeur inconnu : aucune ligne dans l’aperçu', async () => {
      renderTable([group({})])
      fireEvent.focus(await screen.findByRole('button', { name: 'Recrute 12 data engineers' }))
      expect(await screen.findByText('Signal détecté')).toBeInTheDocument()
      expect(screen.queryByTestId('need-requester')).toBeNull()
      expect(screen.queryByTestId('need-requester-method')).toBeNull()
    })
  })
})

// #4437.5 (recette prod 23/10) — « React JS-Python », « Fullstack » : l'intitulé libre est rattaché à un type, une
// compétence et une famille, et les trois s'affichent SUR LA LIGNE (pas seulement dans le détail).
describe('WatchlistTable — le rattachement d’une offre (#4437.5)', () => {
  it('la ligne dit le type, la compétence et la famille', async () => {
    renderTable([
      group({
        signalLabel: 'React JS-Python',
        offerAttachment: {
          status: 'attached',
          fact_type: 'hiring',
          skills: ['React', 'Python'],
          job_family: 'developpement',
          extract: 'React JS-Python',
        },
      }),
    ])
    const line = await screen.findByTestId('offer-attachment-chips')
    expect(line).toHaveTextContent('Recrutement')
    expect(line).toHaveTextContent('React')
    expect(line).toHaveTextContent('Python')
    expect(line).toHaveTextContent(/développement/i)
  })

  it('SAIT DIRE NON — un intitulé non rattachable ou sans rattachement posé reste nu', async () => {
    renderTable([
      group(
        {
          signalLabel: 'Fullstack',
          offerAttachment: {
            status: 'unclassified',
            fact_type: 'hiring',
            skills: [],
            job_family: null,
            extract: 'Fullstack',
          },
        },
        {},
      ),
    ])
    await screen.findByText('Fullstack')
    expect(screen.queryByTestId('offer-attachment-chips')).toBeNull()
  })
})
