import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

/**
 * Le défaut trouvé en recette live le 21/08/2026, dans l'écran qui existe pour
 * le corriger.
 *
 * `/import/sources` rendait 404 (l'API n'était pas encore déployée), et l'écran
 * affichait sa phrase d'introduction et RIEN d'autre. Un écran vide et muet se
 * lit « il n'y a aucune source », pas « je n'ai pas pu regarder ». C'est
 * exactement ce que le PDF 7 combat — « une erreur se remarque, une liste vide
 * se croit » — et c'est le même mécanisme que le `isError` non distingué du vide
 * relevé en recette CRM.
 *
 * Le cas d'échec ne vient pas que du déploiement : une API injoignable ou une
 * permission `data:export` absente produisent le même écran.
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
  useImportSources: vi.fn(),
  useImportSessions: () => ({ data: [], refetch: () => undefined }),
  importApi: {},
}))

const { useImportSources } = await import('../api')
const { ImportWizard } = await import('./ImportWizard')

/**
 * Le retour du hook, typé — et PAS `as never`.
 *
 * `as never` éteint le typage de l'argument : c'est ce qui avait laissé passer
 * un outil copilote mort à 100 % des appels sans qu'un test tombe (PDF 6). Le
 * lint le refuse, à raison. Une conversion explicite en deux temps garde au
 * moins la forme sous les yeux.
 */
type SourcesQuery = ReturnType<typeof useImportSources>
const query = (state: { data?: unknown; isLoading: boolean; isError: boolean }) => state as unknown as SourcesQuery

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ImportWizard />
    </QueryClientProvider>,
  )
}

describe('l’assistant d’import dit ce qu’il n’a pas pu faire', () => {
  it('DIT que la lecture a échoué, au lieu de rester muet', async () => {
    vi.mocked(useImportSources).mockReturnValue(query({ data: undefined, isLoading: false, isError: true }))
    wrap()
    await waitFor(() => expect(screen.getByText(/je n’ai pas pu regarder/i)).toBeTruthy())
  })

  it('distingue « en cours » de « rien »', async () => {
    vi.mocked(useImportSources).mockReturnValue(query({ data: undefined, isLoading: true, isError: false }))
    wrap()
    await waitFor(() => expect(screen.getByText(/récupère les sources/i)).toBeTruthy())
  })

  it('ne crie pas quand tout va bien', () => {
    vi.mocked(useImportSources).mockReturnValue(query({ data: [], isLoading: false, isError: false }))
    const { container } = wrap()
    expect(container.textContent).not.toMatch(/je n’ai pas pu regarder/i)
  })
})

/**
 * #1451.1 — LE BOUTON QUI OUVRE UN SÉLECTEUR QUI REFUSERA LE FICHIER.
 *
 * Quatre sources sur treize déclarent `xlsx` ou `zip` (`boondmanager_export`,
 * `talent_pool`, `missions`, `cv_bulk`) alors que `READABLE_IMPORT_FORMATS` ne
 * contient que `csv`. La carte DISAIT déjà « format pas encore lu » ; son bouton
 * « Choisir cette source » restait actif, ouvrait un sélecteur en
 * `accept=".csv,.txt,.tsv"` — et le navigateur refusait le fichier de
 * l'utilisateur, sans un mot.
 *
 * Un badge qui dit non à côté d'un bouton qui dit oui, c'est le bouton qu'on
 * croit.
 */
const UNREADABLE_CARD = {
  key: 'talent_pool',
  objects: ['talent'],
  format: 'xlsx',
  readable: false,
  tier: 'mvp',
  imports: ['talents'],
  skips: [],
  howTo: 'Exporte depuis ton outil.',
  required: [],
  fields: [],
} as const

/** Le bouton « Choisir cette source » de l'unique carte rendue. */
function chooseButton(): HTMLElement {
  return screen.getByRole('button', { name: /choisir cette source|choose this source/i })
}

describe('#1451.1 — une source dont le format ne se lit pas n’offre pas de bouton mort', () => {
  it('ÉTEINT le bouton, au lieu d’ouvrir un sélecteur qui refusera le fichier', () => {
    vi.mocked(useImportSources).mockReturnValue(query({ data: [UNREADABLE_CARD], isLoading: false, isError: false }))
    wrap()
    expect(chooseButton().hasAttribute('disabled')).toBe(true)
  })

  it('DIT pourquoi il est éteint — sur le bouton lui-même, pas seulement dans la carte', () => {
    vi.mocked(useImportSources).mockReturnValue(query({ data: [UNREADABLE_CARD], isLoading: false, isError: false }))
    wrap()
    expect(chooseButton().getAttribute('title') ?? '').toMatch(/csv/i)
  })

  it('laisse le bouton d’une source LISIBLE parfaitement actif', () => {
    vi.mocked(useImportSources).mockReturnValue(
      query({
        data: [{ ...UNREADABLE_CARD, key: 'contacts_only', format: 'csv', readable: true }],
        isLoading: false,
        isError: false,
      }),
    )
    wrap()
    expect(chooseButton().hasAttribute('disabled')).toBe(false)
  })
})

/**
 * #1449 — la page promet quelque chose AVANT de montrer treize formats, et
 * range les sources par intention plutôt qu'à plat.
 */
describe('Import — la promesse, et les familles', () => {
  const CARDS = [
    { ...UNREADABLE_CARD, key: 'hubspot_export', format: 'csv', readable: true },
    { ...UNREADABLE_CARD, key: 'talent_pool' },
    { ...UNREADABLE_CARD, key: 'accounts_only', format: 'csv', readable: true },
  ]

  it('dit à quoi sert un import, et en quoi il diffère d’une connexion', () => {
    vi.mocked(useImportSources).mockReturnValue(query({ data: CARDS, isLoading: false, isError: false }))
    const { container } = wrap()

    expect(container.textContent).toMatch(/ton historique, même sans connecter tes outils/)
    expect(container.textContent).toMatch(/Import : reprise ponctuelle/)
    expect(container.textContent).toMatch(/Connexion : des données synchronisées/)
    expect(screen.getByRole('link', { name: /Voir les intégrations/ })).toHaveAttribute('href', '/integrations')
  })

  it('range les sources dans leurs familles, sans en perdre une seule', () => {
    vi.mocked(useImportSources).mockReturnValue(query({ data: CARDS, isLoading: false, isError: false }))
    const { container } = wrap()

    expect(container.textContent).toContain('Je récupère un ancien outil')
    expect(container.textContent).toContain('Je récupère mes consultants')
    expect(container.textContent).toContain('Je récupère mon business')
  })

  it('une source INCONNUE de la table n’est pas perdue — elle rejoint la dernière famille', () => {
    // ⚠️ C'est la propriété qui rend l'ajout d'une source côté serveur sans
    // risque pour cet écran : sans elle, une clé neuve disparaîtrait en silence.
    vi.mocked(useImportSources).mockReturnValue(
      query({
        data: [{ ...UNREADABLE_CARD, key: 'source_inedite', format: 'csv', readable: true }],
        isLoading: false,
        isError: false,
      }),
    )
    const { container } = wrap()

    expect(container.textContent).toContain('Je récupère mon business')
    expect(screen.getByRole('button', { name: 'Choisir cette source' })).toBeEnabled()
  })

  it('une famille SANS carte ne rend pas d’intertitre orphelin', () => {
    vi.mocked(useImportSources).mockReturnValue(
      query({ data: [{ ...UNREADABLE_CARD, key: 'talent_pool' }], isLoading: false, isError: false }),
    )
    const { container } = wrap()

    // Un titre sans rien dessous se lit comme un chargement en panne.
    expect(container.textContent).toContain('Je récupère mes consultants')
    expect(container.textContent).not.toContain('Je récupère un ancien outil')
  })
})

/**
 * #1450 — LA CARTE DOIT SE LIRE, PAS SE DÉCHIFFRER.
 *
 * *« Refaire les cartes pour rendre les choix beaucoup plus visuels »* : une
 * icône, un titre, **un bénéfice en une phrase**, les données importées **en
 * chips**, le format en badge, un CTA clair. Ce qui se teste ici est ce qu'un
 * test peut voir : le bénéfice existe, les puces sont des puces, et rien n'est
 * PERDU quand il y en a plus de quatre.
 */
const RICH_CARD = {
  key: 'hubspot_export',
  objects: ['account', 'contact'],
  format: 'csv',
  readable: true,
  tier: 'mvp',
  imports: ['Comptes', 'Contacts', 'Deals', 'Notes', 'Tâches', 'Propriétaires'],
  skips: ['Pièces jointes'],
  howTo: 'Exporte depuis ton CRM.',
  required: ['name'],
  fields: ['name'],
}

describe('#1450 — la carte de source', () => {
  it('porte un bénéfice en une phrase, pas une énumération de champs', () => {
    vi.mocked(useImportSources).mockReturnValue(query({ data: [RICH_CARD], isLoading: false, isError: false }))
    wrap()

    expect(
      screen.getByText(/Récupère tes comptes, contacts, affaires et notes depuis l'export de ton CRM\./),
    ).toBeInTheDocument()
  })

  it('montre au plus quatre puces — et COMPTE le reste au lieu de le perdre', () => {
    vi.mocked(useImportSources).mockReturnValue(query({ data: [RICH_CARD], isLoading: false, isError: false }))
    wrap()

    expect(screen.getByText('Comptes')).toBeInTheDocument()
    expect(screen.getByText('Notes')).toBeInTheDocument()
    // La cinquième et la sixième ne sont pas rendues…
    expect(screen.queryByText('Tâches')).toBeNull()
    // …mais elles sont DITES. Une carte qui tronque en silence ment sur ce
    // qu'elle importe, et c'est la moitié qui compte le plus.
    expect(screen.getByText('+2 autres')).toBeInTheDocument()
  })

  it('garde le badge de format et le geste', () => {
    vi.mocked(useImportSources).mockReturnValue(query({ data: [RICH_CARD], isLoading: false, isError: false }))
    wrap()

    expect(screen.getByText('CSV')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Choisir cette source/ })).toBeEnabled()
  })
})
