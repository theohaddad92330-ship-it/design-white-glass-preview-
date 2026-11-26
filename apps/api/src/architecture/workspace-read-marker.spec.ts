import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WORKSPACE_READ_KEY } from '../common/decorator/workspace-read.decorator'
import { REQUIRE_PERMISSION_KEY } from '../modules/workspace/require-permission.decorator'
import { AccountsController } from '../modules/accounts/accounts.controller'
import { DeliveryController } from '../modules/delivery/delivery.controller'
import { FactoringController } from '../modules/factoring/factoring.controller'
import { OutgoingPaymentsController } from '../modules/payments/outgoing-payments.controller'
import { PilotageController } from '../modules/pilotage/pilotage.controller'
import { ProposalsController } from '../modules/proposals/proposals.controller'

/**
 * D39 (28/08/2026) — le marqueur est-il RÉELLEMENT posé, ou seulement écrit ?
 *
 * `endpoint-guards.spec.ts` lit le TEXTE des contrôleurs : c'est ce qu'il faut
 * pour compter 361 routes sans instancier NestJS, mais un `grep` ne distingue
 * pas un décorateur appliqué d'un décorateur commenté, importé sans être posé,
 * ou posé sur le mauvais membre. Le dépôt a déjà payé cette confusion (« un
 * renommage i18n sur la mauvaise clé » : clé morte, écran inchangé, garde
 * verte).
 *
 * Cette garde lit la MÉTADONNÉE, par nom de méthode. Une méthode renommée ou un
 * décorateur perdu tombe ici, là où un `grep` sur le fichier ne verrait rien.
 */

type Handlers = Record<string, (...args: never[]) => unknown>

function handlerOf(prototype: object, method: string): object {
  const handler = (prototype as unknown as Handlers)[method]
  expect(typeof handler).toBe('function')
  return handler as unknown as object
}

describe('@WorkspaceRead — les routes marquées le sont vraiment', () => {
  /**
   * Les six lectures d'agrégats d'espace du portefeuille.
   *
   * `hygiene` est celle que la mesure a nommée (le cliquet GA-05 a rougi à son
   * arrivée) ; les cinq autres sont ses voisines littérales, dans le même cas au
   * caractère près : un `SELECT … WHERE workspace_id = :workspaceId`, aucune
   * écriture, et aucune permission de lecture à leur donner.
   */
  const ACCOUNTS_READS = [
    'listSectors',
    'listCompanies',
    'hygiene',
    'listSimilarCompaniesToExplore',
    'listSignals',
    'listNeeds',
  ]

  it('le corpus n’est pas vide — la garde échouerait au vert sur une liste vide', () => {
    expect(ACCOUNTS_READS.length).toBe(6)
  })

  for (const method of ACCOUNTS_READS) {
    it(`AccountsController.${method} porte le marqueur de lecture d’espace`, () => {
      expect(Reflect.getMetadata(WORKSPACE_READ_KEY, handlerOf(AccountsController.prototype, method))).toBe(true)
    })

    it(`AccountsController.${method} n’exige AUCUNE permission — la matrice n’en a pas pour une lecture`, () => {
      expect(
        Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handlerOf(AccountsController.prototype, method)),
      ).toBeUndefined()
    })
  }

  /**
   * Les agrégats de propagation du back-office (PDF 2 §4).
   *
   * Une lecture d'espace au sens strict : un `GROUP BY` sur les missions de
   * l'espace, aucune écriture, aucun crédit dépensé, et AUCUN montant gardé —
   * le tarif vendu moyen est un prix de VENTE, visible par design. Les deux
   * agrégats qui portent un montant gardé (CA cumulé, marge moyenne) vivent sur
   * `FinanceController`, sous `finance:read` : une lecture financière ne porte
   * pas ce marqueur, et c'est la troisième question du décorateur.
   */
  /**
   * Le bandeau du portefeuille (31/08/2026). Même nature que `propagationDigest`
   * — un dénombrement d'espace, sans montant — et donc le même marqueur.
   */
  it('DeliveryController.staffingHeadline porte le marqueur de lecture d’espace', () => {
    expect(Reflect.getMetadata(WORKSPACE_READ_KEY, handlerOf(DeliveryController.prototype, 'staffingHeadline'))).toBe(
      true,
    )
  })

  it('DeliveryController.staffingHeadline n’exige AUCUNE permission — trois dénombrements ne sont pas une écriture', () => {
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handlerOf(DeliveryController.prototype, 'staffingHeadline')),
    ).toBeUndefined()
  })

  it('DeliveryController.propagationDigest porte le marqueur de lecture d’espace', () => {
    expect(Reflect.getMetadata(WORKSPACE_READ_KEY, handlerOf(DeliveryController.prototype, 'propagationDigest'))).toBe(
      true,
    )
  })

  /**
   * L'onglet Missions d'un dossier de compte (PDF 4 §3.3, BEL-BO-006).
   *
   * Elle porte un champ financier — la marge — et reste pourtant une lecture
   * d'espace : c'est le CHAMP qui se garde (`redactFinance` le met à `null`,
   * D45), pas la porte. Exactement la raison écrite sur `GET /delivery/missions`.
   */
  it('DeliveryController.accountMissions porte le marqueur de lecture d’espace', () => {
    expect(Reflect.getMetadata(WORKSPACE_READ_KEY, handlerOf(DeliveryController.prototype, 'accountMissions'))).toBe(
      true,
    )
  })

  it('DeliveryController.accountMissions n’exige AUCUNE permission — la marge se rédige, la porte reste ouverte', () => {
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handlerOf(DeliveryController.prototype, 'accountMissions')),
    ).toBeUndefined()
  })

  it('DeliveryController.propagationDigest n’exige AUCUNE permission — c’est une lecture', () => {
    // `records:write` fermerait la porte à `viewer` et `finance`, sur des
    // chiffres que le produit leur montre déjà ailleurs. C'est exactement le
    // faux pas que le studio de proposition avait fait avec `data:export`.
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handlerOf(DeliveryController.prototype, 'propagationDigest')),
    ).toBeUndefined()
  })

  /**
   * Les paiements SORTANTS (31/08/2026) — la régression 97ab491d9 nommée dans
   * le docblock du contrôleur : `@RequirePermission('finance:read')` avait été
   * posé au lieu de `@WorkspaceRead`, fermant sec une liste que le champ
   * financier (`payableAmountCents`…) suffit à garder (D45).
   */
  it('OutgoingPaymentsController.list porte le marqueur de lecture d’espace', () => {
    expect(Reflect.getMetadata(WORKSPACE_READ_KEY, handlerOf(OutgoingPaymentsController.prototype, 'list'))).toBe(true)
  })

  it('OutgoingPaymentsController.list n’exige AUCUNE permission — les montants se rédigent, la porte reste ouverte', () => {
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handlerOf(OutgoingPaymentsController.prototype, 'list')),
    ).toBeUndefined()
  })

  it('OutgoingPaymentsController.exportCsv, lui, EXIGE toujours `finance:read` — l’export ne se rédige pas', () => {
    // Un CSV téléchargé n'existe QUE pour les montants ; le refuser dit la
    // vérité, là où la LISTE se contente de les rédiger.
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handlerOf(OutgoingPaymentsController.prototype, 'exportCsv')),
    ).toEqual(['finance:read'])
  })

  /**
   * La cession de créance (31/08/2026) — le revirement daté dans le docblock
   * de `FactoringController` : la route fermait sec sur `finance:read`
   * (« une cession EST un montant »), fermant du même coup la vue « nombres
   * seulement » que ce lot ouvre.
   */
  it('FactoringController.view porte le marqueur de lecture d’espace', () => {
    expect(Reflect.getMetadata(WORKSPACE_READ_KEY, handlerOf(FactoringController.prototype, 'view'))).toBe(true)
  })

  it('FactoringController.view n’exige AUCUNE permission — les montants par cession se rédigent', () => {
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handlerOf(FactoringController.prototype, 'view')),
    ).toBeUndefined()
  })

  it('les ÉCRITURES de la cession exigent toujours `finance:write` — le revirement ne touche QUE la lecture', () => {
    for (const method of ['createContract', 'prepare', 'markAssigned', 'markSettled', 'close', 'recordSettlement']) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handlerOf(FactoringController.prototype, method))).toEqual([
        'finance:write',
      ])
    }
  })

  it('le marqueur n’est PAS posé sur le contrôleur Missions entier — il y a douze écritures dessous', () => {
    // La preuve vivante que `@WorkspaceRead` qualifie une ROUTE : `create` et
    // `moveCard` écrivent, et gardent leur `records:write`.
    expect(Reflect.getMetadata(WORKSPACE_READ_KEY, DeliveryController)).toBeUndefined()
    for (const method of ['create', 'moveCard', 'submitTimesheet']) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handlerOf(DeliveryController.prototype, method))).toEqual([
        'records:write',
      ])
    }
  })

  it('le marqueur est posé sur le CONTRÔLEUR du studio de proposition — ses deux routes sont des lectures', () => {
    expect(Reflect.getMetadata(WORKSPACE_READ_KEY, ProposalsController)).toBe(true)
  })

  it('le studio n’exige plus `data:export` — la permission fermait la porte à `viewer` et `tech_admin`', () => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, ProposalsController)).toBeUndefined()
    for (const method of ['list', 'get']) {
      expect(
        Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handlerOf(ProposalsController.prototype, method)),
      ).toBeUndefined()
    }
  })

  /**
   * Le tableau de bord Finance (31/08/2026) — deux lectures et une écriture, sur
   * le MÊME contrôleur.
   *
   * C'est le cas le plus utile à garder ici, parce qu'il est le plus facile à
   * rater : `endpoint-guards.spec.ts` lirait « ce fichier contient
   * `@WorkspaceRead` » et « ce fichier contient `@RequirePermission` » sans
   * jamais vérifier lequel est posé sur QUELLE route. Une inversion des deux —
   * la saisie ouverte à tous, la lecture fermée à `viewer` — passerait au vert.
   */
  it('PilotageController : les deux lectures portent le marqueur, la SAISIE porte `finance:write`', () => {
    expect(Reflect.getMetadata(WORKSPACE_READ_KEY, handlerOf(PilotageController.prototype, 'metricSeries'))).toBe(true)
    expect(Reflect.getMetadata(WORKSPACE_READ_KEY, handlerOf(PilotageController.prototype, 'financeTarget'))).toBe(true)
    // L'écriture n'est PAS une lecture d'espace, et ne porte pas le marqueur.
    expect(
      Reflect.getMetadata(WORKSPACE_READ_KEY, handlerOf(PilotageController.prototype, 'setFinanceTarget')),
    ).toBeUndefined()
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handlerOf(PilotageController.prototype, 'setFinanceTarget')),
    ).toEqual(['finance:write'])
    // …et les lectures n'exigent aucune permission : la matrice n'en a pas pour
    // un historique de dénombrements que `/pilotage` affiche déjà nus.
    for (const method of ['metricSeries', 'financeTarget']) {
      expect(
        Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handlerOf(PilotageController.prototype, method)),
      ).toBeUndefined()
    }
  })

  /**
   * ⚠️ Le point le plus important du chantier, en un test : le marqueur
   * n'OUVRE rien.
   *
   * Il pose une métadonnée que personne ne lit à l'exécution — aucun guard, aucun
   * intercepteur. Ce qui protège les routes marquées reste exactement ce qui les
   * protégeait avant : `JwtGuard` (l'identité) et la résolution d'espace
   * server-side (`resolveActiveWorkspace`), qui rend un `workspaceId` que
   * l'appelant ne choisit pas. Le jour où quelqu'un branche `WORKSPACE_READ_KEY`
   * sur un guard qui laisse passer, ce test tombe.
   */
  it('le marqueur n’est lu par AUCUN guard — il déclare, il n’autorise pas', () => {
    const guards = [
      join(__dirname, '..', 'modules', 'workspace', 'workspace-permission.guard.ts'),
      join(__dirname, '..', 'modules', 'auth', 'jwt.guard.ts'),
    ]
    const sources = guards.map(file => readFileSync(file, 'utf8'))
    // La garde LIT : deux fichiers, non vides.
    expect(sources).toHaveLength(2)
    for (const source of sources) expect(source.length).toBeGreaterThan(200)
    for (const source of sources) expect(source).not.toContain('WORKSPACE_READ_KEY')
  })
})
