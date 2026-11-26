import 'reflect-metadata'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { ConsultantsController } from './consultants.controller'

/**
 * Chaque ÉCRITURE du contrôleur du vivier déclare sa permission (PDF 3 §13.1).
 *
 * Le défaut que cette garde ferme : `WorkspacePermissionGuard` est fail-open,
 * donc une route sans `@RequirePermission` passe intacte. Ce contrôleur n'en
 * portait AUCUNE sur ses dix routes — le rôle `viewer`, documenté « strictly
 * read-only », créait, modifiait et **supprimait définitivement** un talent
 * (`remove` fait un vrai DELETE, pas un archivage). Exactement le défaut trouvé
 * sur `accounts.controller` au PDF 2, sur un objet où l'effacement est
 * irréversible et porte de la donnée personnelle.
 *
 * Une garde par NOM DE MÉTHODE plutôt qu'un `grep` sur le fichier : une méthode
 * ajoutée demain sans permission tombe ici.
 */
describe('ConsultantsController — les écritures déclarent leur permission', () => {
  const EXPECTED: Record<string, string> = {
    create: 'records:write',
    update: 'records:write',
    recordFeedback: 'records:write',
    // Réécrire un CV consomme un crédit et produit un livrable envoyé au
    // client — c'est une écriture, pas une lecture, même si rien ne change sur
    // la fiche du talent.
    rewriteCv: 'records:write',
    // #2570 — l'enrichissement débite un crédit et écrit des coordonnées : une
    // écriture, comme la réécriture de CV juste au-dessus.
    enrichTalent: 'records:write',
    // H-DECISIONS #4348 — retrouver un profil débite un crédit : une écriture.
    linkedinLookup: 'records:write',
    archive: 'records:write',
    reactivate: 'records:write',
    // L'historique des taux DIT ce qui s'est négocié : c'est une information
    // financière, même si le TJM cible, lui, est visible de tous.
    rateHistory: 'finance:read',
    parseCv: 'records:write',
    commitCvParse: 'records:write',
    generateCvVersion: 'records:write',
    // #2187.42 — modifier une version pas encore validée est une écriture,
    // comme la générer.
    updateCvVersion: 'records:write',
    // La règle d'anonymisation décide de ce qui SORT de l'entreprise : laisser
    // chacun la changer reviendrait à ne pas en avoir.
    writeAnonymisation: 'team:manage',
  }

  for (const [method, permission] of Object.entries(EXPECTED)) {
    it(`${method} exige ${permission}`, () => {
      const handler = (ConsultantsController.prototype as unknown as Record<string, () => unknown>)[method]
      expect(typeof handler).toBe('function')
      // La métadonnée porte une LISTE : plusieurs permissions peuvent ouvrir une
      // route, et l'UNE d'entre elles suffit.
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler as object)).toEqual([permission])
    })
  }

  it('ne garde PAS les lectures — un vivier se consulte, il ne s’ouvre pas au compte-gouttes', () => {
    const reads = [
      'list',
      'findOne',
      'match',
      'listFeedback',
      'brief',
      'getCvRewrite',
      'deletionPreview',
      'missions',
      'listCvVersions',
      'compareCvVersions',
      'readAnonymisation',
    ]
    for (const method of reads) {
      const handler = (ConsultantsController.prototype as unknown as Record<string, () => unknown>)[method]
      if (typeof handler !== 'function') continue
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler as object)).toBeUndefined()
    }
  })

  // #3781.2 (lot F31, puis K11 07/10) — `remove` (DELETE /consultants/:id) faisait
  // un vrai DELETE SQL, sans trace, hors de la seule voie d'effacement sanctionnée
  // (`POST /consultants/erase/bulk`, doctrine « on archive, on ne supprime pas » —
  // seule exception : l'effacement RGPD tracé). Le web ne l'appelait déjà plus
  // (`useDeleteConsultant` passe par `useEraseTalents` depuis `c8e66489`) et aucun
  // test ne l'exerçait : une route morte qui contournait la trace plutôt qu'un
  // système à construire. Retirée plutôt que redirigée, faute d'appelant à migrer.
  it('#3781.2 — ne porte plus de DELETE brut : l’effacement est la seule voie', () => {
    const handler = (ConsultantsController.prototype as unknown as Record<string, () => unknown>).remove
    expect(handler).toBeUndefined()
  })
})
