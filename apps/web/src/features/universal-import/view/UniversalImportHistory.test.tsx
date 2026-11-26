import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import { UniversalImportHistory } from './UniversalImportHistory'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

// #4422.1 — deux sources : les jobs universels, et les imports de l'assistant (postes, grille, séquences, connaissances).
const serve = (jobs: unknown[], assistant: unknown[] = []) =>
  apiFetch.mockImplementation(async ({ path }: { path: string }) => (path.includes('context-pack') ? assistant : jobs))

const job = (extra: Record<string, unknown>) => ({
  id: 'j1',
  type: 'contact',
  status: 'done',
  filename: 'export-crm.csv',
  totalRows: 120,
  processedRows: 120,
  imported: 100,
  duplicates: 12,
  rejected: 8,
  error: null,
  scope: 'workspace',
  toReconcile: 0,
  breakdown: { contact: { created: 100, matched: 0, duplicates: 12, rejected: 8, toReconcile: 0 } },
  queryableByLaura: 100,
  sourceSystem: null,
  createdAt: '2026-10-16T09:30:00.000Z',
  reasons: [],
  ...extra,
})

// #4051.10 — l'historique des imports : date, fichier, volumes, statut.
describe('UniversalImportHistory — #4051.10', () => {
  beforeEach(async () => {
    apiFetch.mockReset()
    await i18n.changeLanguage('fr')
  })

  it('nomme le fichier, la date, les volumes et le statut de chaque import', async () => {
    serve([job({})])
    render(<UniversalImportHistory />, { wrapper })
    const row = await screen.findByTestId('universal-import-history-row')
    expect(row).toHaveTextContent('export-crm.csv')
    expect(row).toHaveTextContent(/terminé/i)
    expect(row).toHaveTextContent(/100/)
    expect(row).toHaveTextContent(/12 doublon/)
    expect(row).toHaveTextContent(/8 .*écartée/)
    expect(row.querySelector('time')).toHaveAttribute('datetime', '2026-10-16T09:30:00.000Z')
    expect(apiFetch.mock.calls[0]?.[0]).toMatchObject({ path: '/import/universal/jobs' })
  })

  it('NON : un volume absent ne s’écrit pas « 0 », un import échoué dit son statut', async () => {
    serve([job({ status: 'failed', imported: 0, duplicates: 0, rejected: 0, totalRows: null, breakdown: {} })])
    render(<UniversalImportHistory />, { wrapper })
    const row = await screen.findByTestId('universal-import-history-row')
    expect(row).toHaveTextContent(/interrompu|échoué/i)
    expect(row.textContent).not.toMatch(/(^|\s)0(\s|$)/)
  })

  it('Théo C3 — aucun import : un état vide qui dit quoi attendre, et aucune ligne', async () => {
    serve([])
    render(<UniversalImportHistory />, { wrapper })
    const empty = await screen.findByTestId('universal-import-history-empty')
    expect(empty).toHaveTextContent('Ton prochain import apparaîtra ici.')
    expect(screen.queryByTestId('universal-import-history-row')).toBeNull()
    expect(screen.queryByTestId('universal-import-history-error')).toBeNull()
  })

  it('Théo C3.R7 — historique illisible : « n’a pas pu récupérer », JAMAIS « aucun import » ; Réessayer relit', async () => {
    apiFetch.mockRejectedValue(new Error('boom'))
    render(<UniversalImportHistory />, { wrapper })
    const error = await screen.findByTestId('universal-import-history-error')
    expect(error).toHaveTextContent(/n['’]a pas pu récupérer tes imports précédents/)
    expect(error).toHaveTextContent("Ce n'est pas « aucun import »")
    expect(screen.queryByTestId('universal-import-history-empty')).toBeNull()
    const calls = apiFetch.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    await vi.waitFor(() => expect(apiFetch.mock.calls.length).toBeGreaterThan(calls))
  })

  it('Théo C3.A4 — un import interrompu se reprend d’un clic, un import terminé n’offre pas « Reprendre l’import »', async () => {
    serve([job({ id: 'j9', status: 'failed', filename: 'plan.xlsx' }), job({ id: 'j1' })])
    render(<UniversalImportHistory />, { wrapper })
    const rows = await screen.findAllByTestId('universal-import-history-row')
    expect(rows[0]).toHaveTextContent(/Interrompu — à reprendre/)
    expect(screen.getAllByRole('button', { name: "Reprendre l'import" })).toHaveLength(1)
    apiFetch.mockClear()
    fireEvent.click(screen.getByRole('button', { name: "Reprendre l'import" }))
    await vi.waitFor(() =>
      expect(apiFetch.mock.calls.some(([arg]) => (arg as { path: string }).path.endsWith('/j9/resume'))).toBe(true),
    )
  })

  it('Théo C4.A5 — un import en cours porte sa barre d’avancement ; un interrompu dit à quelle ligne il s’est arrêté', async () => {
    serve([
      job({
        id: 'j2',
        status: 'processing',
        totalRows: 12480,
        processedRows: 7990,
        imported: 0,
        duplicates: 0,
        rejected: 0,
      }),
      job({ id: 'j9', status: 'failed', filename: 'plan.xlsx', totalRows: 3160, processedRows: 1203 }),
    ])
    render(<UniversalImportHistory />, { wrapper })
    const bar = await screen.findByRole('progressbar', { name: 'Avancement' })
    expect(bar).toHaveAttribute('aria-valuenow', '7990')
    expect(bar).toHaveAttribute('aria-valuemax', '12480')
    expect(screen.getByText('Arrêté à la ligne 1204')).toBeInTheDocument()
  })

  it('NON : un import terminé n’a ni barre d’avancement ni ligne d’arrêt', async () => {
    serve([job({ id: 'j1' })])
    render(<UniversalImportHistory />, { wrapper })
    await screen.findAllByTestId('universal-import-history-row')
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText(/Arrêté à la ligne/)).toBeNull()
  })

  // MEYER-IMPORT M.2 — l'import du 12/10 : « Terminé · 1025 lignes écartées », sans bilan par famille (d'avant #4051).
  it('M.2 — un import ancien, sans bilan, s’ouvre sur ses écartés COMPTÉS PAR RAISON', async () => {
    serve([
      job({
        imported: 64,
        duplicates: 0,
        rejected: 1025,
        breakdown: {},
        reasons: [
          { kind: 'rejected', reason: 'unknown_company', count: 1025 },
          { kind: 'to_reconcile', reason: 'company_to_validate', count: 3 },
        ],
      }),
    ])
    render(<UniversalImportHistory />, { wrapper })
    fireEvent.click(await screen.findByRole('button', { name: 'Voir le bilan' }))
    const detail = await screen.findByTestId('universal-import-history-detail')
    expect(detail).toHaveTextContent(/1025 lignes sans société/)
    expect(detail).toHaveTextContent(/3 lignes en attente : société à valider/)
    expect(detail).toHaveTextContent(/date d'avant le bilan par famille/)
  })

  it('M.2 — NON : un import sans écarté ni bilan n’offre rien à ouvrir, et une raison absente ne fait aucune ligne', async () => {
    serve([job({ rejected: 0, breakdown: {}, reasons: [] })])
    render(<UniversalImportHistory />, { wrapper })
    await screen.findByTestId('universal-import-history-row')
    expect(screen.queryByRole('button', { name: 'Voir le bilan' })).toBeNull()
    expect(screen.queryByTestId('universal-import-history-detail')).toBeNull()
  })

  it('M.2 — EN : les mêmes raisons, dans la langue de l’interface', async () => {
    await i18n.changeLanguage('en')
    serve([job({ breakdown: {}, reasons: [{ kind: 'rejected', reason: 'unknown_company', count: 1 }] })])
    render(<UniversalImportHistory />, { wrapper })
    fireEvent.click(await screen.findByRole('button', { name: 'See the report' }))
    const detail = await screen.findByTestId('universal-import-history-detail')
    expect(detail).toHaveTextContent(/1 row without a company/)
  })

  it('#4422.1 — les postes, grille et séquences importés par l’assistant figurent dans l’historique, avec leur bilan', async () => {
    serve(
      [job({})],
      [
        {
          id: 'a1',
          fileName: 'Campagnes.xlsx',
          destination: 'sequences',
          status: 'done',
          imported: 9,
          skipped: 0,
          scripts: 54,
          message: null,
          createdAt: '2026-10-22T09:00:00.000Z',
        },
        {
          id: 'a2',
          fileName: 'Postes.xlsx',
          destination: 'target_personas',
          status: 'failed',
          imported: null,
          skipped: 0,
          scripts: null,
          message: 'colonnes obligatoires introuvables',
          createdAt: '2026-10-21T09:00:00.000Z',
        },
      ],
    )
    render(<UniversalImportHistory />, { wrapper })
    const rows = await screen.findAllByTestId('universal-import-history-row')
    expect(rows.map(row => row.querySelector('p')?.textContent)).toEqual([
      'Campagnes.xlsx',
      'Postes.xlsx',
      'export-crm.csv',
    ])
    expect(rows[0]).toHaveTextContent('9 campagnes prises')
    expect(rows[0]).toHaveTextContent('54 scripts d’appel gardés')
    expect(rows[1]).toHaveTextContent('colonnes obligatoires introuvables')
    // Une valeur absente ne s'écrit pas « 0 ».
    expect(rows[1]?.textContent).not.toMatch(/(^|\s)0(\s|$)/)
  })

  it('#4422.1 — un envoi resté « en cours d’envoi » se dit interrompu, jamais « en cours » pour toujours', async () => {
    serve([job({ status: 'uploading', interrupted: true, imported: 0, duplicates: 0, rejected: 0, breakdown: {} })])
    render(<UniversalImportHistory />, { wrapper })
    const row = await screen.findByTestId('universal-import-history-row')
    expect(row).toHaveTextContent(/Interrompu — l’envoi ne s’est pas terminé/)
    expect(row).not.toHaveTextContent(/en cours d’envoi/)
  })
})

// #AM.9 (#4053) — valider d'un clic les sociétés proposées.
describe('UniversalImportHistory — #AM.9 valider les sociétés', () => {
  beforeEach(async () => {
    apiFetch.mockReset()
    await i18n.changeLanguage('fr')
  })

  it('un lot avec des sociétés « à valider » offre le geste ; il crée via l’API et le dit', async () => {
    apiFetch.mockImplementation(async ({ path }: { path: string }) => {
      if (path.includes('validate-companies')) return { created: 2, alreadyThere: 0 }
      return path.includes('context-pack')
        ? []
        : [job({ reasons: [{ kind: 'to_reconcile', reason: 'company_to_validate', count: 2 }], toReconcile: 2 })]
    })
    render(<UniversalImportHistory />, { wrapper })
    // Refonte : le détail du lot (où vit le geste) s'ouvre par « Voir le bilan ».
    fireEvent.click(await screen.findByRole('button', { name: /Voir le bilan/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Valider les sociétés proposées/ }))
    expect(await screen.findByText(/2 sociétés créées/)).toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/import/universal/jobs/j1/validate-companies', method: 'POST' }),
    )
  })

  it('NON : sans société « à valider » (ou en import personnel), aucun bouton', async () => {
    serve([job({ reasons: [{ kind: 'to_reconcile', reason: 'unknown_company_ref', count: 1 }] })])
    render(<UniversalImportHistory />, { wrapper })
    await screen.findByTestId('universal-import-history-row')
    fireEvent.click(await screen.findByRole('button', { name: /Voir le bilan/ }))
    await screen.findByTestId('universal-import-history-detail')
    expect(screen.queryByRole('button', { name: /Valider les sociétés/ })).toBeNull()
  })
})

// #AM.11 (#4290.6) — historique multi-lots : un lot de CV figure avec son bilan par famille.
describe('UniversalImportHistory — #AM.11 lots de CV', () => {
  beforeEach(async () => {
    apiFetch.mockReset()
    await i18n.changeLanguage('fr')
  })

  it('un lot de CV est listé avec son bilan par famille, à côté des comptes et contacts', async () => {
    serve(
      [job({})],
      [
        {
          id: 'cv1',
          fileName: 'ana.pdf',
          destination: 'cv',
          status: 'done',
          imported: 3,
          skipped: 1,
          scripts: null,
          message: null,
          createdAt: '2026-10-23T08:00:00.000Z',
          breakdown: { cv: { created: 2, matched: 1, duplicates: 0, rejected: 0, toReconcile: 1 } },
        },
      ],
    )
    render(<UniversalImportHistory />, { wrapper })
    const rows = await screen.findAllByTestId('universal-import-history-row')
    expect(rows).toHaveLength(2)
    const cv = rows.find(row => row.textContent?.includes('ana.pdf'))
    expect(cv).toHaveTextContent(/Lot de CV/)
    expect(cv?.querySelector('[data-testid="import-family-report"]')).not.toBeNull()
  })
})

// #4573 — un import de pack se RECONNAÎT dans l'historique, et son original se relit en aperçu par URL signée.
describe('UniversalImportHistory — pack de contexte et original (#4573)', () => {
  beforeEach(async () => {
    apiFetch.mockReset()
    await i18n.changeLanguage('fr')
  })

  const pack = (extra: Record<string, unknown>) => ({
    id: '22222222-2222-4222-8222-222222222222',
    fileName: 'Playbook.pdf',
    destination: 'knowledge',
    status: 'done',
    imported: 1,
    skipped: 0,
    scripts: null,
    message: null,
    createdAt: '2026-10-26T09:00:00.000Z',
    original: 'kept',
    ...extra,
  })

  it('distingue un import de PACK d’un import de CONTACTS : chaque ligne dit sa nature', async () => {
    serve([job({})], [pack({})])
    render(<UniversalImportHistory />, { wrapper })
    const rows = await screen.findAllByTestId('universal-import-history-row')
    expect(rows[0]).toHaveTextContent('Playbook.pdf')
    expect(rows[0]).toHaveTextContent('Pack de contexte')
    expect(rows[1]).toHaveTextContent('export-crm.csv')
    expect(rows[1]).toHaveTextContent('Import de fichier · Contacts')
    expect(rows[1]).not.toHaveTextContent('Pack de contexte')
  })

  it('un original conservé s’ouvre en aperçu par l’URL signée de SON import', async () => {
    apiFetch.mockImplementation(async ({ path }: { path: string }) => {
      if (path.endsWith('/original-url')) {
        return {
          url: 'https://store.test/signed?token=t',
          expiresAt: '2026-10-26T09:05:00.000Z',
          mimeType: 'application/pdf',
          fileName: 'Playbook.pdf',
        }
      }
      return path.includes('context-pack') ? [pack({})] : []
    })
    render(<UniversalImportHistory />, { wrapper })
    fireEvent.click(await screen.findByRole('button', { name: /Aperçu de l’original/ }))
    const frame = await screen.findByTitle(/Playbook\.pdf/)
    expect(frame).toHaveAttribute('src', 'https://store.test/signed?token=t')
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/import/context-pack/history/22222222-2222-4222-8222-222222222222/original-url',
      }),
    )
  })

  it('un import ANTÉRIEUR dit qu’il n’a pas gardé son original — aucun bouton qui ferait semblant', async () => {
    serve([], [pack({ original: 'earlier' })])
    render(<UniversalImportHistory />, { wrapper })
    const row = await screen.findByTestId('universal-import-history-row')
    expect(row).toHaveTextContent('Importé avant que Bellum garde les originaux : pas d’aperçu.')
    expect(screen.queryByRole('button', { name: /Aperçu de l’original/ })).toBeNull()
  })

  it('chaque absence se NOMME : trop gros, non conservé, effacé (RGPD) ; un lot de CV n’en dit rien', async () => {
    serve(
      [],
      [
        pack({ id: 'a', fileName: 'gros.pdf', original: 'too_big', createdAt: '2026-10-26T09:03:00.000Z' }),
        pack({ id: 'b', fileName: 'off.pdf', original: 'unavailable', createdAt: '2026-10-26T09:02:00.000Z' }),
        pack({ id: 'c', fileName: 'rgpd.pdf', original: 'erased', createdAt: '2026-10-26T09:01:00.000Z' }),
        { ...pack({ id: 'd', fileName: 'ana.pdf', destination: 'cv' }), original: undefined },
      ],
    )
    render(<UniversalImportHistory />, { wrapper })
    const rows = await screen.findAllByTestId('universal-import-history-row')
    expect(rows[0]).toHaveTextContent('Fichier trop lourd pour être conservé : pas d’aperçu.')
    expect(rows[1]).toHaveTextContent('Original non conservé (stockage indisponible au dépôt).')
    expect(rows[2]).toHaveTextContent('Original effacé suite à une demande d’effacement (RGPD).')
    expect(rows[3]).not.toHaveTextContent(/original/i)
  })

  it('EN — la nature de la ligne et l’absence d’original, dans la langue de l’interface', async () => {
    await i18n.changeLanguage('en')
    serve([job({})], [pack({ original: 'earlier' })])
    render(<UniversalImportHistory />, { wrapper })
    const rows = await screen.findAllByTestId('universal-import-history-row')
    expect(rows[0]).toHaveTextContent('Context pack')
    expect(rows[0]).toHaveTextContent('Imported before Bellum kept originals: no preview.')
    expect(rows[1]).toHaveTextContent('File import · Contacts')
  })
})
