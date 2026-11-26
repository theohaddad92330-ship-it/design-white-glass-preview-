import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CLIENT_TOOLS } from '@bellum/contracts'
import { render } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-error'

/**
 * GA-45 — l'échec d'un connecteur nomme la CAPACITÉ, jamais l'éditeur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET POURQUOI ELLE A BESOIN D'UNE GARDE DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * Doctrine du 02/08/2026 : l'application nomme « ton CRM », « ta messagerie »,
 * « ton agenda ». Seul Réglages › Intégrations nomme l'outil, parce que c'est là
 * que l'utilisateur autorise lui-même l'accès.
 *
 * Le corps d'erreur d'un connecteur
 * (`packages/contracts/src/schemas/connector-error.ts`) porte `provider` —
 * « hubspot », « google ». C'est de la DONNÉE : les journaux la lisent, l'écran
 * jamais. Aujourd'hui `ApiError` ne transporte que `status`, `code` et
 * `message`, donc `provider` ne peut PAS arriver jusqu'au JSX ; cette garde
 * vérifie que personne ne le rebranche, et que la capacité, elle, est bien dite.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU QU'ELLE FERME, ET QUE DEUX GARDES LAISSAIENT OUVERT
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux gardes surveillent déjà les noms d'éditeur, et TOUTES DEUX exemptent à la
 * maille du fichier ou du namespace :
 *
 *   - GA-44 (`architecture/no-vendor-names-in-app.test.ts`) exempte les fichiers
 *     d'i18n PAR LEUR NOM — tout `integrations.json`, dans n'importe quelle
 *     langue ;
 *   - `i18n/no-vendor-names.test.ts` exempte le NAMESPACE entier
 *     (`ALLOWED_NAMESPACES = ['integrations', 'settings']`).
 *
 * Or ce namespace sert aussi `CrmDataPanel`, qui vit dans **Connaissances ›
 * Données CRM** — un écran ordinaire, où l'exception ne s'applique pas. Mesuré
 * au moment d'écrire cette garde : l'entête affichait « Importer depuis
 * HubSpot » et la boîte de dialogue « la timeline HubSpot », hors de l'écran
 * d'exception, sans qu'aucune des deux gardes puisse le voir.
 *
 * Une exemption par FICHIER ou par NAMESPACE ne dit rien de l'écran qui CONSOMME
 * la clé. Cette garde regarde donc les VALEURS des sous-arbres réellement
 * consommés par les écrans de connecteur, et les DOM qu'ils produisent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE COUVRE PAS — dit ici plutôt que sous-entendu
 * ─────────────────────────────────────────────────────────────────────────────
 * Un nom d'éditeur peut encore arriver du serveur dans une chaîne de DONNÉES
 * libre. Le cas vivant du dépôt est `SyncOutcome.unavailable`
 * (`apps/api/src/modules/crm/crm-import.service.ts`) : le message BRUT du
 * fournisseur, relayé tel quel dans `CrmImportPanel` parce que « 401
 * invalid_grant » se répare et « l'import a échoué » non. Cet arbitrage est
 * antérieur et n'est pas re-litigé ici ; il est nommé pour que personne ne lise
 * le silence de cette garde comme une preuve.
 */

/**
 * Les éditeurs que ces écrans peuvent toucher, tels qu'ils s'écrivent.
 *
 * Sous-ensemble ciblé de la liste de GA-44 — un test ci-dessous vérifie qu'il en
 * reste bien un SOUS-ENSEMBLE, pour que les deux listes ne divergent pas en
 * silence.
 */
const VENDORS = ['HubSpot', 'Salesforce', 'Pipedrive', 'Google Workspace', 'Microsoft 365'] as const

/** Les noms qui n'apparaissent pas dans GA-44 mais que ces écrans peuvent croiser. */
const MAILBOX_VENDORS = ['Gmail', 'Outlook'] as const

const WEB_SRC = join(__dirname, '..')

/**
 * Les écrans qui rendent l'échec d'un connecteur.
 *
 * `/pilotage` est dans la liste bien qu'il ne soit pas modifié ici : il est le
 * premier corrigé, et une garde qui ne surveillerait que les suivants laisserait
 * le premier régresser.
 */
const CONNECTOR_SCREENS = [
  'features/pilotage/view/CrmPipelinePanel.tsx',
  'features/crm/view/CrmDataPanel.tsx',
  'features/crm-import/view/CrmImportPanel.tsx',
  'features/mailbox/view/MailboxPage.tsx',
] as const

/**
 * Les sous-arbres d'i18n que ces écrans consomment.
 *
 * `integrations.crm` est le point du trou : le FICHIER est exempté par GA-44,
 * mais ce sous-arbre-là s'affiche dans Connaissances.
 */
const CONSUMED_I18N = [
  { namespace: 'integrations', path: ['crm'] },
  { namespace: 'crmImport', path: [] },
  { namespace: 'mailbox', path: [] },
] as const

const LOCALES = ['fr', 'en'] as const

/** Retire les commentaires : un docblock qui EXPLIQUE la règle la cite. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Retire les lookups i18n `t(`…`)` : ce qui y entre en ressort TRADUIT.
 *
 * `t(`providers.${run.provider}`)` lit bien un champ `provider`, mais ce qui
 * s'affiche est « Ton CRM ». Compter cette lecture comme une fuite ferait
 * échouer la garde sur la traduction la plus correcte du dépôt.
 */
function stripI18nLookups(source: string): string {
  return source.replace(/\bt\(\s*`[^`]*`[^)]*\)/g, 't(<i18n>)')
}

function readScreen(relative: string): string {
  return readFileSync(join(WEB_SRC, relative), 'utf8')
}

/**
 * Toutes les VALEURS d'un sous-arbre d'i18n, à plat.
 *
 * Les CLÉS sont exclues volontairement : `crmImport.providers.hubspot` est une
 * clé de code dont la valeur est « Ton CRM ». Confondre les deux ferait échouer
 * la garde sur la traduction la plus correcte du dépôt.
 */
function values(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node)
  else if (node && typeof node === 'object') for (const child of Object.values(node)) values(child, out)
  return out
}

function subtree(namespace: string, locale: string, path: readonly string[]): unknown {
  const file = join(WEB_SRC, 'i18n', 'locales', locale, `${namespace}.json`)
  let node: unknown = JSON.parse(readFileSync(file, 'utf8'))
  for (const key of path) node = (node as Record<string, unknown>)[key]
  return node
}

const ALL_VENDORS = [...VENDORS, ...MAILBOX_VENDORS] as const

/**
 * Le détecteur du RENDU : insensible à la casse.
 *
 * Ce que l'utilisateur lit, il le lit quelle que soit la casse — `hubspot` rendu
 * nu dans un `<Text>` est aussi fautif que `HubSpot`.
 */
function vendorsIn(text: string): string[] {
  return ALL_VENDORS.filter(vendor => new RegExp(`\\b${vendor}\\b`, 'i').test(text))
}

/**
 * Le détecteur de la SOURCE : sensible à la casse, et c'est délibéré.
 *
 * `provider: 'hubspot'` est une valeur de FIL — l'identifiant que le serveur
 * attend dans `POST /crm/import`. L'interdire demanderait de renommer un contrat
 * d'API pour un motif d'affichage, sans rien changer à l'écran. Ce qui est
 * interdit, c'est l'orthographe d'AFFICHAGE (« HubSpot »), celle qu'on n'écrit
 * que pour être lue. GA-44 fait la même distinction, par la même casse.
 *
 * Les deux couches se complètent : si un identifiant en minuscules finissait
 * malgré tout dans le DOM, `vendorsIn` l'y attraperait.
 */
function displayVendorsIn(source: string): string[] {
  return ALL_VENDORS.filter(vendor => new RegExp(`\\b${vendor}\\b`).test(source))
}

// ─────────────────────────────────────────────────────────────────────────────
// Le RENDU : ce que ces écrans montrent quand le connecteur refuse.
// ─────────────────────────────────────────────────────────────────────────────

const crmContacts = vi.fn()
const importRuns = vi.fn()
const mailboxStatus = vi.fn()
const mailSearch = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => createElement('a', { href: to }, children),
}))
vi.mock('@/features/crm/hooks/useCrmContacts', () => ({ useCrmContacts: () => crmContacts() }))
vi.mock('@/features/crm/hooks/useLogCrmActivity', () => ({ useLogCrmActivity: () => ({ mutateAsync: vi.fn() }) }))
// #2150.32 — `CrmDataPanel` appelle ce hook depuis le commit précédent ; sans
// ce faux, `useQueryClient()` explose hors de tout `QueryClientProvider` et
// l'écran ne monte plus du tout — cette garde ne peut alors plus rien lire.
vi.mock('@/features/crm/hooks/useAddCrmCompanyToPortfolio', () => ({
  useAddCrmCompanyToPortfolio: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}))
vi.mock('@/features/crm-import/api', () => ({
  useCrmImportRuns: () => importRuns(),
  useCrmReadStatus: () => ({ data: [] }),
  useCrmFirstImport: () => ({ data: [] }),
  useRunCrmImport: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/mailbox/api', () => ({
  useMailboxStatus: () => mailboxStatus(),
  useMailSearch: () => mailSearch(),
  // Théo B m1 — la file « À traiter » pose une question par intention choisie : chacune rend la même réponse refusée.
  useMailSearches: (list: unknown[]) => list.map(() => mailSearch()),
  // La signature ne nomme aucun fournisseur ; elle est ici pour que l'écran
  // monte, pas pour être le sujet de cette garde.
  useMailboxSignature: () => ({ data: undefined, isLoading: false }),
  useSaveMailboxSignature: () => ({ mutate: vi.fn(), isPending: false }),
  // Théo B m1.R2 — les compteurs des onglets lisent « Brouillons » et « À venir » ; aucun ne nomme un fournisseur.
  useMyMessageDrafts: () => ({ data: { items: [], total: 0 } }),
  useScheduledSends: () => ({ data: { items: [] } }),
  useTrackedThreads: () => ({ data: { threads: [] }, isLoading: false }),
}))
vi.mock('@/features/mailbox/view/DraftDialog', () => ({ DraftDialog: () => null }))
// #4406 — les conversations d'une messagerie tierce lisent la session : hors sujet de cette garde (comme DraftDialog).
vi.mock('@/features/beeper/view/BeeperConversations', () => ({ BeeperConversations: () => null }))
// Théo B m2-brouillons — les quatre vues ont leurs propres specs (`view/m2/*.test.tsx`) ; ici elles se taisent.
vi.mock('@/features/mailbox/view/m2/MailboxM2Views', () => ({
  MailboxViewTabs: () => null,
  MailboxM2Views: () => null,
}))
vi.mock('@/features/profiles/hooks/useProfile', () => ({ useProfile: () => ({ data: undefined }) }))
// #2393.7 (GA-45) — même raison que `DraftDialog` juste au-dessus, et même
// remède déjà appliqué dans `MailboxPage.test.tsx` : `LinkAccountDialog` tire
// `useAccounts` → `useSession`, absente ici. Repéré deux fois en CI (runs
// 35875446683 et 35824999132, 23/09/2026, 8 h d'écart) : « useSession must be
// used within a SessionProvider », non reproductible en isolation localement
// (flake sous contention — voir `.claude/projet.md` §4 sur les timeouts sous
// contention). Un faux muet ferme le chemin d'appel quel que soit ce qui
// déclenche le montage : `linkThread` reste `null` dans cette garde, ce
// composant n'a jamais de raison réelle d'exister ici.
vi.mock('@/features/mailbox/view/LinkAccountDialog', () => ({ LinkAccountDialog: () => null }))
// L'entête de la messagerie est personnalisé depuis le profil (#1397.1), ce qui
// tire la session entière. Elle n'est pas le sujet de cette garde — un prénom
// n'est pas un nom d'ÉDITEUR — mais sans elle l'écran ne monte plus, et une
// garde qui ne monte pas son écran ne lit plus rien.
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => 'Louis' }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}))

const { CrmDataPanel } = await import('@/features/crm/view/CrmDataPanel')
const { CrmImportPanel } = await import('@/features/crm-import/view/CrmImportPanel')
const { MailboxPage } = await import('@/features/mailbox/view/MailboxPage')

/**
 * Le corps EXACT qu'un connecteur rend sur une portée manquante — `provider`
 * compris. C'est la matière dont l'écran ne doit rien laisser passer.
 */
const SCOPE_MISSING_BODY = {
  statusCode: 503,
  error: 'Service Unavailable',
  code: 'scope_missing',
  reason: 'scope_missing',
  provider: 'hubspot',
  capability: 'crm',
  scopes: ['crm.objects.contacts.read', 'crm.objects.companies.read', 'crm.objects.deals.read'],
  message:
    "Je n'ai pas le droit de regarder ton CRM. Reconnecte cet outil : un accès déjà donné ne s'élargit pas tout seul.",
}

function scopeMissingError(): ApiError {
  return new ApiError(SCOPE_MISSING_BODY.message, SCOPE_MISSING_BODY.statusCode, SCOPE_MISSING_BODY.code)
}

/** Les trois écrans, chacun placé dans l'état « connecté, mais pas le droit de lire ». */
function renderedFailures(): { screen: string; text: string }[] {
  crmContacts.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
    error: scopeMissingError(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    isRefetching: false,
  })
  importRuns.mockReturnValue({ data: undefined, isError: true, error: scopeMissingError() })
  mailboxStatus.mockReturnValue({
    data: {
      connected: true,
      provider: 'google',
      address: 'louis@bellum-ai.com',
      capabilities: { read: true, draft: true, send: true, labels: false, outOfOffice: false },
    },
    isLoading: false,
  })
  mailSearch.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
    error: scopeMissingError(),
    refetch: vi.fn(),
  })

  return [
    { screen: 'CrmDataPanel', text: render(createElement(CrmDataPanel)).container.textContent ?? '' },
    { screen: 'CrmImportPanel', text: render(createElement(CrmImportPanel)).container.textContent ?? '' },
    { screen: 'MailboxPage', text: render(createElement(MailboxPage)).container.textContent ?? '' },
  ]
}

beforeEach(() => {
  crmContacts.mockReset()
  importRuns.mockReset()
  mailboxStatus.mockReset()
  mailSearch.mockReset()
})

describe('GA-45 — la garde LIT quelque chose', () => {
  it('les quatre écrans de connecteur existent et traitent bien `scope_missing`', () => {
    // Sans ce test, un fichier renommé rendrait la garde verte sur du vide.
    expect(CONNECTOR_SCREENS.length).toBe(4)
    for (const relative of CONNECTOR_SCREENS) {
      expect(stripComments(readScreen(relative))).toContain('scope_missing')
    }
  })

  it('les sous-arbres d’i18n surveillés ne sont pas vides, dans les DEUX langues', () => {
    for (const { namespace, path } of CONSUMED_I18N) {
      for (const locale of LOCALES) {
        expect(values(subtree(namespace, locale, path)).length).toBeGreaterThan(5)
      }
    }
  })

  it('sa liste d’éditeurs reste un SOUS-ENSEMBLE des outils du client déclarés au contrat', () => {
    // Deux listes qui divergent en silence donnent deux règles. Depuis #1912.11
    // (décision Louis 13/09/2026, batch 11), la liste vit à UN endroit —
    // `@bellum/contracts` (`tool-naming.ts`) — et GA-44 la lit au lieu de la
    // recopier : c'est donc elle que celle-ci doit continuer de couvrir.
    const declared = CLIENT_TOOLS.flatMap(tool => tool.names)
    expect(ALL_VENDORS.filter(vendor => !declared.includes(vendor))).toEqual([])
    expect(readFileSync(join(__dirname, 'no-vendor-names-in-app.test.ts'), 'utf8')).toContain('CLIENT_TOOLS')
  })
})

describe('GA-45 — la garde sait dire NON', () => {
  it('refuse un libellé d’éditeur dans une valeur d’i18n', () => {
    expect(vendorsIn('Importer depuis HubSpot')).toEqual(['HubSpot'])
    expect(vendorsIn('Importer depuis ton CRM')).toEqual([])
  })

  it('refuse un nom d’éditeur rendu dans un DOM', () => {
    const fautif = render(createElement('p', null, 'Reconnecte HubSpot')).container.textContent ?? ''
    const sain = render(createElement('p', null, 'Reconnecte ton CRM')).container.textContent ?? ''
    expect(vendorsIn(fautif)).toHaveLength(1)
    expect(vendorsIn(sain)).toHaveLength(0)
  })

  it('ne confond pas une CLÉ de code avec une valeur affichée', () => {
    // `providers.hubspot` est une clé ; « Ton CRM » est ce qui s'affiche.
    expect(values({ providers: { hubspot: 'Ton CRM' } })).toEqual(['Ton CRM'])
  })
})

describe('GA-45 — la SOURCE des écrans de connecteur', () => {
  it('aucun n’écrit un nom d’éditeur destiné à être LU', () => {
    const offenders = CONNECTOR_SCREENS.flatMap(relative =>
      displayVendorsIn(stripComments(readScreen(relative))).map(vendor => `${relative} → ${vendor}`),
    )
    expect(offenders).toEqual([])
  })

  it('laisse passer l’identifiant de FIL, et refuse l’orthographe d’affichage', () => {
    // La distinction que cette garde tient : un contrat d'API n'est pas un
    // libellé. `CrmImportPanel` envoie bien `provider: 'hubspot'` au serveur.
    expect(displayVendorsIn(`{ provider: 'hubspot', dryRun: true }`)).toEqual([])
    expect(displayVendorsIn(`<Text>Importer depuis HubSpot</Text>`)).toEqual(['HubSpot'])
    // …et si l'identifiant finissait dans le DOM, l'autre couche l'attraperait.
    expect(vendorsIn('hubspot')).toEqual(['HubSpot'])
  })

  it('aucun ne relit le champ `provider` du corps d’erreur', () => {
    // ⚠️ C'est la SOURCE qui tient cette règle, et elle seule.
    //
    // La première version de cette garde s'en remettait au RENDU, et elle est
    // passée au vert sur un `provider` délibérément rebranché : `ApiError` ne
    // transporte pas le champ, donc la lecture rend `undefined` et le repli
    // i18n s'affiche. Le DOM était propre — par accident. Le jour où
    // `ApiError` transporterait le corps entier, le même code afficherait
    // « hubspot » et rien ne l'aurait vu venir.
    //
    // Le premier motif essayé, `(?:error|failure|body)\.provider`, ratait
    // `(failure as unknown as { provider?: string }).provider` : le caractère
    // qui précède le point est une parenthèse, pas un identifiant.
    for (const relative of CONNECTOR_SCREENS) {
      const source = stripI18nLookups(stripComments(readScreen(relative)))
      expect(`${relative}: ${/\.\s*provider\b/.test(source)}`).toBe(`${relative}: false`)
    }
  })

  it('laisse passer le `provider` qui traverse une TRADUCTION', () => {
    // `t(`providers.${run.provider}`)` est légitime : ce qui en ressort est
    // « Ton CRM ». C'est la clé de code, pas le libellé.
    expect(stripI18nLookups('const label = t(`providers.${run.provider}`)')).not.toMatch(/\.\s*provider\b/)
    // …et une lecture qui ne traverse rien reste refusée, quelle que soit la
    // gymnastique de typage devant le point.
    expect(stripI18nLookups('const p = (failure as unknown as { provider?: string }).provider')).toMatch(
      /\.\s*provider\b/,
    )
    expect(stripI18nLookups('const p = failure?.provider')).toMatch(/\.\s*provider\b/)
  })
})

describe('GA-45 — l’i18n RÉELLEMENT consommé par ces écrans', () => {
  it('aucune valeur ne nomme un éditeur, dans les deux langues', () => {
    // C'est ce que l'exemption par NOM DE FICHIER de GA-44 ne pouvait pas voir :
    // `integrations.crm` s'affiche dans Connaissances, pas dans Intégrations.
    const offenders: string[] = []
    for (const { namespace, path } of CONSUMED_I18N) {
      for (const locale of LOCALES) {
        for (const value of values(subtree(namespace, locale, path))) {
          for (const vendor of vendorsIn(value)) {
            offenders.push(`${locale}/${namespace}.json${path.length ? `#${path.join('.')}` : ''} → ${vendor}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('GA-45 — le RENDU : ce que l’utilisateur voit quand le connecteur refuse', () => {
  it('le corps porte « hubspot », aucun DOM ne le porte', () => {
    for (const { screen, text } of renderedFailures()) {
      expect(`${screen} → ${vendorsIn(text).join(', ')}`).toBe(`${screen} → `)
      expect(text).not.toMatch(/hubspot|google/i)
    }
  })

  it('chaque écran NOMME la capacité — l’absence d’éditeur ne suffit pas', () => {
    // Un écran muet passerait le test précédent sans rien dire d'utile.
    for (const { screen, text } of renderedFailures()) {
      expect(`${screen}: ${/ton CRM|ta messagerie/i.test(text)}`).toBe(`${screen}: true`)
    }
  })
})
