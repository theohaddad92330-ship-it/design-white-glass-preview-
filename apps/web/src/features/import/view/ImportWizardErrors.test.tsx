import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DryRunReport } from '@bellum/contracts'

/**
 * Le seau `errors` — une ligne qui a échoué à l'ÉCRITURE, jamais confondue avec
 * une ligne « ignorée » (`skipped`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PROUVE
 * ─────────────────────────────────────────────────────────────────────────────
 * Avant ce correctif, une ligne partie sans réponse que l'utilisateur choisit
 * de SAUTER plutôt que de rejouer ne laissait AUCUNE trace une fois l'import
 * terminé. Trois écrans différents, et ce fichier les distingue tous :
 *  1. avant toute écriture, le nombre d'erreurs n'est PAS MESURÉ — pas « 0 » ;
 *  2. une écriture sans incident affiche un ZÉRO véritable ;
 *  3. une ligne en échec apparaît, avec son numéro et sa raison — distincte de
 *     ce qui a été ignoré pour une règle connue.
 */

const dryRun = vi.fn()
const create = vi.fn()
const applyMock = vi.fn()
const useImportSources = vi.fn()

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }))

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
  useImportSources: () => useImportSources(),
  useImportSessions: () => ({ data: [], refetch: () => undefined }),
  importApi: {
    create: (source: string) => create(source),
    dryRun: (id: string, content: string, mapping?: unknown) => dryRun(id, content, mapping),
    apply: (id: string, content: string, available: string[], resumeFrom?: number) =>
      applyMock(id, content, available, resumeFrom),
    rollback: vi.fn(),
  },
}))

vi.mock('../lib/decode-file', () => ({
  decodeFile: () => Promise.resolve({ text: 'Societe;Siren\nAcme;552100554', encoding: 'utf-8' }),
}))

const { toast } = await import('sonner')
const { ImportWizard } = await import('./ImportWizard')

const SOURCE = {
  key: 'accounts_only',
  objects: ['account'],
  format: 'csv',
  readable: true,
  tier: 'mvp',
  imports: ['comptes'],
  skips: [],
  howTo: 'Une ligne par société.',
  required: ['company'],
  fields: ['company', 'siren', 'domain'],
}

const BASE_REPORT: DryRunReport = {
  rowsRead: 10,
  creations: 10,
  updates: 0,
  duplicates: [],
  skipped: [],
  overwrittenFields: 0,
  withoutLegalBasis: 0,
  missingRequiredColumns: [],
  mappedColumns: ['Societe', 'Siren'],
  ignoredColumns: [],
  truncated: false,
  errors: [],
  sensitiveColumns: [],
  possibleDuplicates: [],
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ImportWizard />
    </QueryClientProvider>,
  )
}

/** Choisir la source, déposer le fichier, simuler — jusqu'au rapport de dry-run. */
async function reachReport() {
  wrap()
  fireEvent.click(screen.getByRole('button', { name: /choisir cette source/i }))
  await waitFor(() => expect(create).toHaveBeenCalled())

  const input = document.querySelector('input[type="file"]')
  fireEvent.change(input as HTMLInputElement, {
    target: { files: [new File(['x'], 'comptes.csv', { type: 'text/csv' })] },
  })

  await waitFor(() => expect(screen.getByRole('button', { name: /simuler/i })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: /simuler/i }))
  await waitFor(() => expect(dryRun).toHaveBeenCalled())
}

beforeEach(() => {
  vi.clearAllMocks()
  useImportSources.mockReturnValue({ data: [SOURCE], isLoading: false, isError: false })
  create.mockResolvedValue({ id: 'sess-1', source: 'accounts_only', object_type: 'account', state: 'draft' })
  dryRun.mockResolvedValue({
    report: BASE_REPORT,
    proposedMapping: { columns: { Societe: 'company', Siren: 'siren' }, ignored: [], disabledRules: [] },
    delimiter: ';',
  })
})

describe('avant toute écriture, les erreurs ne sont PAS mesurées', () => {
  it('affiche « pas encore mesurées », jamais « 0 »', async () => {
    await reachReport()
    const unmeasured = await screen.findByTestId('import-report-errors-unmeasured')
    expect(unmeasured.textContent).toMatch(/pas encore mesurées/i)
    expect(screen.queryByTestId('import-report-errors-zero')).toBeNull()
    expect(screen.queryByTestId('import-report-errors')).toBeNull()
  })
})

describe('une écriture SANS incident affiche un ZÉRO véritable', () => {
  it('remplace « pas encore mesurées » par « 0 » après l’écriture', async () => {
    await reachReport()
    applyMock.mockResolvedValue({
      created: 10,
      updated: 0,
      skippedUnknownCompany: 0,
      written: true,
      reason: null,
      resumedFromRow: 0,
      stopped: null,
      report: BASE_REPORT,
    })

    fireEvent.click(screen.getByRole('button', { name: /^importer$/i }))
    await waitFor(() => expect(applyMock).toHaveBeenCalled())

    const zero = await screen.findByTestId('import-report-errors-zero')
    expect(zero.textContent).toMatch(/aucune ligne en échec/i)
    expect(screen.queryByTestId('import-report-errors-unmeasured')).toBeNull()
  })
})

describe('une ligne en ÉCHEC apparaît, distincte de ce qui a été ignoré', () => {
  const REPORT_WITH_ERROR: DryRunReport = {
    ...BASE_REPORT,
    creations: 9,
    errors: [{ row: 5, message: 'Écriture interrompue : cette ligne est partie sans confirmation.' }],
  }

  it('montre le numéro de ligne et la raison — retrouvable sur un fichier de 3 000 lignes', async () => {
    await reachReport()
    applyMock.mockResolvedValue({
      created: 9,
      updated: 0,
      skippedUnknownCompany: 0,
      written: true,
      reason: null,
      resumedFromRow: 5,
      stopped: null,
      report: REPORT_WITH_ERROR,
    })

    fireEvent.click(screen.getByRole('button', { name: /^importer$/i }))
    await waitFor(() => expect(applyMock).toHaveBeenCalled())

    const bucket = await screen.findByTestId('import-report-errors')
    expect(bucket.textContent).toMatch(/1/)
    expect(bucket.textContent).toMatch(/ligne 5/i)
    expect(bucket.textContent).toMatch(/partie sans confirmation/i)
    // Distinct visuellement ET structurellement de ce qui a été IGNORÉ : ce
    // rapport ne porte aucune ligne `skipped`, et le bloc « errors » a son
    // propre test id, séparé de celui des raisons d'exclusion.
    expect(screen.queryByTestId('import-report-errors-zero')).toBeNull()
  })

  it('avertit aussi par toast — le silence referait le défaut que ce seau corrige', async () => {
    await reachReport()
    applyMock.mockResolvedValue({
      created: 9,
      updated: 0,
      skippedUnknownCompany: 0,
      written: true,
      reason: null,
      resumedFromRow: 5,
      stopped: null,
      report: REPORT_WITH_ERROR,
    })

    fireEvent.click(screen.getByRole('button', { name: /^importer$/i }))
    await waitFor(() => expect(toast.warning).toHaveBeenCalled())
    const [message] = vi.mocked(toast.warning).mock.calls[0] ?? []
    expect(String(message)).toMatch(/1 ligne/)
  })
})

/**
 * #1451.3 — le rapport rendait ONZE de ses douze champs.
 *
 * `mappedColumns` est calculé par le moteur (`import-engine.ts`), voyage dans le
 * rapport, et n'était affiché nulle part : la simulation listait les colonnes
 * IGNORÉES sans jamais dire lesquelles elle avait RECONNUES. Les deux ne
 * répondent pas à la même question — la seconde est celle qu'on se pose devant
 * un export dont on ne connaît pas les entêtes.
 */
describe('#1451.3 — la simulation dit les colonnes qu’elle a reconnues', () => {
  it('les liste, en plus des ignorées', async () => {
    await reachReport()
    const mapped = await screen.findByTestId('import-report-mapped-columns')
    expect(mapped.textContent).toMatch(/Societe/)
    expect(mapped.textContent).toMatch(/Siren/)
  })

  it('ne rend rien quand le moteur n’en a reconnu aucune — jamais une liste vide affichée', async () => {
    dryRun.mockResolvedValue({
      report: { ...BASE_REPORT, mappedColumns: [] },
      proposedMapping: { columns: {}, ignored: ['Societe'], disabledRules: [] },
      delimiter: ';',
    })
    await reachReport()
    await screen.findByTestId('import-report-errors-unmeasured')
    expect(screen.queryByTestId('import-report-mapped-columns')).toBeNull()
  })
})

/**
 * #2079.7 — les données SENSIBLES du fichier sont SIGNALÉES à l'écran, pas
 * seulement calculées côté serveur.
 */
describe('#2079.7 — la simulation signale les colonnes sensibles', () => {
  it('les affiche quand le moteur en a détecté', async () => {
    dryRun.mockResolvedValue({
      report: { ...BASE_REPORT, sensitiveColumns: ['Date de naissance', 'IBAN'] },
      proposedMapping: { columns: { Societe: 'company' }, ignored: ['Siren'], disabledRules: [] },
      delimiter: ';',
    })
    await reachReport()
    const sensitive = await screen.findByTestId('import-report-sensitive-columns')
    expect(sensitive.textContent).toMatch(/Date de naissance/)
    expect(sensitive.textContent).toMatch(/IBAN/)
  })

  it('ne rend rien sur un fichier ordinaire — jamais un avertissement sur du vide', async () => {
    await reachReport()
    expect(screen.queryByTestId('import-report-sensitive-columns')).toBeNull()
  })
})

/**
 * #1451.3 — le rail d'étapes avance sur des FAITS.
 *
 * Après la première simulation, six étapes sont faites : choisir, déposer,
 * reconnaître, normaliser, dédoublonner, simuler. Ce n'est pas un raccourci
 * d'affichage — c'est UN appel serveur qui en fait quatre, et son rapport en
 * porte la preuve (lignes écartées pour date ou adresse invalide, doublons).
 */
describe('#1451.3 — le rail d’étapes suit l’écran', () => {
  it('passe de 0 à 6 étapes faites une fois la simulation revenue', async () => {
    await reachReport()
    expect(await screen.findByText('6 étape(s) faite(s) sur 7')).toBeTruthy()
  })
})

describe('#2159.32/.33/.39/.46/.48 — l’aperçu du rapprochement, avant l’écriture', () => {
  it('distingue un CONFLIT (une valeur déjà renseignée serait remplacée) d’une simple mise à jour', async () => {
    dryRun.mockResolvedValue({
      report: {
        ...BASE_REPORT,
        duplicates: [
          { row: 2, existingId: 'acc-1', matchedOn: ['siren'], confidence: 0.95, overwrites: true },
          { row: 3, existingId: 'acc-2', matchedOn: ['domain'], confidence: 0.95, overwrites: false },
          { row: 4, existingId: null, matchedOn: ['normalizedName'], confidence: 1, overwrites: false },
        ],
      },
      proposedMapping: { columns: { Societe: 'company', Siren: 'siren' }, ignored: [], disabledRules: [] },
      delimiter: ';',
    })
    await reachReport()

    const duplicates = await screen.findByTestId('import-report-duplicates')
    expect(duplicates.textContent).toMatch(/ligne 2/i)
    expect(duplicates.textContent).toMatch(/conflit/i)
    expect(duplicates.textContent).toMatch(/siren/i)
    expect(duplicates.textContent).toMatch(/ligne 3/i)
    expect(duplicates.textContent).toMatch(/mise à jour/i)
    expect(duplicates.textContent).toMatch(/ligne 4/i)
    expect(duplicates.textContent).toMatch(/doublon dans le fichier/i)
  })

  it('n’affiche rien quand aucun doublon n’est proposé', async () => {
    await reachReport()
    expect(screen.queryByTestId('import-report-duplicates')).toBeNull()
  })
})

/**
 * #2159.32/#2159.33 — téléphone/LinkedIn partagés DANS le fichier : un signal
 * FAIBLE, signalé à part de `report.duplicates` (jamais un skip, les deux
 * lignes restent créées — voir la doc de `possibleDuplicates`, `import.ts`).
 */
describe('#2159.32/#2159.33 — doublon potentiel (téléphone/LinkedIn), jamais un skip', () => {
  it('signale la ligne, avec sa raison, sans jamais parler de conflit ou de skip', async () => {
    dryRun.mockResolvedValue({
      report: {
        ...BASE_REPORT,
        possibleDuplicates: [{ row: 3, matchedOn: ['phone'], confidence: 0.4 }],
      },
      proposedMapping: { columns: { Societe: 'company', Siren: 'siren' }, ignored: [], disabledRules: [] },
      delimiter: ';',
    })
    await reachReport()

    const count = await screen.findByTestId('import-report-possible-duplicates-count')
    expect(count.textContent).toMatch(/1/)
    const panel = await screen.findByTestId('import-report-possible-duplicates')
    expect(panel.textContent).toMatch(/ligne 3/i)
    expect(panel.textContent).toMatch(/téléphone/i)
  })

  it('n’affiche rien quand aucun doublon potentiel n’est signalé', async () => {
    await reachReport()
    expect(screen.queryByTestId('import-report-possible-duplicates')).toBeNull()
  })
})

/**
 * #2159.46/.48/.50 — la PREVIEW compte : les comptes rapprochés (dont le
 * CONFLIT n'est qu'un sous-ensemble), les conflits eux-mêmes, et les notes
 * sensibles signalées. `report.duplicates` et `report.sensitiveColumns`
 * existaient déjà (#2159.32/.33/.39, #2079.7) — ici seulement les CHIFFRES
 * agrégés que la preview réclame, dérivés de ce qui est déjà calculé, jamais
 * un nouveau champ inventé.
 */
describe('#2159.46/.48/.50 — la preview compte rapprochés, conflits et notes sensibles', () => {
  it('compte séparément les comptes rapprochés et les conflits', async () => {
    dryRun.mockResolvedValue({
      report: {
        ...BASE_REPORT,
        duplicates: [
          { row: 2, existingId: 'acc-1', matchedOn: ['siren'], confidence: 0.95, overwrites: true },
          { row: 3, existingId: 'acc-2', matchedOn: ['domain'], confidence: 0.95, overwrites: false },
          { row: 4, existingId: null, matchedOn: ['normalizedName'], confidence: 1, overwrites: false },
        ],
      },
      proposedMapping: { columns: { Societe: 'company', Siren: 'siren' }, ignored: [], disabledRules: [] },
      delimiter: ';',
    })
    await reachReport()

    // Rapprochés : les deux lignes avec un `existingId` (conflit compris).
    const matched = await screen.findByTestId('import-report-matched-accounts-count')
    expect(matched.textContent).toMatch(/2/)
    // Conflits : uniquement `overwrites: true`.
    const conflicts = await screen.findByTestId('import-report-conflicts-count')
    expect(conflicts.textContent).toMatch(/1/)
  })

  it('n’affiche ni compteur quand aucune ligne ne rapproche un compte existant', async () => {
    dryRun.mockResolvedValue({
      report: {
        ...BASE_REPORT,
        duplicates: [{ row: 4, existingId: null, matchedOn: ['normalizedName'], confidence: 1, overwrites: false }],
      },
      proposedMapping: { columns: { Societe: 'company' }, ignored: [], disabledRules: [] },
      delimiter: ';',
    })
    await reachReport()
    expect(screen.queryByTestId('import-report-matched-accounts-count')).toBeNull()
    expect(screen.queryByTestId('import-report-conflicts-count')).toBeNull()
  })

  it('compte les notes sensibles signalées', async () => {
    dryRun.mockResolvedValue({
      report: { ...BASE_REPORT, sensitiveColumns: ['Date de naissance', 'IBAN'] },
      proposedMapping: { columns: { Societe: 'company' }, ignored: [], disabledRules: [] },
      delimiter: ';',
    })
    await reachReport()
    const sensitive = await screen.findByTestId('import-report-sensitive-notes-count')
    expect(sensitive.textContent).toMatch(/2/)
  })

  it('n’affiche pas de compteur de notes sensibles sur un fichier ordinaire', async () => {
    await reachReport()
    expect(screen.queryByTestId('import-report-sensitive-notes-count')).toBeNull()
  })
})

/**
 * #2159.60 — « le nom du chiffre est honnête, le geste vérifier ne l'est pas
 * encore » (bilan #2927 du 26/09 soir, sur l'import mono-compte). Sur
 * l'import universel, `report.skipped` porte déjà `row`+`reason`+`field` par
 * ligne (§ contrat `import.ts`) — seul le TOTAL par raison s'affichait
 * (`byReason`). Ici, chaque ligne écartée devient consultable UNE PAR UNE,
 * même mécanisme que la liste des doublons juste au-dessus.
 */
describe('#2159.60 — chaque ligne écartée reste consultable, pas seulement son total', () => {
  it('liste chaque ligne skippée avec son numéro et sa raison', async () => {
    dryRun.mockResolvedValue({
      report: {
        ...BASE_REPORT,
        skipped: [
          { row: 5, reason: 'missing_required_field', field: 'company' },
          { row: 9, reason: 'invalid_email', field: 'email' },
        ],
      },
      proposedMapping: { columns: { Societe: 'company' }, ignored: [], disabledRules: [] },
      delimiter: ';',
    })
    await reachReport()

    const skipped = await screen.findByTestId('import-report-skipped-details')
    expect(skipped.textContent).toMatch(/ligne 5/i)
    expect(skipped.textContent).toMatch(/ligne 9/i)
  })

  it('n’affiche rien quand aucune ligne n’a été écartée', async () => {
    await reachReport()
    expect(screen.queryByTestId('import-report-skipped-details')).toBeNull()
  })
})

// #2732.1 + #5022.1 (recette prod 31/10) — l'import de missions écrit ; une ligne REFUSÉE est nommée, à l'écran,
// avec son numéro et son motif (le serveur la verse dans `errors`) — jamais « 0 créé » sans un mot.
describe('#2732.1 — une ligne de mission refusée est nommée avec sa raison', () => {
  it('montre le numéro de ligne, la société et le motif dans le seau des lignes en échec', async () => {
    await reachReport()
    applyMock.mockResolvedValue({
      created: 1,
      updated: 0,
      skippedUnknownCompany: 1,
      rejected: [{ row: 2, reason: 'unknown_company', detail: 'Inconnue SA' }],
      written: true,
      reason: null,
      resumedFromRow: 0,
      stopped: null,
      report: {
        ...BASE_REPORT,
        creations: 1,
        errors: [
          {
            row: 2,
            message:
              'Ligne refusée (Inconnue SA) : cette société n’existe pas encore dans ton espace — importe les comptes d’abord.',
          },
        ],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: /^importer$/i }))
    await waitFor(() => expect(applyMock).toHaveBeenCalled())

    const bucket = await screen.findByTestId('import-report-errors')
    expect(bucket.textContent).toMatch(/ligne 2/i)
    expect(bucket.textContent).toMatch(/Inconnue SA/)
    expect(bucket.textContent).toMatch(/n’existe pas encore dans ton espace/)
  })
})
