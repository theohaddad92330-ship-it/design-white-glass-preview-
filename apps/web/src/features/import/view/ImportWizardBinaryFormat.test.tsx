import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

/**
 * #2159.8 / #2159.9 / #2159.13 — un classeur Excel ou une archive ZIP déposés sur
 * une source CSV se lisaient en octets bruts (`decodeFile` ne sait que de l'UTF-8
 * ou du Windows-1252), puis `parseContactsCsv`/`detectImportSource` les traitaient
 * comme un texte — un en-tête devenu charabia, « aucune colonne reconnue » plutôt
 * qu'un message qui dit ce qu'on a vu. Le sélecteur de fichier REFUSE déjà le XLSX
 * au clic (`accept=".csv,.txt,.tsv"`), mais un glisser-déposer l'ignore : c'est le
 * seul chemin qui atteint encore `onFile` avec un fichier binaire.
 *
 * La signature RÉELLE des octets (ZIP, `PK\x03\x04` — partagée par xlsx/docx/zip,
 * jamais un motif deviné) décide, pas l'extension déclarée par le fichier :
 * `extensionMatchesFileSignature` (#2438.7, `storage.ts`) existe déjà pour les
 * pièces jointes, réutilisée ici sans dupliquer les octets magiques.
 */

const dryRun = vi.fn()

vi.mock('@tanstack/react-router', async () => {
  const { forwardRef } = await import('react')
  return {
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
        key: 'contacts_only',
        objects: ['contact'],
        format: 'csv',
        tier: 'mvp',
        readable: true,
        imports: ['contacts'],
        skips: [],
        howTo: 'Exporte tes contacts en CSV.',
        fields: ['email', 'full_name'],
        required: ['email'],
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useImportSessions: () => ({ data: [], refetch: () => undefined }),
  importApi: {
    create: vi.fn().mockResolvedValue({ id: 's-1' }),
    dryRun: (...args: unknown[]) => dryRun(...args),
  },
}))

const { ImportWizard } = await import('./ImportWizard')

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ImportWizard />
    </QueryClientProvider>,
  )
}

/** Un vrai fichier — avec son `arrayBuffer` (jsdom 20 ne l'implémente pas). */
function fileOf(bytes: Uint8Array<ArrayBuffer>, name: string): File {
  const file = new File([bytes], name, { type: 'text/csv' })
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(bytes.buffer),
    configurable: true,
  })
  return file
}

/** Un faux XLSX : la signature ZIP réelle, `PK\x03\x04`, suivie d'octets quelconques. */
function xlsxLikeFile(): File {
  return fileOf(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00]), 'contacts.csv')
}

function acceptableFile(): File {
  return fileOf(new TextEncoder().encode('Email;Nom\nlaura@skaizen.fr;Alfred\n'), 'contacts.csv')
}

async function dropFile(file: File) {
  const { container } = wrap()
  fireEvent.click(screen.getByText(/choisir cette source/i))
  const input = await waitFor(() => {
    const found = container.querySelector('input[type="file"]')
    expect(found).not.toBeNull()
    return found as HTMLInputElement
  })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
  return container
}

describe('l’assistant d’import contre un classeur Excel ou une archive ZIP déguisés', () => {
  it('DIT ce que le fichier est réellement, plutôt que de le décoder en charabia', async () => {
    const container = await dropFile(xlsxLikeFile())
    await waitFor(() => expect(container.textContent).toMatch(/classeur Excel|archive ZIP/i))
  })

  it('ne simule rien tant que la signature ne correspond pas — le refus est AVANT l’envoi', async () => {
    await dropFile(xlsxLikeFile())
    await waitFor(() => expect(screen.getByText(/classeur Excel|archive ZIP/i)).toBeTruthy())
    const simulate = screen.getByRole('button', { name: /simuler/i })
    fireEvent.click(simulate)
    await waitFor(() => expect(dryRun).not.toHaveBeenCalled())
  })

  it('ne crie pas sur un fichier CSV réel', async () => {
    const container = await dropFile(acceptableFile())
    await waitFor(() => expect(container.textContent).toMatch(/UTF-8|Windows-1252/i))
    expect(container.textContent).not.toMatch(/classeur Excel|archive ZIP/i)
  })
})
