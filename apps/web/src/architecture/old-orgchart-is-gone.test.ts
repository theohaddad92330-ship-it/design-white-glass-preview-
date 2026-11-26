import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-220 — l'ancien `OrgChart` (rôle = rangée de l'arbre) ne revient jamais.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ RETIRÉ, ET POURQUOI (décision D280, 30/08)
 * ─────────────────────────────────────────────────────────────────────────
 * `components/account/OrgChart.tsx` rangeait les contacts par RANGÉE de RÔLE
 * commercial (`getOrganigrammeRoleLevel` → 1 | 2 | 3, sur `contactRoles.ts`).
 * Le FINAL du 27/08 l'interdit nommément : la position dans l'arbre vient de
 * la hiérarchie réelle (L0-L4), le rôle commercial (Sponsor / Influenceur /
 * Opérationnel / Bloqueur) est un BADGE posé sur une carte, jamais un niveau.
 * `focal-tree-height-is-hierarchy.test.ts` (GA-100) tient déjà cette règle
 * pour la vue focale ; elle ne juge pas `OrgChart.tsx` lui-même — c'est ELLE,
 * cette garde-ci, qui ferme la porte que GA-100 documentait sans verrouiller.
 *
 * Mesuré le 30/08 : le composant restait monté en REPLI dans
 * `TabOrganigramme.tsx`, atteignable dès qu'un dossier n'avait pas de graphe,
 * ou qu'une vue système manquait de carte d'influence — un utilisateur
 * pouvait donc tomber sur l'écran que le FINAL refuse, sans savoir lequel des
 * deux croire.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE REFUSE
 * ─────────────────────────────────────────────────────────────────────────
 *  1. que le fichier `components/account/OrgChart.tsx` (ou son test) existe
 *     à nouveau sur le disque ;
 *  2. qu'un fichier source de `apps/web/src` importe depuis
 *     `@/components/account/OrgChart` ou un chemin relatif équivalent ;
 *  3. que le MOYEN du défaut revienne même sans le composant :
 *     `ORGANIGRAMME_ROLE_LEVELS` et `getOrganigrammeRoleLevel`
 *     (`lib/contactRoles.ts`) — une rangée d'arbre construite sur un rôle.
 *
 * Ce qu'elle ne fait PAS : elle ne dit rien du contenu des DEUX états vides
 * qui remplacent le repli (`OrgMapEmptyState`) — c'est
 * `OrgMapEmptyState.test.tsx` qui tient leur geste, et le test « les deux
 * vides ne se recouvrent pas » vit dans `TabOrganigramme.test.tsx`.
 */

const WEB_SRC = join(__dirname, '..')
const REMOVED_COMPONENT = join(WEB_SRC, 'components', 'account', 'OrgChart.tsx')
const REMOVED_TEST = join(WEB_SRC, 'components', 'account', 'OrgChart.test.tsx')
const CONTACT_ROLES_FILE = join(WEB_SRC, 'lib', 'contactRoles.ts')

/** L'import interdit, sous ses deux formes plausibles. */
const FORBIDDEN_IMPORT = /from\s+['"](@\/components\/account\/OrgChart|\.{1,2}\/.*\/OrgChart)['"]/

/** Le moyen du défaut : un rôle mappé vers un niveau d'arbre 1-2-3. */
const FORBIDDEN_ROLE_LEVEL_NAMES = ['ORGANIGRAMME_ROLE_LEVELS', 'getOrganigrammeRoleLevel']

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Ce fichier-même CITE l'import interdit et les deux noms bannis — dans son
 * propre docblock et dans son test « sait dire NON », en toutes lettres, pour
 * les tester. Sans s'exclure lui-même, la garde se dénoncerait à chaque
 * lecture, exactement le défaut « `RegExp.test()` … coupé à sa propre
 * explication » déjà payé sur GA-08/GA-19/GA-25.
 */
const SELF = __filename
const ALL_WEB_SOURCE_FILES = sourceFiles(WEB_SRC)
const SCANNED_FILES = ALL_WEB_SOURCE_FILES.filter(file => file !== SELF)

describe('GA-220 — l’ancien OrgChart (rôle = rangée) ne revient jamais', () => {
  it('LIT quelque chose — le dépôt web porte bien des centaines de fichiers source', () => {
    // Sans ce plancher, un `WEB_SRC` mal résolu rendrait tout le reste de
    // cette garde vert sur un répertoire vide.
    expect(ALL_WEB_SOURCE_FILES.length).toBeGreaterThan(300)
    expect(existsSync(CONTACT_ROLES_FILE)).toBe(true)
  })

  it('le composant et son test sont bien retirés du disque', () => {
    expect(existsSync(REMOVED_COMPONENT), `${REMOVED_COMPONENT} existe encore`).toBe(false)
    expect(existsSync(REMOVED_TEST), `${REMOVED_TEST} existe encore`).toBe(false)
  })

  it('aucun fichier source n’importe plus l’ancien OrgChart', () => {
    const offenders = SCANNED_FILES.filter(file =>
      FORBIDDEN_IMPORT.test(stripComments(readFileSync(file, 'utf8'))),
    ).map(file => file.slice(file.indexOf('/src/')))
    if (offenders.length > 0) {
      throw new Error(
        [
          'Un fichier importe encore `OrgChart` — l’ancien écran qui range les',
          'contacts par RÔLE commercial (Sponsor / Influenceur / Opérationnel /',
          'Bloqueur) au lieu de la hiérarchie L0-L4. Décision D280 (30/08) :',
          'retiré, remplacé par `OrgMapEmptyState` là où il vivait en repli.',
          '',
          ...offenders.map(path => `  · ${path}`),
        ].join('\n'),
      )
    }
    expect(offenders).toEqual([])
  })

  it('le moyen du défaut — rôle mappé vers un niveau d’arbre — n’est nulle part', () => {
    const offenders: string[] = []
    for (const file of SCANNED_FILES) {
      const source = stripComments(readFileSync(file, 'utf8'))
      for (const name of FORBIDDEN_ROLE_LEVEL_NAMES) {
        if (source.includes(name)) offenders.push(`${file.slice(file.indexOf('/src/'))} :: ${name}`)
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        [
          '`ORGANIGRAMME_ROLE_LEVELS` ou `getOrganigrammeRoleLevel` sont de',
          'retour — c’est le MOYEN du défaut D280 (un rôle d’achat mappé vers',
          'une rangée 1-2-3), retiré AVEC le composant qui s’en servait. Un',
          'futur écran qui s’en resservirait recréerait exactement la faute que',
          'le FINAL du 27/08 refuse.',
          '',
          ...offenders.map(entry => `  · ${entry}`),
        ].join('\n'),
      )
    }
    expect(offenders).toEqual([])
  })

  it('sait dire NON — un import et un mapping fabriqués sont bien vus', () => {
    // On rejoue les règles sur des extraits fabriqués, sans toucher au vrai
    // dépôt : casser le vrai code le temps d'un test ferait passer un écran
    // cloisonné en production si le test échouait au mauvais moment.
    expect(FORBIDDEN_IMPORT.test("import { OrgChart } from '@/components/account/OrgChart'")).toBe(true)
    expect(FORBIDDEN_IMPORT.test("import { OrgChart } from '../../components/account/OrgChart'")).toBe(true)
    expect(FORBIDDEN_IMPORT.test("import { OrgInfluenceMap } from './OrgInfluenceMap'")).toBe(false)

    const fakeContactRoles = 'export function getOrganigrammeRoleLevel(role) { return 1 }'
    expect(FORBIDDEN_ROLE_LEVEL_NAMES.some(name => fakeContactRoles.includes(name))).toBe(true)
    expect(FORBIDDEN_ROLE_LEVEL_NAMES.some(name => 'export function getRoleLabel() {}'.includes(name))).toBe(false)
  })

  it('les commentaires sont retirés avant lecture — ce fichier en cite plusieurs', () => {
    // Ce docblock cite `ORGANIGRAMME_ROLE_LEVELS` et importe `OrgChart` en
    // toutes lettres : sans le retrait des commentaires, la garde se
    // dénoncerait elle-même à chaque lecture de son propre fichier.
    const commented = "/* import { OrgChart } from '@/components/account/OrgChart' */\nconst a = 1"
    expect(FORBIDDEN_IMPORT.test(stripComments(commented))).toBe(false)
    expect(FORBIDDEN_IMPORT.test(stripComments("import { OrgChart } from '@/components/account/OrgChart'\n"))).toBe(
      true,
    )
  })
})
