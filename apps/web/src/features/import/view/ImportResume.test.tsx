import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

/**
 * L'écran d'un import INTERROMPU — angle mort n°6 du tome 8 §33.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE L'ÉCRAN AFFICHAIT AVANT
 * ─────────────────────────────────────────────────────────────────────────────
 * « Export de ton CRM — simulé · 0 créé(s), 0 mis à jour » pour un import qui
 * avait écrit 4 000 lignes. Le compteur restait à son défaut `0` parce que
 * `markApplied` n'était jamais atteint, l'annulation n'apparaissait pas
 * (`state === 'applied'` seul l'affichait), et rien ne disait où ça s'était
 * arrêté. Quelqu'un qui lit « 0 créé » relance tout, et doublonne sa base.
 *
 * Les trois vérités que cet écran doit tenir :
 *  1. « 0 ligne écrite » et « on ne sait pas combien » sont deux écrans ;
 *  2. un import interrompu s'ANNULE — c'est lui qui a laissé des lignes ;
 *  3. sur une ligne partie sans réponse, l'écran POSE la question au lieu de
 *     trancher — et « Importer » reste indisponible tant que personne n'a
 *     répondu.
 */

vi.mock('@tanstack/react-router', async () => {
  const { forwardRef } = await import('react')
  return {
    // ⚠️ L'entête porte un lien vers les intégrations et le lien contextuel du
    // copilote : le faux recopie le `search` dans le `href` et transmet la ref,
    // comme le vrai `Link`.
    Link: forwardRef<
      HTMLAnchorElement,
      { children?: React.ReactNode; to: string; search?: Record<string, unknown>; className?: string }
    >(({ children, to, search, ...rest }, ref) => (
      <a
        {...rest}
        ref={ref}
        href={search ? `${to}?${new URLSearchParams(Object.entries(search).map(([k, v]) => [k, String(v)]))}` : to}
      >
        {children}
      </a>
    )),
  }
})

vi.mock('../api', () => ({
  useImportSources: () => ({
    data: [
      {
        key: 'accounts_only',
        objects: ['account'],
        format: 'csv',
        readable: true,
        tier: 'mvp',
        imports: ['comptes'],
        skips: [],
        howTo: 'Exporte tes comptes en CSV.',
        required: ['company'],
        fields: ['company', 'siren', 'domain'],
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useImportSessions: vi.fn(),
  importApi: { rollback: vi.fn() },
}))

const { useImportSessions } = await import('../api')
const { ImportWizard } = await import('./ImportWizard')

type SessionsQuery = ReturnType<typeof useImportSessions>
const sessionsQuery = (data: unknown[]) => ({ data, refetch: () => undefined }) as unknown as SessionsQuery

const PARTIAL = {
  id: 's-1',
  source: 'accounts_only',
  object_type: 'account' as const,
  state: 'partial',
  created_at: '2026-08-29T10:00:00.000Z',
  created_count: 4000,
  updated_count: 12,
  processed_rows: 4000,
  total_rows: 17000,
  failed_at_row: 4000,
  resume_outcome: 'failed' as const,
  error: 'connect ECONNREFUSED',
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ImportWizard />
    </QueryClientProvider>,
  )
}

describe('un import interrompu se LIT', () => {
  it('dit combien de lignes sont en base, et sur combien', async () => {
    vi.mocked(useImportSessions).mockReturnValue(sessionsQuery([PARTIAL]))
    wrap()
    const line = await screen.findByTestId('import-stopped-line')
    expect(line.textContent).toMatch(/4000/)
    expect(line.textContent).toMatch(/17000/)
  })

  it('« on ne sait pas combien » n’est JAMAIS écrit « 0 »', async () => {
    // La règle du dépôt, transposée à une panne : si la valeur est absente,
    // « 0 » est-il VRAI ? Ici non — et « 0 ligne importée » enverrait quelqu'un
    // tout relancer.
    vi.mocked(useImportSessions).mockReturnValue(
      sessionsQuery([{ ...PARTIAL, processed_rows: null, total_rows: null, failed_at_row: null }]),
    )
    wrap()
    const line = await screen.findByTestId('import-stopped-line')
    expect(line.textContent).toMatch(/je ne sais pas combien/i)
    expect(line.textContent).not.toMatch(/\b0 ligne/)
  })

  it('propose d’ANNULER — c’est lui qui a laissé des lignes derrière lui', async () => {
    vi.mocked(useImportSessions).mockReturnValue(sessionsQuery([PARTIAL]))
    wrap()
    await waitFor(() => expect(screen.getByRole('button', { name: /annuler cet import/i })).toBeTruthy())
  })
})

describe('la reprise POSE la question quand elle ne sait pas', () => {
  it('n’ouvre le choix que sur une ligne partie sans réponse', async () => {
    vi.mocked(useImportSessions).mockReturnValue(sessionsQuery([PARTIAL]))
    wrap()
    await userEvent.click(await screen.findByRole('button', { name: /reprendre cet import/i }))
    await waitFor(() => expect(screen.getByTestId('import-resume-panel')).toBeTruthy())
    // `failed` : la connexion n'a jamais abouti, la ligne est rejouable. Aucune
    // question à poser.
    expect(screen.queryByTestId('import-resume-uncertain')).toBeNull()
  })

  it('demande quoi faire de la ligne incertaine, et NOMME les deux risques', async () => {
    vi.mocked(useImportSessions).mockReturnValue(sessionsQuery([{ ...PARTIAL, resume_outcome: 'unknown' }]))
    wrap()
    await userEvent.click(await screen.findByRole('button', { name: /reprendre cet import/i }))
    const panel = await screen.findByTestId('import-resume-uncertain')
    // L'écran parle en NUMÉROS de ligne ; `failed_at_row` est un index.
    expect(panel.textContent).toMatch(/4001/)
    expect(screen.getByRole('button', { name: /réécrire la ligne 4001/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /sauter la ligne 4001/i })).toBeTruthy()
    expect(panel.textContent).toMatch(/choisis l’un des deux/i)
  })

  it('garde « Importer » INDISPONIBLE tant que personne n’a tranché', async () => {
    vi.mocked(useImportSessions).mockReturnValue(sessionsQuery([{ ...PARTIAL, resume_outcome: 'unknown' }]))
    wrap()
    await userEvent.click(await screen.findByRole('button', { name: /reprendre cet import/i }))
    const apply = screen.getByRole('button', { name: /^importer$/i })
    expect(apply.hasAttribute('disabled')).toBe(true)
  })

  it('le choix s’ANNONCE, avec son risque', async () => {
    vi.mocked(useImportSessions).mockReturnValue(sessionsQuery([{ ...PARTIAL, resume_outcome: 'unknown' }]))
    wrap()
    await userEvent.click(await screen.findByRole('button', { name: /reprendre cet import/i }))
    await userEvent.click(screen.getByRole('button', { name: /sauter la ligne 4001/i }))
    const panel = screen.getByTestId('import-resume-uncertain')
    expect(panel.textContent).toMatch(/cette ligne sera absente/i)
    expect(screen.getByRole('button', { name: /sauter la ligne 4001/i }).getAttribute('aria-pressed')).toBe('true')
  })
})
