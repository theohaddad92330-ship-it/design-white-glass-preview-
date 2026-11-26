import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { IMPORT_CONTENT_MAX_CHARS } from '@bellum/contracts'

/**
 * Un fichier trop lourd se DIT, il ne se découvre pas en 413.
 *
 * Le 14/08/2026, une bêta-testeuse n'a réussi à importer qu'un seul compte.
 * L'assistant envoyait le fichier entier dans le corps de la requête, sans
 * jamais annoncer de plafond : au-delà de la limite de corps de l'API, le refus
 * arrivait en 413 — un code sans corps JSON, donc sans phrase à afficher.
 * L'écran restait muet sur la seule chose qui expliquait l'échec.
 *
 * Le plafond est celui du contrat (`IMPORT_CONTENT_MAX_CHARS`), pas une valeur
 * recopiée ici : les deux doivent bouger ensemble, sinon l'écran annonce un
 * chiffre que le serveur ne respecte plus.
 */

const dryRun = vi.fn()

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

/**
 * Un vrai fichier — avec son `arrayBuffer`.
 *
 * `File` de jsdom 20 n'implémente pas `arrayBuffer()`, que `decode-file.ts`
 * appelle. Le poser ici garde le décodage RÉEL sous le test : c'est lui qui
 * produit la chaîne dont la longueur est comparée au plafond, et un faux
 * `size` posé à la main testerait la maquette, pas l'écran.
 */
function fileOf(text: string, name: string): File {
  const bytes = new TextEncoder().encode(text)
  const file = new File([text], name, { type: 'text/csv' })
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(bytes.buffer),
    configurable: true,
  })
  return file
}

/** Un caractère de trop. */
function oversizedFile(): File {
  return fileOf('a'.repeat(IMPORT_CONTENT_MAX_CHARS + 1), 'ancien-crm.csv')
}

function acceptableFile(): File {
  return fileOf('Email;Nom\nlaura@skaizen.fr;Alfred\n', 'contacts.csv')
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

describe('l’assistant d’import et le poids du fichier', () => {
  it('DIT le plafond au lieu de laisser partir un envoi qui finira en 413', async () => {
    const container = await dropFile(oversizedFile())
    await waitFor(() => expect(container.textContent).toMatch(/trop volumineux/i))
    // Le chiffre annoncé vient du contrat.
    expect(container.textContent).toContain(String(IMPORT_CONTENT_MAX_CHARS / 1_000_000))
  })

  it('ne simule rien tant que le fichier dépasse — le refus est AVANT l’envoi', async () => {
    await dropFile(oversizedFile())
    await waitFor(() => expect(screen.getByText(/trop volumineux/i)).toBeTruthy())
    const simulate = screen.getByRole('button', { name: /simuler/i })
    fireEvent.click(simulate)
    await waitFor(() => expect(dryRun).not.toHaveBeenCalled())
  })

  it('ne crie pas sur un fichier de taille normale', async () => {
    const container = await dropFile(acceptableFile())
    await waitFor(() => expect(container.textContent).toMatch(/UTF-8|Windows-1252/i))
    expect(container.textContent).not.toMatch(/trop volumineux/i)
  })
})

/**
 * Refonte Théo (23/10) — l'assistant « par outil » dans la grammaire de `b/c4-assistant-import` : une
 * fois la source choisie, le travail se lit en boîtes titrées, dans l'ordre — le fichier, (les champs,
 * dès qu'ils sont reconnus), puis la vérification. Sait dire NON sur l'ordre et les titres.
 */
describe('Théo — les boîtes de l’assistant, dans l’ordre', () => {
  it('fichier puis vérification, chacune sous son titre', async () => {
    const container = await dropFile(acceptableFile())
    const blocks = Array.from(container.querySelectorAll('[data-theo-block]')).map(node =>
      node.getAttribute('data-theo-block'),
    )
    expect(blocks).toEqual(['import-file', 'import-check'])
    expect(screen.getByRole('heading', { name: 'Glisse ton fichier ici.' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Vérifier avant d’écrire' })).toBeTruthy()
    // La promesse de c4, au pied du dépôt : rien n'est écrit avant la validation.
    expect(container.querySelector('[data-theo-block="import-file"]')?.textContent).toMatch(/Rien n’est écrit/)
  })
})
