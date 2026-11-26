/**
 * GA-185 — un compte ne se trouve jamais dans les deux files du board
 * d'effort (arbitrage / exécution) en même temps.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * `SprintBoard.tsx` rendait `SPRINT_LEVELS.map(...)` sans aucun filtre : celui
 * qui décide où mettre l'effort (Focus/Sortis — les deux niveaux GATÉS, où
 * entrer ou sortir est une décision qui peut être refusée) et celui qui
 * exécute la cadence (Extension/Volume, sans porte d'entrée/sortie) voyaient
 * exactement le même board, et ni l'un ni l'autre ne pouvait filtrer sur SA
 * file.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * VUE, PAS PERMISSION — LA DÉCISION ET SA RAISON
 * ─────────────────────────────────────────────────────────────────────────
 * Le dépôt a neuf rôles (`packages/contracts/src/schemas/workspace.ts`,
 * `workspaceRoleValues`) : `owner`, `admin`, `sales_ops`, `sales`,
 * `tech_admin`, `member`, `viewer`, `recruiter`, `finance`. AUCUN ne porte la
 * distinction « qui arbitre » / « qui exécute » — `owner`, `admin`,
 * `sales_ops`, `sales` et `member` détiennent TOUS `records:write`, la
 * permission qui gouverne `PATCH /sprints/accounts/:id` (voir
 * `apps/api/src/modules/sprints/sprints.controller.ts`). Gater cette vue par
 * PERMISSION inventerait donc une donnée que l'espace ne fournit pas — et
 * casserait le cas le plus courant, l'ESN à un seul commercial qui arbitre ET
 * exécute lui-même.
 *
 * La séparation est donc une VUE choisie par qui regarde l'écran, pas une
 * permission imposée par le serveur : `GET /sprints` continue de rendre le
 * board complet, et `SPRINT_LANE_LEVELS` (packages/contracts/src/schemas/sprint.ts)
 * est la seule source de vérité sur quel niveau sert quelle file. Si le
 * dépôt gagne un jour un champ « qui arbitre / qui exécute » sur le membre,
 * cette vue devient un défaut automatique plutôt qu'un choix — pas avant :
 * inventer le champ pour le faire aujourd'hui serait la donnée fictive que
 * ce lot s'interdit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE EXIGE
 * ─────────────────────────────────────────────────────────────────────────
 *  1. `SprintBoard.tsx` ne rend plus les quatre niveaux sans filtre
 *     (`SPRINT_LEVELS.map(` au niveau racine du board) — il rend la file
 *     ACTIVE, dérivée de `SPRINT_LANE_LEVELS`.
 *  2. La partition niveau→file est complète et sans chevauchement.
 *  3. Sur un board construit couvrant les quatre niveaux, l'intersection des
 *     ids de compte des deux files est vide.
 *
 * ⚠️ Vit dans `apps/web/src/features/sprints/architecture/` plutôt que dans
 * `apps/web/src/architecture/` : ce lot est strictement scopé à
 * `apps/web/src/features/sprints/**` (onze autres agents écrivent en
 * parallèle ailleurs dans le dépôt) — voir la consigne du lot P6.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SPRINT_LANES,
  SPRINT_LANE_LEVELS,
  laneOverlap,
  splitBoardByLane,
  sprintLanePartitionProblems,
  type SprintLane,
  type SprintLevel,
} from '@bellum/contracts'

const SPRINT_BOARD_PATH = join(__dirname, '..', 'view', 'SprintBoard.tsx')

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function sprintBoardSource(): string {
  return stripComments(readFileSync(SPRINT_BOARD_PATH, 'utf8'))
}

/** Le défaut EXACT que cette garde interdit : rendre les quatre niveaux sans
 *  passer par une file. `SPRINT_LEVELS.filter(...)` (les boutons « déplacer
 *  vers ») n'est PAS ce défaut — seul `.map(` qui parcourt le tableau entier
 *  pour en tirer des colonnes l'est. */
function rendersLevelsWithoutLaneFilter(source: string): boolean {
  return source.includes('SPRINT_LEVELS.map(')
}

describe('GA-185 — la garde lit bien quelque chose', () => {
  it('le corpus existe : le board, et la table niveau→file', () => {
    expect(() => sprintBoardSource(), `SprintBoard.tsx introuvable : ${SPRINT_BOARD_PATH}`).not.toThrow()
    const source = sprintBoardSource()
    expect(source.length, 'SprintBoard.tsx est vide').toBeGreaterThan(0)
    expect(SPRINT_LANES.length, 'SPRINT_LANES est vide').toBe(2)
    expect(Object.keys(SPRINT_LANE_LEVELS).length, 'SPRINT_LANE_LEVELS est vide').toBe(2)
  })

  it('le board rend la file active, dérivée de SPRINT_LANE_LEVELS', () => {
    const source = sprintBoardSource()
    expect(source, 'aucune référence à SPRINT_LANE_LEVELS dans SprintBoard.tsx').toContain('SPRINT_LANE_LEVELS')
  })
})

describe('GA-185 — la garde sait dire NON (forme source)', () => {
  it('repère la forme EXACTE du défaut : les quatre niveaux rendus sans filtre', () => {
    const faulty = `
      {SPRINT_LEVELS.map(level => (
        <Card key={level}>{level}</Card>
      ))}
    `
    expect(rendersLevelsWithoutLaneFilter(faulty)).toBe(true)
  })

  it('laisse passer la forme corrigée, et ne confond pas avec les boutons « déplacer vers »', () => {
    const fixed = `
      {SPRINT_LANE_LEVELS[activeLane].map(level => (
        <Card key={level}>{level}</Card>
      ))}
      {SPRINT_LEVELS.filter(other => other !== level).map(other => (
        <button key={other} type="button" />
      ))}
    `
    expect(rendersLevelsWithoutLaneFilter(fixed)).toBe(false)
  })

  it('un exemple fautif CITÉ dans un commentaire n’est pas du code rendu', () => {
    const commented = '/* avant : {SPRINT_LEVELS.map(level => <Card key={level} />)} */'
    expect(rendersLevelsWithoutLaneFilter(stripComments(commented))).toBe(false)
  })
})

describe('GA-185 — SprintBoard.tsx, en vrai', () => {
  it('ne rend plus les quatre niveaux sans filtre de file', () => {
    expect(rendersLevelsWithoutLaneFilter(sprintBoardSource())).toBe(false)
  })
})

describe('GA-185 — la partition niveau→file est complète et sans chevauchement', () => {
  it('les six niveaux réels sont couverts, chacun par UNE SEULE file (BEL-SC-228 ajoute watch/partner_route)', () => {
    expect(sprintLanePartitionProblems()).toEqual([])
  })

  it('sait dire NON : une table cassée (un niveau dans les deux files) est détectée', () => {
    const broken: Record<SprintLane, readonly SprintLevel[]> = {
      arbitrage: ['focus', 'no_go', 'volume', 'watch', 'partner_route'],
      execution: ['extension', 'volume'],
    }
    expect(sprintLanePartitionProblems(broken)).toEqual(['volume est dans plusieurs files : arbitrage, execution.'])
  })
})

describe('GA-185 — un compte n’est jamais dans les deux files, sur un board construit', () => {
  // Couvre les six niveaux, un compte distinct par niveau — le cas construit
  // que la consigne demande.
  const board: Record<SprintLevel, { id: string }[]> = {
    focus: [{ id: 'acc-focus-1' }, { id: 'acc-focus-2' }],
    extension: [{ id: 'acc-extension-1' }],
    volume: [{ id: 'acc-volume-1' }],
    no_go: [{ id: 'acc-no-go-1' }],
    watch: [{ id: 'acc-watch-1' }],
    partner_route: [{ id: 'acc-partner-route-1' }],
  }

  it('l’intersection des deux files est vide, avec la vraie table', () => {
    const files = splitBoardByLane(board)
    expect(files.arbitrage.sort()).toEqual([
      'acc-focus-1',
      'acc-focus-2',
      'acc-no-go-1',
      'acc-partner-route-1',
      'acc-watch-1',
    ])
    expect(files.execution.sort()).toEqual(['acc-extension-1', 'acc-volume-1'])
    expect(laneOverlap(files)).toEqual([])
  })

  it('sait dire NON : une table cassée fait apparaître un compte dans les deux files', () => {
    const broken: Record<SprintLane, readonly SprintLevel[]> = {
      arbitrage: ['focus', 'no_go', 'volume', 'watch', 'partner_route'],
      execution: ['extension', 'volume'],
    }
    const files = splitBoardByLane(board, broken)
    expect(laneOverlap(files)).toEqual(['acc-volume-1'])
  })
})
