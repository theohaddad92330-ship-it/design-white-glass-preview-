/**
 * GA-100 — la hauteur d'une carte vient du NIVEAU, jamais du rôle de décision.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * C'est la contradiction n°1 du paquet OrgGraph du 27/08, et la seule que le
 * document final prend la peine de nommer et de refuser deux fois :
 *
 *   > « Les "3 niveaux Sponsor / Influenceur / Opérationnel" ne doivent PAS
 *   >   déterminer la géométrie de l'arbre : cela recréerait exactement le
 *   >   défaut dénoncé. L'arbre reste L0-L4 ; les 3 rôles sont des badges. »
 *   >   (00_START_HERE l.58-59)
 *   > « La hauteur vient uniquement de L0-L4. » (PDF-22 FINAL l.127)
 *   > critère d'acceptation 03 : « aucun rôle commercial ne détermine la
 *   >   hauteur du nœud. » (PDF-22 FINAL l.469)
 *
 * L'écran précédent faisait exactement l'inverse, et il existe encore dans le
 * dépôt : `lib/contactRoles.ts` mappe un rôle d'achat vers une rangée 1-2-3 pour
 * `components/account/OrgChart.tsx`. Cette garde ne le juge pas — elle est bornée
 * à la vue focale, qui est la vue par défaut, celle qu'un commercial ouvre.
 *
 * POURQUOI C'EST GRAVE, et pas une question de goût : un lecteur ne lit pas une
 * légende, il lit une POSITION. Mettre un Sponsor au-dessus d'un Influenceur fait
 * lire « Claire rapporte à Julien » là où l'écran voulait dire « Julien décide,
 * Claire pèse ». Et c'est sur cette lecture-là qu'on choisit qui appeler en
 * premier. La faute est invisible : l'écran a l'air juste.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT, ET CE QU'ELLE REFUSE
 * ─────────────────────────────────────────────────────────────────────────
 * Elle lit UN fichier, `focalOrgData.ts`, et commence par vérifier qu'elle l'a
 * bien reconnu : quatre ancres (`FOCAL_TREE_LEVELS`, le type `FocalLevelRow`, le
 * type `OrgDecisionBadge`, l'expression qui construit les rangées). Si l'une
 * manque, elle ÉCHOUE en disant que son corpus a changé, plutôt que de passer au
 * vert sur un fichier qu'elle ne comprend plus — c'est la différence entre une
 * garde et une garde borgne.
 *
 * Elle refuse trois choses :
 *   1. qu'un étage de l'arbre soit autre chose qu'un niveau `L*` ;
 *   2. que la rangée se construise sur autre chose que le niveau d'une carte ;
 *   3. que le champ qui porte l'étage soit typé par le badge.
 *
 * Ce qu'elle ne fait PAS : elle ne dit rien de `decisionBadgeOf`. Le badge a le
 * droit d'évoluer — la garde interdit qu'il devienne une COORDONNÉE, pas qu'il
 * change de règle.
 *
 * ⚠️ Elle retire les commentaires avant de lire. Ce docblock-ci cite
 * `card.badge` ; sans le retrait, la garde tomberait sur sa propre explication,
 * et la seule façon de documenter la règle deviendrait de ne pas la documenter
 * (défaut déjà payé sur GA-08, GA-19 et GA-25).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const FOCAL_FILE = join(
  __dirname,
  '..',
  'features',
  'accounts',
  'view',
  'account-detail',
  'tabs',
  'organigramme',
  'focalOrgData.ts',
)

/** Les quatre badges de décision. Leur pendant en code est `OrgDecisionBadge`. */
const DECISION_BADGES = ['sponsor', 'influencer', 'operational', 'blocker'] as const

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * L'expression complète qui suit `FOCAL_TREE_LEVELS.map(`, parenthèses
 * équilibrées.
 *
 * ⚠️ Un `indexOf(')')` s'arrêterait au premier `)` interne — il y en a quatre
 * dans l'expression réelle (`.filter(...)`, `.sort(...)`, `.map(...)`, la
 * dernière `.filter(...)`). On compte donc les parenthèses, ce qui reste juste
 * quelle que soit la mise en forme de Prettier.
 */
function rowBuildingExpression(source: string): string | null {
  const anchor = 'FOCAL_TREE_LEVELS.map('
  const start = source.indexOf(anchor)
  if (start === -1) return null
  let depth = 0
  for (let i = start + anchor.length - 1; i < source.length; i += 1) {
    const char = source[i]
    if (char === '(') depth += 1
    else if (char === ')') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  return null
}

/** Le contenu du littéral de tableau assigné à `FOCAL_TREE_LEVELS`. */
function treeLevelLiterals(source: string): string[] | null {
  const match = source.match(/FOCAL_TREE_LEVELS[^=]*=\s*\[([^\]]*)\]/)
  if (!match) return null
  return [...match[1].matchAll(/'([^']*)'/g)].map(entry => entry[1])
}

describe("GA-100 — l'arbre focal se range par niveau, jamais par rôle", () => {
  const raw = existsSync(FOCAL_FILE) ? readFileSync(FOCAL_FILE, 'utf8') : ''
  const source = stripComments(raw)

  describe('le corpus est bien celui que cette garde croit lire', () => {
    it('le fichier de la vue focale existe et porte du code', () => {
      expect(existsSync(FOCAL_FILE)).toBe(true)
      // Le seuil n'est pas cosmétique : un fichier vidé ou renommé rendrait
      // toutes les assertions suivantes trivialement vertes.
      expect(source.split('\n').length).toBeGreaterThan(300)
    })

    it('les quatre ancres de la règle sont présentes', () => {
      expect(treeLevelLiterals(source), 'FOCAL_TREE_LEVELS introuvable').not.toBeNull()
      expect(rowBuildingExpression(source), 'la construction des rangées est introuvable').not.toBeNull()
      expect(source).toMatch(/type\s+FocalLevelRow\s*=\s*\{/)
      expect(source).toMatch(/type\s+OrgDecisionBadge\s*=/)
    })

    it('les quatre badges de décision sont bien ceux que la garde connaît', () => {
      const declaration = source.match(/type\s+OrgDecisionBadge\s*=([^\n]*)/)?.[1] ?? ''
      for (const badge of DECISION_BADGES) {
        expect(declaration, `le badge « ${badge} » a disparu du type`).toContain(`'${badge}'`)
      }
    })
  })

  describe('la règle', () => {
    it('un étage de l’arbre est un niveau hiérarchique, jamais un badge', () => {
      const levels = treeLevelLiterals(source) as string[]
      expect(levels.length).toBeGreaterThan(0)
      for (const level of levels) {
        expect(level, `« ${level} » n’est pas un niveau hiérarchique`).toMatch(/^L\d$/)
      }
    })

    it('la rangée se construit sur le NIVEAU d’une carte', () => {
      const expression = rowBuildingExpression(source) as string
      expect(expression).toMatch(/card\.level\b/)
    })

    it('la rangée ne regarde jamais le badge d’une carte', () => {
      const expression = rowBuildingExpression(source) as string
      expect(expression, 'la construction des rangées lit un badge').not.toMatch(/\.badge\b/)
      for (const badge of DECISION_BADGES) {
        expect(expression, `« ${badge} » sert à ranger l’arbre`).not.toContain(`'${badge}'`)
      }
    })

    it('le champ qui porte l’étage est typé par le niveau, pas par le badge', () => {
      const row = source.match(/type\s+FocalLevelRow\s*=\s*\{([\s\S]*?)\}/)?.[1] ?? ''
      expect(row).toMatch(/level\s*:\s*OrgHierarchyLevel\b/)
      expect(row, 'une rangée est typée par un badge').not.toMatch(/OrgDecisionBadge/)
    })
  })
})
