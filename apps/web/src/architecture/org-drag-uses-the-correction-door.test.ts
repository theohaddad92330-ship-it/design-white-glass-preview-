import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-236 — déplacer une carte d'organigramme passe par LA porte, pas une seconde.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, ET LA DÉCISION QU'ELLE TIENT
 * ─────────────────────────────────────────────────────────────────────────
 * Le glisser-déposer avait été REFUSÉ le 27/08/2026 (décision 7 du paquet
 * OrgGraph) : « le drag & drop est séduisant visuellement mais trop destructeur
 * pour une donnée sourcée ». La raison n'était pas esthétique — un déplacement à
 * la souris ne porte NI raison NI preuve, et l'API n'a aucune route qui
 * accepterait l'un sans les deux.
 *
 * **Louis a levé ce refus le 31/08/2026**, à une condition qui EST cette garde :
 * le dépôt ne devient pas une seconde façon d'écrire. Il PROPOSE un `reportsTo`
 * et ouvre le tiroir de correction, qui réclame la raison et la preuve avant
 * d'appeler `PATCH /accounts/:id/org-graph/corrections`.
 *
 * Le jour où quelqu'un « simplifiera » en appelant `apiFetch` depuis le mode
 * Édition, deux chemins écriront le même champ — l'un avec ses preuves, l'autre
 * sans. C'est exactement ce que GA-26 interdit, et le mode Édition est
 * l'endroit du dépôt où ça arrivera.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT — ET COMMENT ELLE SAIT DIRE NON
 * ─────────────────────────────────────────────────────────────────────────
 * Elle lit `OrgEditView.tsx`, commentaires et imports RETIRÉS (un symbole cité
 * dans un docblock n'est pas un appel — c'est la confusion qui rendrait cette
 * garde inutile, et ce dépôt en a payé sept en trois jours).
 *
 * Elle vérifie quatre choses :
 *   1. le mode Édition MONTE le tiroir de correction, avec le compte et le graphe ;
 *   2. il n'appelle NI `apiFetch`, NI aucun hook d'écriture, NI aucune route
 *      `/org-graph/` — il n'a pas de chemin d'écriture à lui ;
 *   3. le dépôt et le chemin CLAVIER appellent la même fonction : un geste, deux
 *      façons de le déclencher, jamais deux implémentations ;
 *   4. la cible du dépôt est un `<Button type="button">` — un `div` porteur d'un
 *      `onDrop` ne se tabule pas, et la fonctionnalité n'existerait pas pour qui
 *      n'a pas de souris.
 *
 * ⚠️ Aucun `RegExp` avec le drapeau `g` n'est réutilisé : `.test()` est alors
 * STATEFUL et rend un résultat sur deux. Défaut déjà payé dans ce dossier.
 */

const WEB = join(__dirname, '..')
const ORG = join(WEB, 'features', 'accounts', 'view', 'account-detail', 'tabs', 'organigramme')
const EDIT_FILE = join(ORG, 'OrgEditView.tsx')
const DRAWER_FILE = join(ORG, 'corrections', 'OrgCorrectionDrawer.tsx')

/** Le source SANS ses commentaires ni ses lignes d'import. */
function executable(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const withoutLines = withoutBlocks.replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  return withoutLines
    .split('\n')
    .filter(line => !/^\s*import\s/.test(line) && !/^\s*}\s*from\s/.test(line))
    .join('\n')
}

/** Le symbole est-il APPELÉ (ou monté en JSX), et pas seulement nommé ? */
function isCalled(source: string, symbol: string): boolean {
  const body = executable(source)
  return new RegExp(`${symbol}\\s*(<[^()]*>)?\\s*\\(`).test(body) || new RegExp(`<${symbol}[\\s/>]`).test(body)
}

const edit = existsSync(EDIT_FILE) ? readFileSync(EDIT_FILE, 'utf8') : ''
const drawer = existsSync(DRAWER_FILE) ? readFileSync(DRAWER_FILE, 'utf8') : ''

describe('GA-236 — le corpus n’est pas vide', () => {
  it('le mode Édition et le tiroir existent, et portent du code', () => {
    expect(existsSync(EDIT_FILE), EDIT_FILE).toBe(true)
    expect(existsSync(DRAWER_FILE), DRAWER_FILE).toBe(true)
    expect(executable(edit).length).toBeGreaterThan(1000)
    expect(executable(drawer).length).toBeGreaterThan(1000)
  })

  it('le mode Édition porte bien un glisser-déposer — sinon la garde ne garde rien', () => {
    const body = executable(edit)
    expect(body).toContain('onDrop')
    expect(body).toContain('onDragStart')
    expect(body).toContain('draggable')
  })
})

describe('GA-236 — le dépôt passe par la porte de correction', () => {
  it('1. le mode Édition MONTE le tiroir, avec le compte ET le graphe', () => {
    expect(isCalled(edit, 'OrgCorrectionDrawer')).toBe(true)
    const mount = edit.slice(edit.indexOf('<OrgCorrectionDrawer'))
    expect(mount).toContain('accountId={accountId}')
    expect(mount).toContain('graph={graph}')
  })

  it('2. il n’a AUCUN chemin d’écriture à lui', () => {
    const body = executable(edit)
    expect(body, 'le mode Édition appelle directement le réseau').not.toContain('apiFetch')
    expect(body, 'le mode Édition connaît une route du ledger').not.toContain('/org-graph/')
    // Le hook d'écriture n'est pas non plus appelé ici : c'est le tiroir qui
    // écrit, et lui seul — sinon la raison et la preuve deviennent optionnelles.
    expect(isCalled(edit, 'useCorrectOrgPerson')).toBe(false)
    expect(isCalled(edit, 'buildPersonCorrection')).toBe(false)
  })

  it('3. le dépôt SOURIS et le chemin CLAVIER appellent la même fonction', () => {
    const body = executable(edit)
    // Une seule définition de la fonction de dépôt…
    expect(body.match(/const dropOn\s*=/g) ?? []).toHaveLength(1)
    // …appelée depuis le `onDrop` de la carte ET depuis un bouton.
    expect(body).toMatch(/onDrop:\s*\(\)\s*=>\s*dropOn\(/)
    expect(body).toMatch(/onClick=\{\(\)\s*=>\s*dropOn\(/)
  })

  it('4. la cible du dépôt se TABULE — un div porteur d’un onDrop n’existe pas au clavier', () => {
    const body = executable(edit)
    // Le bouton « rattacher ici » est le chemin clavier : il doit être un
    // bouton, et il doit porter le libellé qui nomme la personne déplacée.
    expect(body).toContain("t('edit.dropHere'")
    const around = body.slice(Math.max(0, body.indexOf("t('edit.dropHere'") - 500), body.indexOf("t('edit.dropHere'"))
    expect(around).toContain('type="button"')
  })

  it('5. le tiroir reste la seule porte : c’est LUI qui appelle le hook d’écriture', () => {
    expect(isCalled(drawer, 'useCorrectOrgPerson')).toBe(true)
    expect(executable(drawer)).toContain('expectedGraphVersion: graph.graphVersion')
  })
})

describe('GA-236 — le détecteur SAIT DIRE NON', () => {
  it('un `apiFetch` ajouté au mode Édition serait vu', () => {
    const fautif = `const save = () => apiFetch({ path: '/accounts/1/org-graph/corrections', method: 'PATCH' })`
    expect(executable(fautif)).toContain('apiFetch')
    expect(executable(fautif)).toContain('/org-graph/')
  })

  it('un symbole seulement IMPORTÉ ou CITÉ n’est pas un appelant', () => {
    expect(isCalled(`import { useCorrectOrgPerson } from './x'\nconst a = 1\n`, 'useCorrectOrgPerson')).toBe(false)
    expect(isCalled(`/** on pourrait appeler useCorrectOrgPerson(id) */\nconst a = 1\n`, 'useCorrectOrgPerson')).toBe(
      false,
    )
  })

  it('un appel réel et un montage JSX réel sont reconnus', () => {
    expect(isCalled('const m = useCorrectOrgPerson(accountId)', 'useCorrectOrgPerson')).toBe(true)
    expect(isCalled('return <OrgCorrectionDrawer accountId={id} />', 'OrgCorrectionDrawer')).toBe(true)
  })

  it('le détecteur n’est pas STATEFUL — deux appels de suite rendent la même chose', () => {
    const source = 'const m = useCorrectOrgPerson(accountId)'
    expect(isCalled(source, 'useCorrectOrgPerson')).toBe(isCalled(source, 'useCorrectOrgPerson'))
  })
})
