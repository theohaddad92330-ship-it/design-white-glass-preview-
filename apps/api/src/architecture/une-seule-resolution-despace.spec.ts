import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GARDE — l'espace actif se résout PARTOUT de la même façon, et l'étape du
 * choix n'est jamais sautée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'INCIDENT DU 07/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Un client : « mon associé a déjà rempli la fiche de notre ESN, mais mon
 * onboarding me repose toutes les questions ». Onze des douze questions du
 * premier temps sont des faits sur l'ESN, pas sur la personne — et le partage
 * existait déjà, écrit, testé, et JUSTE (`mergeWorkspaceAnswers`,
 * `is_workspace_canonical`).
 *
 * Il était simplement pointé sur le mauvais espace. QUATRE implémentations de la
 * même résolution coexistaient ; deux honoraient `workspace_active_selections`,
 * deux la sautaient et allaient « possédé d'abord ». Or le déclencheur de
 * création de compte donne à CHAQUE inscrit son propre espace en `owner` : un
 * associé qui rejoint l'ESN d'un collègue en possède donc toujours un, vide, et
 * les deux implémentations fautives y retombaient systématiquement.
 *
 * Le docstring de `workspace_scope.py` — dans le service qui portait l'une des
 * deux copies fautives — décrivait déjà le défaut, mot pour mot : « quelqu'un
 * qui appartient à son espace personnel ET à celui de son ESN a DEUX réponses
 * valides, et seul le sélecteur dit laquelle est la bonne ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────────
 * Tout fichier qui résout un espace à partir d'un `user_id` — reconnu à ce
 * qu'il lit `owner_user_id` — doit AUSSI consulter le choix de l'utilisateur.
 * C'est une garde de source, donc grossière ; elle ne prouve pas que l'ordre
 * est bon. C'est le rôle des tests de comportement, qui existent des deux côtés
 * et qui, eux, ont été vérifiés en cassant volontairement le code.
 *
 * Ce qu'elle attrape, et que rien d'autre n'attrapait : la CINQUIÈME copie.
 */

const RACINE_API = join(__dirname, '..')
const RACINE_IA = join(__dirname, '..', '..', '..', 'ia', 'app')

/** La table qui porte le choix, dans les deux langages. */
const TABLE_DU_CHOIX =
  /workspace_active_selections|WorkspaceActiveSelectionEntity|this\.selections|_WORKSPACE_SELECTIONS_TABLE/

/** Ce qui trahit une résolution d'espace à partir d'un utilisateur. */
const RESOUT_UN_ESPACE = /owner_user_id/

/** Les commentaires d'abord : une garde attrapée par sa propre justification est borgne. */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/"""[\s\S]*?"""/g, '')
    .replace(/^\s*#.*$/gm, '')
}

/**
 * ⚠️ EXCEPTIONS NOMMÉES, avec leur raison.
 *
 * `owner_user_id` apparaît légitimement partout où l'on CRÉE un espace, où l'on
 * vérifie une propriété, ou dans une migration — ce ne sont pas des résolutions.
 */
const EXCEPTIONS = new Map<string, string>([
  [
    'modules/workspace/workspace-context.service.ts',
    'C’est la RÉFÉRENCE : celle dont les autres se disent le miroir. Elle lit le choix en première étape, et c’est elle qu’il faut copier.',
  ],
])

/** Les deux chemins qui portent une résolution, listés à la main et VÉRIFIÉS. */
const RESOLVEURS: ReadonlyArray<{ chemin: string; racine: string; quoi: string }> = [
  {
    chemin: 'modules/workspace/workspace-context.service.ts',
    racine: RACINE_API,
    quoi: 'la référence (API)',
  },
  {
    chemin: 'modules/esn-profile/esn-profile-workspace.resolver.ts',
    racine: RACINE_API,
    quoi: 'le miroir qui sautait l’étape (API) — corrigé le 07/09/2026',
  },
  {
    chemin: 'services/workspace_scope.py',
    racine: RACINE_IA,
    quoi: 'la référence (IA)',
  },
  {
    chemin: 'services/seller_context.py',
    racine: RACINE_IA,
    quoi: 'la copie qui sautait l’étape (IA) — délègue désormais à workspace_scope',
  },
]

function lire(racine: string, chemin: string): string {
  return readFileSync(join(racine, chemin), 'utf8')
}

describe('GA — une seule résolution d’espace, et elle lit le CHOIX', () => {
  it('LIT quelque chose — les quatre fichiers existent et sont non vides', () => {
    for (const { chemin, racine, quoi } of RESOLVEURS) {
      const source = lire(racine, chemin)
      // Le nom du fautif voyage dans un objet plutôt qu'en second argument :
      // `expect` de jest n'en accepte qu'un (contrairement à vitest).
      expect({ chemin, quoi, taille: source.length > 500 }).toMatchObject({ taille: true })
    }
  })

  it('les deux RÉFÉRENCES lisent bien la table du choix — le contrôle positif', () => {
    // Sans cette ligne, une expression cassée rendrait « personne ne la lit »,
    // donc « aucun coupable », donc une garde verte qui n'a rien comparé.
    for (const chemin of ['modules/workspace/workspace-context.service.ts']) {
      expect(TABLE_DU_CHOIX.test(sansCommentaires(lire(RACINE_API, chemin)))).toBe(true)
    }
    expect(TABLE_DU_CHOIX.test(sansCommentaires(lire(RACINE_IA, 'services/workspace_scope.py')))).toBe(true)
  })

  it('SAIT DIRE NON — une résolution qui saute le choix est refusée', () => {
    const fautif = `
      const owned = await this.workspaces.findOne({ where: { owner_user_id: userId } })
      if (owned) return { workspaceId: owned.id, role: 'owner' }
    `
    expect(RESOUT_UN_ESPACE.test(fautif) && !TABLE_DU_CHOIX.test(sansCommentaires(fautif))).toBe(true)

    const correct = `
      const selection = await this.selections.findOne({ where: { user_id: userId } })
      const owned = await this.workspaces.findOne({ where: { owner_user_id: userId } })
    `
    expect(TABLE_DU_CHOIX.test(sansCommentaires(correct))).toBe(true)
  })

  it('n’attrape pas ce qu’elle ne vise pas — sa propre justification en commentaire', () => {
    expect(TABLE_DU_CHOIX.test(sansCommentaires(`// il faut lire workspace_active_selections`))).toBe(false)
    expect(TABLE_DU_CHOIX.test(sansCommentaires(`"""lire workspace_active_selections d'abord"""`))).toBe(false)
    // Un fichier qui ne résout rien n'est pas concerné, même s'il nomme la colonne.
    expect(RESOUT_UN_ESPACE.test(`const x = 1`)).toBe(false)
  })

  it('AUCUN résolveur ne saute l’étape du choix', () => {
    const coupables: string[] = []
    for (const { chemin, racine, quoi } of RESOLVEURS) {
      if (EXCEPTIONS.has(chemin)) continue
      const propre = sansCommentaires(lire(racine, chemin))
      if (!RESOUT_UN_ESPACE.test(propre)) continue // ne résout plus rien : il délègue
      if (!TABLE_DU_CHOIX.test(propre)) coupables.push(`${chemin} — ${quoi}`)
    }

    // ⚠️ Si cette liste cesse d'être vide : la résolution vit dans
    // `WorkspaceContextService.resolveActiveWorkspace` (API) et
    // `workspace_scope.resolve_workspace_id` (IA). DÉLÉGUER, ne pas recopier.
    expect(coupables).toEqual([])
  })

  it('les exceptions sont NOMMÉES et existent encore — une exception périmée est un trou', () => {
    for (const [chemin, raison] of EXCEPTIONS) {
      expect(() => lire(RACINE_API, chemin)).not.toThrow()
      expect(raison.length).toBeGreaterThan(40)
    }
  })
})
