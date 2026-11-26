import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #1941.15 / #1934.19 — LAURA PASSE PAR LA MÊME PORTE QUE LES ÉCRANS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LES DEUX POINTS DEMANDENT, ET POURQUOI C'EST LA MÊME GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Jamais contourner l'interface » (#1941.15) et « aucune lecture / écriture
 * hors permissions » (#1934.19) disent la même chose d'un côté différent : ce
 * que Laura lit ou prépare pour quelqu'un est BORNÉ par ce que ce quelqu'un
 * pourrait faire lui-même dans le produit. Un copilote qui répondrait « voilà les
 * salaires de l'équipe » à un siège `viewer` n'aurait pas besoin d'écrire une
 * ligne pour être une fuite : il aurait suffi qu'il LISE à côté de la porte.
 *
 * Les deux étaient « NON PROUVÉ » au registre, et ils l'étaient à raison : le
 * montage existait (`@UseGuards(JwtGuard, PlanFeatureGuard,
 * WorkspacePermissionGuard)` posé le 29/08/2026 après qu'un `viewer` eut
 * supprimé un fil), mais RIEN n'empêchait qu'on le défasse. Un décorateur retiré
 * ne casse aucun test : il ouvre une porte, en silence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT, ET CE QU'ELLE REFUSE
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle lit le SOURCE du contrôleur, commentaires RETIRÉS. C'est décisif : ce
 * fichier PARLE de ses guards dans ses commentaires, et une garde qui cherche
 * `WorkspacePermissionGuard` dans le texte brut resterait verte sur un fichier
 * dont le décorateur a été effacé mais dont le commentaire reste. C'est
 * exactement le défaut « compter un motif sans retirer les commentaires », payé
 * deux fois la même nuit dans ce dépôt.
 *
 * Elle refuse trois choses : la classe sans ses trois guards, une route qui
 * REMPLACE le montage de classe par le sien, et une route marquée publique.
 */

const CONTROLLER = join(__dirname, 'ia-proxy.controller.ts')

/** Les commentaires, retirés — chaînes préservées (voir l'en-tête). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\n'"`]*?\/\/[^\n]*/gm, match => {
    const index = match.indexOf('//')
    return match.slice(0, index)
  })
}

describe('#1941.15 / #1934.19 — Laura passe par la même porte que les écrans', () => {
  const raw = readFileSync(CONTROLLER, 'utf8')
  const code = stripComments(raw)

  it('LIT quelque chose : le contrôleur du copilote, et ses routes', () => {
    expect(raw.length).toBeGreaterThan(20_000)
    // Le corpus gardé : toutes les routes du copilote, pas un échantillon.
    const routes = raw.match(/@(Get|Post|Patch|Delete)\(/g) ?? []
    expect(routes.length).toBeGreaterThanOrEqual(20)
    expect(code).toContain('export class IaProxyController')
  })

  it('les commentaires sont bien RETIRÉS — sinon la garde lirait sa propre documentation', () => {
    // Cette phrase existe en COMMENTAIRE dans le contrôleur, et nulle part ailleurs.
    expect(raw).toContain('Le guard de features ne ferme QUE les routes annotées')
    expect(code).not.toContain('Le guard de features ne ferme QUE les routes annotées')
  })

  it('les trois guards sont montés sur la CLASSE — donc sur toutes ses routes', () => {
    const mounted = code.match(/@UseGuards\(([^)]*)\)/g) ?? []
    expect(mounted.length).toBeGreaterThan(0)
    const classGuards = mounted[0] ?? ''
    for (const guard of ['JwtGuard', 'PlanFeatureGuard', 'WorkspacePermissionGuard']) {
      expect(classGuards).toContain(guard)
    }
  })

  it('sait dire NON : aucune route ne remonte son propre `@UseGuards`, aucune n’est publique', () => {
    // Un second `@UseGuards` dans ce fichier serait un montage de MÉTHODE, et un
    // montage de méthode REMPLACE celui de la classe chez Nest — la route
    // sortirait de la porte sans qu'aucun test ne bouge.
    const mounted = code.match(/@UseGuards\(/g) ?? []
    expect(mounted).toHaveLength(1)
    // `@Public()` / `@SkipAuth()` : les deux façons connues d'ouvrir une route
    // dans ce dépôt. Aucune n'a sa place sur le copilote.
    expect(code).not.toMatch(/@Public\(/)
    expect(code).not.toMatch(/@SkipAuth\(/)
  })

  it('n’attrape pas ce qu’elle ne vise pas : le fichier PARLE de ses guards sans que ça compte', () => {
    // Le texte brut mentionne `WorkspacePermissionGuard` plus d'une fois (import,
    // décorateur, commentaires) ; la garde, elle, ne compte que les MONTAGES.
    const raws = raw.match(/WorkspacePermissionGuard/g) ?? []
    expect(raws.length).toBeGreaterThan(1)
    expect((code.match(/@UseGuards\(/g) ?? []).length).toBe(1)
  })
})
