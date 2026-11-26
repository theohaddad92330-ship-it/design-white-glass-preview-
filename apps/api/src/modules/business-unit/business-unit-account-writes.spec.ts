import { NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { failure, success } from '@bellum/utils'
import { AccountsController } from '../accounts/accounts.controller'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'

/**
 * GA-366 — LE CLOISONNEMENT VAUT AUSSI EN ÉCRITURE (#2084.24).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT (revue de sécurité du 20/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-335 a fermé les LECTURES d'un compte : fiche, fragments, aperçus. Le
 * registre de dette de GA-336 disait, noir sur blanc, que les ÉCRITURES
 * restaient ouvertes — « le lot suivant ». Ce lot-ci est ce lot suivant.
 *
 * Six routes DESTRUCTRICES ne vérifiaient que l'espace : un commercial
 * cloisonné à Lyon qui obtenait l'identifiant d'un compte de Bordeaux pouvait
 * le FUSIONNER, le DÉTACHER, l'ARCHIVER, le SUPPRIMER, ou écrire dans son plan.
 * Et l'identifiant était obtenable : les agrégats de portefeuille rendaient
 * encore tout l'espace. Un cloisonnement qui tient sur ce qu'on VOIT et tombe
 * sur ce qu'on DÉFAIT donne la sensation d'être protégé — ce qui est pire
 * qu'une absence, parce que personne ne va vérifier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE, ET CE QU'ELLE REFUSE DE PROUVER
 * ─────────────────────────────────────────────────────────────────────────────
 * · **C'est le REFUS qui compte.** Un test qui vérifie qu'un ayant droit
 *   réussit ne prouve rien sur une porte : il passerait avec la porte retirée.
 *   Chaque route a donc son cas « hors périmètre », et ce cas vérifie DEUX
 *   choses — l'appelant reçoit une erreur, ET l'écriture n'a pas eu lieu. La
 *   seconde est la vraie : une porte qui lève APRÈS avoir supprimé la ligne
 *   n'est pas une porte.
 * · **`not_found`, jamais `forbidden`** — la convention du module, déjà tenue
 *   par `findOneForWorkspace` hors espace et prouvée par
 *   `business-unit-scope.spec.ts`. « Ce compte existe mais tu n'y as pas
 *   droit » est déjà une fuite. On la SUIT, on ne l'invente pas.
 * · **Elle n'attrape pas ce qu'elle ne vise pas** — le dernier `describe` est
 *   le témoin : un utilisateur NON cloisonné (`business_unit_access:
 *   'workspace'`, le niveau de tout le monde à cette heure) écrit exactement
 *   comme avant, sans une lecture de compte de plus. Une garde trop large
 *   casse le produit pour l'immense majorité qui n'a rien demandé.
 * · **Elle LÈVE si le service de périmètre manque** — fail-closed, comme
 *   `resolve-business-unit-scope.ts`. Une porte qui s'ouvre quand une
 *   dépendance saute n'est pas une porte.
 */

const USER: CurrentUserPayload = { userId: 'u-1', email: 'commercial@esn.fr' }
const SCOPE_LYON = { businessUnitIds: ['bu-lyon'], includeUnassigned: true } as const

type BuildOptions = {
  /** `null` = `business_unit_access: 'workspace'`, le niveau historique. */
  scope?: { businessUnitIds: readonly string[]; includeUnassigned: true } | null
  /** Le compte est-il dans le périmètre ? `false` ⇒ `findOneForWorkspace` rend `not_found`. */
  found?: boolean
  /** Le service de périmètre est-il câblé ? `false` ⇒ la route doit LEVER. */
  wired?: boolean
}

const buildController = (options: BuildOptions = {}) => {
  const found = options.found ?? true
  const account = { id: 'acc-1', company_name: 'Acme', status: 'completed' }
  const outOfScope = failure({ code: 'not_found', message: 'Account not found' })
  const findOneForWorkspace = jest.fn().mockResolvedValue(found ? success(account) : outOfScope)

  // Les ÉCRITURES elles-mêmes. Chacune rend un succès : si la porte manque, le
  // test voit la mutation partir, et c'est exactement ce qu'on veut mesurer.
  const absorbAccount = jest.fn().mockResolvedValue(success({ absorbed: true }))
  const detachAccount = jest.fn().mockResolvedValue(success({ detached: true }))
  const archive = jest.fn().mockResolvedValue(success({ archived: true }))
  const deleteAccount = jest.fn().mockResolvedValue(success({ deleted: true }))
  const appendUserAttackAngle = jest.fn().mockResolvedValue({ angle: 'ok' })
  const accountsService = {
    findOneForWorkspace,
    absorbAccount,
    detachAccount,
    archive,
    delete: deleteAccount,
    appendUserAttackAngle,
  }

  const cancel = jest.fn().mockResolvedValue(undefined)
  const analysisService = { cancel }
  const createFromLegacyPlanAction = jest.fn().mockResolvedValue({ id: 'item-1' })
  const planItems = { createFromLegacyPlanAction }

  const generate = jest.fn().mockResolvedValue({ ok: true, play: { id: 'play-1' }, charged: true })
  const needPlay = { generate }

  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1', role: 'member' }),
    // La salle de démonstration refuse ce geste ; ici on n'y est pas, sinon le
    // test passerait pour la mauvaise raison (un refus qui n'est pas le nôtre).
    isDemoWorkspace: jest.fn().mockResolvedValue(false),
  }
  const scopeFor = jest.fn().mockResolvedValue(options.scope ?? null)
  const businessUnits = options.wired === false ? undefined : { scopeFor }

  const controller = new AccountsController(
    accountsService as never,
    analysisService as never,
    {} as never, // analysisRuns
    {} as never, // shareService
    {} as never, // timeline
    {} as never, // contactsService
    workspaceContext as never,
    needPlay as never,
    undefined, // analytics
    undefined, // esnProfile
    undefined, // stockSnapshots
    undefined, // firstEuro
    undefined, // marketMemory
    undefined, // accountMissions
    undefined, // intelligence
    businessUnits as never,
    planItems as never,
  )

  /** Toutes les mutations de ce lot, pour l'assertion « rien n'a bougé ». */
  const ecritures = [
    generate,
    absorbAccount,
    detachAccount,
    archive,
    deleteAccount,
    appendUserAttackAngle,
    createFromLegacyPlanAction,
    cancel,
  ]

  return { controller, findOneForWorkspace, scopeFor, ecritures, cancel }
}

type Appel = (c: AccountsController) => Promise<unknown>

/**
 * LES SEPT ÉCRITURES SUR UN COMPTE, chacune avec l'appel qui l'exerce.
 *
 * ⚠️ `absorb` prend DEUX comptes : celui qu'on absorbe et celui qui absorbe.
 * Les deux sont vérifiés — n'en vérifier qu'un laisserait la moitié de la fuite
 * (rattacher un compte hors périmètre au sien revient à se l'offrir).
 */
const ECRITURES: ReadonlyArray<[string, Appel]> = [
  // ⚠️ `POST needs/play` adresse un compte par le CORPS et non par l'URL, et il
  // DÉBITE UN CRÉDIT de l'espace. Une écriture payante sur un compte d'une
  // autre unité est la pire des deux : elle agit, et elle facture.
  ['POST needs/play (le compte vient du CORPS)', c => c.createNeedPlay({ account_id: 'acc-1' } as never, USER)],
  ['POST :id/absorb', c => c.absorb('acc-1', { into: 'acc-2' } as never, USER)],
  ['POST :id/detach', c => c.detach('acc-1', USER)],
  ['POST :id/archive', c => c.archive('acc-1', USER)],
  ['POST :id/plan/actions', c => c.addPlanAction('acc-1', USER, { title: 'Appeler' } as never)],
  ['POST :id/plan/angles', c => c.addAttackAngle('acc-1', USER, { angle: 'Coût' } as never)],
  ['DELETE :id', c => c.delete('acc-1', USER)],
]

describe('GA-366 — une écriture sur un compte hors périmètre est REFUSÉE', () => {
  it.each(ECRITURES)('%s refuse un compte d’une AUTRE unité', async (_name, call) => {
    const { controller } = buildController({ scope: SCOPE_LYON, found: false })

    // La convention du module : « introuvable », jamais « interdit ».
    await expect(call(controller)).rejects.toBeInstanceOf(NotFoundException)
  })

  it.each(ECRITURES)('%s n’écrit RIEN quand le compte est hors périmètre', async (_name, call) => {
    // Le cas qui compte vraiment : une porte qui lève après avoir muté n'est
    // pas une porte. On vérifie l'ABSENCE de mutation, pas le code d'erreur.
    const { controller, ecritures } = buildController({ scope: SCOPE_LYON, found: false })

    await expect(call(controller)).rejects.toBeInstanceOf(NotFoundException)

    for (const ecriture of ecritures) expect(ecriture).not.toHaveBeenCalled()
  })

  it('l’ABSORPTION vérifie aussi le compte CIBLE, pas seulement la source', async () => {
    // Le compte source est dans le périmètre, la cible non. Sans la seconde
    // vérification, un cloisonné rattacherait à SON dossier un dossier qu'il
    // n'a pas le droit d'ouvrir — et le verrait ensuite légitimement.
    const { controller, findOneForWorkspace, ecritures } = buildController({ scope: SCOPE_LYON })
    findOneForWorkspace.mockImplementation(async (id: string) =>
      id === 'acc-1' ? success({ id: 'acc-1' }) : failure({ code: 'not_found', message: 'Account not found' }),
    )

    await expect(controller.absorb('acc-1', { into: 'acc-2' } as never, USER)).rejects.toBeInstanceOf(NotFoundException)

    expect(findOneForWorkspace).toHaveBeenCalledWith('acc-2', 'w-1', SCOPE_LYON)
    for (const ecriture of ecritures) expect(ecriture).not.toHaveBeenCalled()
  })

  it('la SUPPRESSION refuse AVANT d’annuler l’analyse en cours', async () => {
    // `delete` annule l'analyse en vol avant de supprimer la ligne. Si la porte
    // venait après, un cloisonné couperait l'analyse d'une autre unité sans
    // jamais supprimer quoi que ce soit : une nuisance pleinement efficace.
    const { controller, ecritures } = buildController({ scope: SCOPE_LYON, found: false })

    await expect(controller.delete('acc-1', USER)).rejects.toBeInstanceOf(NotFoundException)

    for (const ecriture of ecritures) expect(ecriture).not.toHaveBeenCalled()
  })

  it('#2704.9 — la SUPPRESSION transmet le PÉRIMÈTRE à l’annulation de l’analyse en vol', async () => {
    // `assertAccountInScope` avait déjà validé le compte avec ce périmètre ;
    // `analysisService.cancel` le recevait pourtant nu (userId seul), donc
    // retombait sur le PROPRIÉTAIRE et ratait le run d'un coéquipier cloisonné
    // sur la même unité (#2704 — trou pré-existant relevé en marge du correctif
    // espace). Sans ce test, `cancel` pourrait redevenir muet sur le scope
    // sans qu'aucun rouge ne le dise : le cas « hors périmètre » ci-dessus ne
    // vérifie que le refus, jamais les arguments d'un appel qui réussit.
    const { controller, cancel } = buildController({ scope: SCOPE_LYON, found: true })

    await controller.delete('acc-1', USER)

    expect(cancel).toHaveBeenCalledWith('acc-1', 'u-1', { workspaceId: 'w-1', businessUnitScope: SCOPE_LYON })
  })
})

describe('GA-366 — TÉMOIN : un utilisateur NON cloisonné écrit comme avant', () => {
  it.each(ECRITURES)('%s passe sans une lecture de compte de plus', async (_name, call) => {
    // `'workspace'` est le niveau de TOUT LE MONDE à cette heure. La porte doit
    // s'effacer entièrement : une garde trop large casse le produit pour
    // l'immense majorité qui n'a jamais créé d'unité opérationnelle.
    const { controller, findOneForWorkspace, scopeFor } = buildController({ scope: null })

    await expect(call(controller)).resolves.toBeDefined()

    expect(scopeFor).toHaveBeenCalledWith('w-1', 'u-1')
    expect(findOneForWorkspace).not.toHaveBeenCalled()
  })

  it.each(ECRITURES)('%s sert normalement un compte DANS le périmètre', async (_name, call) => {
    const { controller, findOneForWorkspace } = buildController({ scope: SCOPE_LYON, found: true })

    await expect(call(controller)).resolves.toBeDefined()
    expect(findOneForWorkspace).toHaveBeenCalledWith('acc-1', 'w-1', SCOPE_LYON)
  })
})

describe('GA-366 — un cloisonnement qui se désactive tout seul n’est pas un cloisonnement', () => {
  it.each(ECRITURES)('%s LÈVE quand le service de périmètre manque', async (_name, call) => {
    const { controller, ecritures } = buildController({ wired: false })

    await expect(call(controller)).rejects.toBeInstanceOf(ServiceUnavailableException)

    for (const ecriture of ecritures) expect(ecriture).not.toHaveBeenCalled()
  })
})

describe('GA-366 — la garde LIT du code réel : le corpus n’est pas vide', () => {
  it('les sept écritures nommées par la revue sont toutes exercées', () => {
    expect(ECRITURES.length).toBe(7)
    const noms = ECRITURES.map(([nom]) => nom)
    expect(new Set(noms).size).toBe(noms.length)
  })
})
