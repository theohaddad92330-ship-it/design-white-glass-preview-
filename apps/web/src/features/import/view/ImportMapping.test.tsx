import type { DryRunReport, ImportMapping } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseOption, optionValues, selectedValue } from '@/test/select'

/**
 * L'étape 2 « Reconnaître » et l'étape 3 « Corriger » du §7.4.
 *
 * Elles étaient calculées et JETÉES. `POST /import/sessions/:id/dry-run` renvoie
 * `proposedMapping` depuis le premier jour, `simulate()` accepte un mapping
 * fourni par l'utilisateur et le fait GAGNER sur la proposition automatique
 * (`import.service.ts`), et l'écriture rejoue le mapping SIMULÉ. Le seul maillon
 * absent était l'écran : `ImportWizard` destructurait `{ report, delimiter }` et
 * laissait `proposedMapping` tomber.
 *
 * Conséquence pratique de cet oubli : sur une reprise d'ancien CRM à 38
 * colonnes, l'opérateur ne pouvait ni voir ce qui avait été reconnu, ni
 * rattacher une colonne que les alias n'attrapent pas. Il ne lui restait qu'à
 * renommer les en-têtes de son fichier et recommencer.
 *
 * Le test le plus important de ce fichier est le troisième : corriger une
 * correspondance doit INVALIDER le rapport. Sans cela, l'écran afficherait un
 * mapping et l'écriture en rejouerait un autre — celui de la dernière
 * simulation — et le rapport qui autorise l'écriture serait faux.
 */

const dryRun = vi.fn()
const create = vi.fn()
const useImportSources = vi.fn()

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
    dryRun: (id: string, content: string, mapping?: ImportMapping) => dryRun(id, content, mapping),
    apply: vi.fn(),
    rollback: vi.fn(),
  },
}))

vi.mock('../lib/decode-file', () => ({
  decodeFile: () => Promise.resolve({ text: 'Adresse e-mail;Code interne\na@b.fr;X1', encoding: 'utf-8' }),
}))

const { ImportWizard } = await import('./ImportWizard')

const SOURCE = {
  key: 'contacts_only',
  objects: ['contact'],
  format: 'csv',
  readable: true,
  tier: 'mvp',
  imports: ['contacts'],
  skips: [],
  howTo: 'Une ligne par contact.',
  required: ['email'],
  fields: ['company', 'email', 'firstName', 'lastName', 'name', 'phone', 'title'],
}

const EMPTY_REPORT: DryRunReport = {
  rowsRead: 1,
  creations: 1,
  updates: 0,
  duplicates: [],
  skipped: [],
  overwrittenFields: 0,
  withoutLegalBasis: 0,
  missingRequiredColumns: [],
  mappedColumns: ['Adresse e-mail'],
  ignoredColumns: ['Code interne'],
  truncated: false,
  errors: [],
  sensitiveColumns: [],
  possibleDuplicates: [],
}

const PROPOSED: ImportMapping = {
  columns: { 'Adresse e-mail': 'email' },
  ignored: ['Code interne'],
  disabledRules: [],
}

const NO_DETECTION = { certainty: 'none' as const }

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ImportWizard />
    </QueryClientProvider>,
  )
}

/** Choisir la source, déposer le fichier, simuler — le chemin nominal. */
async function reachMapping() {
  wrap()
  fireEvent.click(screen.getByRole('button', { name: /choisir cette source/i }))
  await waitFor(() => expect(create).toHaveBeenCalled())

  const input = document.querySelector('input[type="file"]')
  expect(input).toBeTruthy()
  // jsdom 20 n'implémente pas `File.arrayBuffer` (lu par le contrôle de signature, #2159.8).
  const csvFile = new File(['x'], 'contacts.csv', { type: 'text/csv' })
  Object.defineProperty(csvFile, 'arrayBuffer', {
    value: () => Promise.resolve(new TextEncoder().encode('x').buffer),
    configurable: true,
  })
  fireEvent.change(input as HTMLInputElement, {
    target: { files: [csvFile] },
  })

  await waitFor(() => expect(screen.getByRole('button', { name: /simuler/i })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: /simuler/i }))
  await waitFor(() => expect(dryRun).toHaveBeenCalled())
}

beforeEach(() => {
  vi.clearAllMocks()
  useImportSources.mockReturnValue({ data: [SOURCE], isLoading: false, isError: false })
  create.mockResolvedValue({ id: 'sess-1', source: 'contacts_only', object_type: 'contact', state: 'draft' })
  dryRun.mockResolvedValue({
    report: EMPTY_REPORT,
    proposedMapping: PROPOSED,
    delimiter: ';',
    detectedSource: NO_DETECTION,
    columnConfidence: { 'Adresse e-mail': 'high' },
    mappingSuggestions: {},
  })
})

describe('l’assistant d’import REND la correspondance qu’il calcule', () => {
  it('affiche chaque colonne du fichier et le champ auquel elle est rattachée', async () => {
    await reachMapping()

    await waitFor(() => expect(screen.getByTestId('import-mapping')).toBeTruthy())
    // ⚠️ `getByLabelText` peut rendre le `<label>` qui ENVELOPPE le menu, et
    // un `<label>` ne se focalise pas : viser le combobox par son rôle.
    const recognised = screen.getByRole('combobox', { name: 'Adresse e-mail' })
    expect(await selectedValue(recognised)).toBe('email')
  })

  it('NOMME la colonne qu’aucun alias n’a reconnue, et la laisse rattachable', async () => {
    await reachMapping()

    await waitFor(() => expect(screen.getByTestId('import-mapping')).toBeTruthy())
    const unrecognised = screen.getByLabelText('Code interne') as HTMLSelectElement
    // Non rattachée : la valeur vide. Jamais devinée — le repli positionnel est
    // exactement ce qui fait entrer un téléphone dans un champ société.
    expect(unrecognised.value).toBe('')
    // Et les champs recevables de la source sont offerts, y compris `phone`.
    expect(await optionValues(unrecognised)).toContain('phone')
  })

  it('corriger une correspondance INVALIDE le rapport — l’import se re-verrouille', async () => {
    await reachMapping()
    await waitFor(() => expect(screen.getByTestId('import-mapping')).toBeTruthy())

    const applyButton = screen.getByRole('button', { name: /^importer$/i })
    expect(applyButton.hasAttribute('disabled')).toBe(false)

    await chooseOption(screen.getByRole('combobox', { name: 'Code interne' }), 'phone')

    // Le serveur rejoue le mapping SIMULÉ : laisser « Importer » cliquable
    // écrirait avec l'ancienne correspondance tout en affichant la nouvelle.
    await waitFor(() => expect(screen.getByRole('button', { name: /^importer$/i }).hasAttribute('disabled')).toBe(true))
    expect(screen.getByTestId('import-mapping-stale')).toBeTruthy()
  })

  it('ENVOIE la correspondance corrigée à la simulation suivante', async () => {
    await reachMapping()
    await waitFor(() => expect(screen.getByTestId('import-mapping')).toBeTruthy())

    // Premier passage : rien n'est imposé, le serveur propose.
    expect(dryRun).toHaveBeenLastCalledWith('sess-1', expect.any(String), undefined)

    await chooseOption(screen.getByRole('combobox', { name: 'Code interne' }), 'phone')
    fireEvent.click(screen.getByRole('button', { name: /simuler/i }))

    await waitFor(() => expect(dryRun).toHaveBeenCalledTimes(2))
    const sent = dryRun.mock.calls[1]?.[2] as ImportMapping
    expect(sent.columns).toEqual({ 'Adresse e-mail': 'email', 'Code interne': 'phone' })
    expect(sent.ignored).toEqual([])
  })

  it('détacher une colonne la remet dans les colonnes ignorées', async () => {
    await reachMapping()
    await waitFor(() => expect(screen.getByTestId('import-mapping')).toBeTruthy())

    await chooseOption(screen.getByRole('combobox', { name: 'Adresse e-mail' }), '')
    fireEvent.click(screen.getByRole('button', { name: /simuler/i }))

    await waitFor(() => expect(dryRun).toHaveBeenCalledTimes(2))
    const sent = dryRun.mock.calls[1]?.[2] as ImportMapping
    expect(sent.columns).toEqual({})
    expect(sent.ignored.sort()).toEqual(['Adresse e-mail', 'Code interne'])
  })

  it('DIT quel champ obligatoire n’est rattaché à aucune colonne', async () => {
    await reachMapping()
    await waitFor(() => expect(screen.getByTestId('import-mapping')).toBeTruthy())

    await chooseOption(screen.getByRole('combobox', { name: 'Adresse e-mail' }), '')

    await waitFor(() => {
      const missing = screen.getByTestId('import-mapping-missing-required')
      expect(missing.textContent).toMatch(/email/)
    })
  })

  it('sans simulation, aucune correspondance n’est inventée à l’écran', async () => {
    wrap()
    fireEvent.click(screen.getByRole('button', { name: /choisir cette source/i }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(screen.queryByTestId('import-mapping')).toBeNull()
  })
})

describe('#2159.17 et suivants — la confiance de mapping, jamais un pourcentage', () => {
  it('affiche une confiance HAUTE sur la colonne reconnue par alias exact', async () => {
    await reachMapping()
    await waitFor(() => expect(screen.getByTestId('import-mapping')).toBeTruthy())
    expect(screen.getByTestId('import-mapping-confidence-high')).toBeTruthy()
  })

  it('suggère un rattachement pour une colonne proche, sans jamais la rattacher toute seule', async () => {
    dryRun.mockResolvedValue({
      report: { ...EMPTY_REPORT, ignoredColumns: ['E-mail pro'], mappedColumns: [] },
      proposedMapping: { columns: {}, ignored: ['E-mail pro'], disabledRules: [] },
      delimiter: ';',
      detectedSource: NO_DETECTION,
      columnConfidence: {},
      mappingSuggestions: { 'E-mail pro': { field: 'email', confidence: 'medium' } },
    })
    await reachMapping()
    await waitFor(() => expect(screen.getByTestId('import-mapping')).toBeTruthy())

    // Suggérée, mais PAS rattachée — le repli automatique est ce que le
    // moteur refuse (voir `suggestMapping`).
    expect(await selectedValue(screen.getByRole('combobox', { name: 'E-mail pro' }))).toBe('')
    expect(screen.getByTestId('import-mapping-suggestion')).toBeTruthy()
    expect(screen.getByTestId('import-mapping-confidence-medium')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /rattacher/i }))
    expect(await selectedValue(screen.getByRole('combobox', { name: 'E-mail pro' }))).toBe('email')
  })

  it('signale une structure d’export ERP reconnue, SANS jamais nommer l’éditeur (GA-44)', async () => {
    dryRun.mockResolvedValue({
      report: EMPTY_REPORT,
      proposedMapping: PROPOSED,
      delimiter: ';',
      detectedSource: { certainty: 'named', key: 'boondmanager_export' },
      columnConfidence: { 'Adresse e-mail': 'high' },
      mappingSuggestions: {},
    })
    await reachMapping()
    await waitFor(() => expect(screen.getByTestId('import-detected-source')).toBeTruthy())
    const text = screen.getByTestId('import-detected-source').textContent ?? ''
    expect(text).toMatch(/erp/i)
    // GA-44 — un écran hors Réglages › Intégrations ne nomme jamais un éditeur.
    expect(text).not.toMatch(/boondmanager/i)
  })

  it('M2.2 — un export de contacts d’un outil de gestion est dit « reconnu », sans nom de fournisseur', async () => {
    dryRun.mockResolvedValue({
      report: EMPTY_REPORT,
      proposedMapping: PROPOSED,
      delimiter: ';',
      detectedSource: { certainty: 'family', family: 'management_contacts' },
      columnConfidence: { 'Adresse e-mail': 'high' },
      mappingSuggestions: {},
    })
    await reachMapping()
    await waitFor(() => expect(screen.getByTestId('import-detected-source')).toBeTruthy())
    const text = screen.getByTestId('import-detected-source').textContent ?? ''
    expect(text).toMatch(/export de ton outil de gestion reconnu/i)
    expect(text).not.toMatch(/candidats|boondmanager/i)
  })
})
