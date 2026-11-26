import { AccountsController } from './accounts.controller'
import type { AccountsService } from './accounts.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'

/**
 * #2128.1 — LE PORTEUR DU COMPTE VOYAGE JUSQU'AU DOSSIER, NOMMÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE SUITE GARDE, ET POURQUOI ELLE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /accounts/:id` répondait `SELECT a.*` : la colonne `assigned_to` arrivait
 * donc DÉJÀ au navigateur, sans être au contrat et sans qu'aucun écran ne la
 * lise. Un uuid n'est pas un nom — et c'est précisément pour ça que personne ne
 * l'avait branché. Ce qui manquait n'était pas la donnée, c'était l'appel à la
 * dérivation qui la NOMME (`resolveOwner`, porte publique de
 * `resolveOwnerNames`, la même que la liste des comptes).
 *
 * Trois propriétés, et la troisième est celle qu'on rate :
 *
 *  1. un compte PORTÉ rend `owner` nommé — l'écran affiche « Sarah Martin » ;
 *  2. un compte que PERSONNE ne porte rend `owner: null` — une lecture qui a eu
 *     lieu et qui dit « personne ». L'écran le DIT (« propriétaire non
 *     renseigné »), il ne laisse pas une ligne vide (GA-18/GA-19) ;
 *  3. **la dérivation n'est appelée qu'AVEC l'identifiant du porteur.** Sans
 *     porteur, aucune requête vers `profiles` ne part : une lecture de dossier
 *     est le chemin le plus chaud du produit, et une requête inutile par
 *     ouverture de dossier est un coût que rien ne rachète.
 */

const USER: CurrentUserPayload = { userId: 'user-1', email: 'user@esn.fr' }
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
const OWNER_ID = '22222222-2222-4222-8222-222222222222'

function build(assignedTo: string | null) {
  const resolveOwner = jest.fn(async (id: string | null) =>
    id === OWNER_ID ? { user_id: OWNER_ID, name: 'Sarah Martin' } : null,
  )
  const accountsService = {
    findOneForWorkspace: jest.fn().mockResolvedValue({
      type: 'success',
      output: {
        id: ACCOUNT_ID,
        company_name: 'THALES',
        status: 'completed',
        assigned_to: assignedTo,
        updated_at: '2026-09-14T08:00:00.000Z',
      },
    }),
    computeAgeDays: jest.fn(() => 3),
    resolveLastAnalyzedAt: jest.fn().mockResolvedValue(null),
    resolveOwner,
    // #2128.19 — chevauchement hors du périmètre de cette suite (voir
    // `accounts.dossier-active-analysis.spec.ts`), neutralisé ici.
    resolveActiveAnalysisByColleague: jest.fn().mockResolvedValue(null),
    isFollowed: jest.fn().mockResolvedValue(false),
  } as unknown as AccountsService

  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
  } as unknown as WorkspaceContextService

  // Construction POSITIONNELLE, comme les autres suites de ce contrôleur.
  const controller = new AccountsController(
    accountsService,
    {} as never, // analysisService
    {} as never, // analysisRuns
    {} as never, // shareService
    {} as never, // timeline
    {} as never, // contactsService
    workspaceContext,
    {} as never, // needPlay,
    undefined, // analytics
    undefined, // esnProfile
    undefined, // stockSnapshots
    undefined, // firstEuro
    undefined, // marketMemory
    undefined, // accountMissions
    undefined, // intelligence
    // Le cloisonnement de périmètre (revue sécurité 15/09/2026). `@Optional()`
    // au constructeur, jamais optionnel pour la RÈGLE : absent, le contrôleur
    // LÈVE au lieu de servir tout l'espace. Ici, « pas de cloisonnement » se
    // dit `null` — le niveau d'accès historique.
    { scopeFor: jest.fn().mockResolvedValue(null) } as never,
  )
  return { controller, resolveOwner }
}

describe('GET /accounts/:id — le porteur, NOMMÉ', () => {
  it('rend le porteur nommé quand quelqu’un porte le compte', async () => {
    const { controller } = build(OWNER_ID)

    const dossier = (await controller.findOne(ACCOUNT_ID, USER)) as { owner: unknown }

    expect(dossier.owner).toEqual({ user_id: OWNER_ID, name: 'Sarah Martin' })
  })

  it('rend `null` — jamais un champ absent — quand personne ne porte le compte', async () => {
    const { controller } = build(null)

    const dossier = (await controller.findOne(ACCOUNT_ID, USER)) as { owner: unknown }

    // `null` et non `undefined` : l'écran doit pouvoir distinguer « lu, personne
    // ne le porte » d'« API trop ancienne pour le dire ».
    expect(dossier).toHaveProperty('owner', null)
  })

  it('n’interroge JAMAIS les profils pour un compte sans porteur', async () => {
    const { controller, resolveOwner } = build(null)

    await controller.findOne(ACCOUNT_ID, USER)

    expect(resolveOwner).toHaveBeenCalledWith(null)
  })
})
