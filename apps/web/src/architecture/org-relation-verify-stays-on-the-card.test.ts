import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-103 — « VÉRIFIER CE LIEN » RESTE SUR LA CARTE DE LA PERSONNE, ET IL REJOINT
 * ENCORE LE VÉRIFICATEUR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUE CETTE GARDE PROTÈGE, ET D'OÙ ELLE VIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le §2 du PDF-22 ORGGRAPH FINAL (27/08/2026) déclare la vérification d'une
 * relation « Présent … à rendre visible dans le drawer », et son §13 la range
 * dans « ce qui n'est PAS un ticket neuf ». Les agents d'implémentation ne vont
 * donc pas la recoder — à condition qu'elle reste ATTEIGNABLE.
 *
 * Or le geste a déjà failli se perdre une fois. Jusqu'au 29/08 il vivait à
 * l'intérieur des « 4 vues », c'est-à-dire dans une section secondaire de la vue
 * SYSTÈME — laquelle n'est plus l'écran d'arrivée depuis que la vue focale est
 * le défaut. Il était à deux clics du seul endroit où on regarde vraiment un
 * rattachement : la carte d'une personne. Le sortir dans son propre composant et
 * le monter AUSSI dans la vue focale a été le correctif ; rien ne garantissait
 * qu'il y reste, et la vue focale est justement l'écran que ce chantier réécrit.
 *
 * Cette garde tient les deux portes ET la chaîne d'appel : bouton → hook →
 * client → route API → service IA. Le §2 affirmait l'EXISTENCE d'un vérificateur ;
 * il n'affirmait nulle part qu'un geste d'utilisateur l'atteignait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE PEUT PAS VÉRIFIER, ET POURQUOI ELLE NE FAIT PAS SEMBLANT
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ Elle prouve que le bouton est MONTÉ et que sa chaîne d'appel est entière.
 * Elle ne prouve PAS qu'il a un SUJET. Mesuré le 30/08 en exécutant l'assembleur
 * (`agent_docs/orggraph-inventaire-existant-2026-08-30.md`, décision D288) :
 * depuis le correctif P0, aucune `hierarchyEdge` de type `reports_to` non
 * vérifiée n'est plus produite par le pipeline, si bien que la condition de
 * rendu de la vue focale (`person.reporting && !person.reporting.verified`)
 * n'était jamais vraie sur un dossier réel. Une garde protège une règle, elle ne
 * l'invente pas : celle-ci tient le montage, qui est ce que le §2 met en jeu.
 *
 * ✅ **Ce trou-là est comblé depuis le 30/08 par GA-126**
 * (`org-relation-verify-has-a-subject.test.ts`, décisions D360-D365) : elle part
 * de la sortie réelle de l'assembleur, compte les cartes qui portent un
 * rattachement à vérifier, et rend l'écran d'arrivée pour vérifier que le bouton
 * s'y affiche. Les deux gardes sont complémentaires et ne se remplacent pas —
 * l'une tient les DEUX PORTES et la chaîne d'appel, l'autre tient le SUJET.
 *
 * ⚠️ Les COMMENTAIRES sont retirés avant lecture — `OrgGraphViews.tsx` cite
 * `OrgVerifyRelation` dans un commentaire JSX, et ce fichier-ci le cite vingt
 * fois. Compter une citation, c'est compter un bouton qui n'existe pas.
 */

const WEB_SRC = join(__dirname, '..')
const API_SRC = join(WEB_SRC, '..', '..', 'api', 'src')
const IA_APP = join(WEB_SRC, '..', '..', 'ia', 'app')

const ORG_DIR = join(WEB_SRC, 'features', 'accounts', 'view', 'account-detail', 'tabs', 'organigramme')
const BUTTON = join(ORG_DIR, 'OrgVerifyRelation.tsx')
const FOCAL = join(ORG_DIR, 'FocalOrgView.tsx')
const VIEWS = join(ORG_DIR, 'OrgGraphViews.tsx')
const HOOK = join(WEB_SRC, 'features', 'accounts', 'hooks', 'useEnrichAccount.ts')
const CLIENT = join(WEB_SRC, 'features', 'accounts', 'api.ts')
const CONTROLLER = join(API_SRC, 'modules', 'analysis', 'analysis.controller.ts')
const IA_ROUTER = join(IA_APP, 'routers', 'org_verify.py')
const IA_SERVICE = join(IA_APP, 'services', 'relation_verifier.py')

/** ⚠️ Un commentaire cite ; il ne monte pas un bouton. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function code(file: string): string {
  return stripComments(readFileSync(file, 'utf8'))
}

/** `<OrgVerifyRelation` suivi d'un séparateur : `<OrgVerifyRelationX` ne compte
 *  pas. L'homonyme accepté par un `.includes()` est un défaut déjà payé ici. */
const MOUNT = /<OrgVerifyRelation[\s/>]/g

function mounts(file: string): number {
  // ⚠️ `RegExp.test()` avec le drapeau `g` est STATEFUL. On passe par `match`.
  return (code(file).match(MOUNT) ?? []).length
}

describe('GA-103 — « vérifier ce lien » reste sur la carte de la personne', () => {
  it('LIT quelque chose — les huit fichiers de la chaîne existent et ne sont pas vides', () => {
    // Sans cette assertion, un chemin faux rendrait la garde verte sur zéro
    // octet : le faux zéro silencieux, la cause racine la plus chère du dépôt.
    for (const file of [BUTTON, FOCAL, VIEWS, HOOK, CLIENT, CONTROLLER, IA_ROUTER, IA_SERVICE]) {
      expect(existsSync(file), `fichier introuvable : ${file}`).toBe(true)
      expect(readFileSync(file, 'utf8').length).toBeGreaterThan(400)
    }
  })

  it('la vue FOCALE le monte — l’écran d’arrivée, sur la carte de la personne', () => {
    expect(mounts(FOCAL)).toBeGreaterThan(0)
  })

  it('les « 4 vues » le montent aussi — la seconde porte n’est pas perdue', () => {
    expect(mounts(VIEWS)).toBeGreaterThan(0)
  })

  /**
   * Le geste vit à UN seul endroit (loi 1 du tome 7, GA-26) : l'annonce de coût
   * est écrite une fois. Deux boutons qui recopieraient la fourchette
   * divergeraient au premier changement de poids — et une annonce de prix fausse
   * est pire que pas d'annonce. Le composant est donc le SEUL à porter le clic.
   */
  it('un seul composant porte le clic, et il n’annonce plus de coût (#4463)', () => {
    expect(code(BUTTON)).not.toMatch(/creditCostRange\(/)
    // Les deux écrans montent le composant ; ils n'appellent pas la mutation
    // eux-mêmes, sinon l'annonce de coût aurait deux versions.
    expect(code(FOCAL)).not.toMatch(/useVerifyOrgRelation\s*\(/)
    expect(code(VIEWS)).not.toMatch(/useVerifyOrgRelation\s*\(/)
  })

  /**
   * Monté ne suffit pas. La chaîne est vérifiée maillon par maillon jusqu'au
   * service qui cherche réellement la preuve — c'est exactement ce qu'une
   * lecture statique de l'existence d'un fichier ne dit pas.
   */
  it('et il rejoint encore le VÉRIFICATEUR — bouton → hook → client → API → service IA', () => {
    expect(code(BUTTON)).toMatch(/useVerifyOrgRelation\s*\(/)
    expect(code(HOOK)).toMatch(/accountsApi\.verifyOrgRelation\s*\(/)
    expect(code(CLIENT)).toContain('/verify-relation')
    expect(code(CONTROLLER)).toMatch(/@Post\(\s*['"]:accountId\/verify-relation['"]\s*\)/)
    // Côté IA : la route existe ET elle appelle le vérificateur déterministe.
    const router = readFileSync(IA_ROUTER, 'utf8')
    expect(router).toContain('@router.post("/verify-relation")')
    expect(router).toMatch(/from app\.services\.relation_verifier import/)
    expect(router).toMatch(/verdict_from_hits\s*\(/)
  })

  /**
   * Et le VERDICT est écrit, pas seulement calculé. Un vérificateur dont le
   * résultat est ignoré est du code mort déguisé en code vivant — le motif
   * « colonne lue jamais écrite », retourné.
   */
  it('le verdict est APPLIQUÉ au graphe stocké, avec bump de version', () => {
    const service = join(API_SRC, 'modules', 'analysis', 'analysis-ondemand.service.ts')
    const writer = join(API_SRC, 'modules', 'org-graph', 'org-graph.service.ts')
    for (const file of [service, writer]) {
      expect(existsSync(file), `fichier introuvable : ${file}`).toBe(true)
    }
    expect(code(service)).toMatch(/applyRelationVerification\s*\(/)
    expect(code(writer)).toMatch(/async applyRelationVerification\s*\(/)
    expect(code(writer)).toMatch(/org_graph_version\s*=\s*\$2/)
  })
})
