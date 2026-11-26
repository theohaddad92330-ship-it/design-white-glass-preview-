import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  MISSION_BOARD_COLUMNS,
  PROJECT_STAGES,
  columnForMission,
  columnForProject,
  effectsForBoardMove,
  type MissionBoardColumn,
  type MissionStatus,
} from '@bellum/contracts'

/**
 * GA-61 — le board Missions ne possède AUCUN état (doctrine `c50_second_pipe`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE REFUS DIT, ET CE QU'IL NE DIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le §6 du PDF-02 refuse « un second pipe ». La décision D2 (PDF 5 §2) en donne
 * la forme technique : douze colonnes, aucun nouvel état — chaque carte reste
 * possédée par son objet d'origine.
 *
 * ⚠️ Le refus ne porte PAS sur le geste. Le changelog du 19/08 écrit « On n'y
 * déplace donc pas les cartes » ; celui du 21/08 livre le déplacement et le dit
 * correctement : « Déplacer une carte n'invente aucun état : l'écriture retombe
 * sur l'objet d'origine ». Une garde qui interdirait le déplacement retirerait
 * une fonctionnalité livrée au nom d'une phrase morte — c'est exactement la
 * faute que le registre de doctrine existe pour empêcher.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI RENDRAIT LA RÈGLE FAUSSE, ET QUE CETTE GARDE LIT
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **Un déplacement qui écrit ailleurs que sur l'objet d'origine.** Chaque
 *     transition déclare ce qu'elle écrit (`changes`) sous la forme
 *     `table.colonne`. Tant qu'on n'y lit que `missions.*` et `projects.*`, le
 *     board n'a pas d'état. Le jour où quelqu'un y écrit `mission_board.column`,
 *     c'est un second pipe — et ça ressemblera à un détail d'implémentation.
 *  2. **Une colonne PERSISTÉE.** Aucune migration, aucune entité ne stocke la
 *     colonne d'une carte. C'est la seconde forme du même défaut : on ne
 *     l'ajoute pas dans `board-move.ts`, on l'ajoute dans une migration.
 *  3. **Une colonne qui ne se DÉRIVE plus.** `columnForProject` et
 *     `columnForMission` sont totales sur les états d'origine ; toute colonne
 *     qu'aucune des deux ne produit n'existe que si quelqu'un l'écrit à la main.
 *     Il y en a DEUX aujourd'hui, nommées ci-dessous avec leur raison. Une
 *     troisième fait échouer cette garde : c'est le seul moment où l'on peut
 *     encore demander « d'où vient cette colonne ? ».
 *
 * ⚠️ Cette garde lit du code dans des littéraux de gabarit et des commentaires.
 * Les commentaires sont retirés AVANT, sans quoi ce docblock — qui écrit
 * `mission_board.column` deux fois — se dénoncerait lui-même.
 */

const API_SRC = join(__dirname, '..')
const MIGRATIONS = join(API_SRC, 'migrations')
const ENTITIES = join(API_SRC, 'database', 'entities')

/**
 * Les tables auxquelles un déplacement a le droit d'écrire.
 *
 * Ce sont les objets qui POSSÈDENT le travail, et il y en a quatre — la liste
 * est figée ici pour qu'une cinquième soit un geste délibéré :
 *
 *  · `missions` — le statut de la mission, pour les colonnes aval ;
 *  · `projects` — l'issue de l'affaire (gagnée, perdue) ;
 *  · `project_needs` — le statut de travail du besoin, pour les colonnes amont ;
 *  · `submissions` — la date d'envoi, quand un profil est proposé.
 *
 * ⚠️ Aucune n'est une table de BOARD : c'est le seul point qui compte. Une
 * carte ne se stocke nulle part, elle se recalcule à chaque lecture.
 */
const ORIGIN_TABLES = ['missions', 'projects', 'project_needs', 'submissions'] as const

/**
 * Les deux colonnes qu'aucune fonction de projection ne produit, et pourquoi
 * chacune est tolérée. Toute autre fait échouer la garde.
 *
 *  · `a_creer` — calculée par l'APPELANT (`mission-board.service.ts:93`) : un
 *    projet gagné que rien ne porte encore. `columnForProject` ne connaît pas
 *    les missions, et le lui faire deviner produirait une colonne fausse.
 *  · `shortlist_prete` — mesuré le 28/08 : RIEN ne la produit. Elle est
 *    toujours vide. Ce n'est pas encore un état de board (personne ne l'écrit),
 *    mais c'est la forme exacte qu'un second pipe prendrait, et l'écart est
 *    NOMMÉ au `gap` de `c50_second_pipe` plutôt que tu.
 */
const COLUMNS_WITHOUT_ORIGIN_STATE: readonly MissionBoardColumn[] = ['a_creer', 'shortlist_prete']

/** Les six statuts de mission. Écrits ici plutôt qu'importés : le contrat
 *  n'exporte que le schéma zod, et une liste recopiée qui DIVERGE se voit —
 *  `columnForMission` est exhaustive, TypeScript refuserait un statut inconnu. */
const MISSION_STATUSES: readonly MissionStatus[] = ['onboarding', 'active', 'paused', 'renewed', 'ended', 'terminated']

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

/** Tout ce qu'un déplacement de carte déclare écrire, les douze colonnes
 *  d'arrivée confondues. */
function declaredWrites(): string[] {
  const out = new Set<string>()
  for (const to of MISSION_BOARD_COLUMNS) {
    for (const change of effectsForBoardMove('en_cours', to).changes) out.add(change)
  }
  return [...out].sort()
}

/** Les colonnes réellement atteignables depuis un état d'origine. */
function derivedColumns(): Set<MissionBoardColumn> {
  const out = new Set<MissionBoardColumn>()
  for (const stage of PROJECT_STAGES) {
    const column = columnForProject(stage)
    if (column !== null) out.add(column)
  }
  for (const status of MISSION_STATUSES) out.add(columnForMission(status))
  return out
}

describe('GA-61 — le board Missions ne possède aucun état', () => {
  it('LIT quelque chose — douze colonnes, des écritures déclarées, des migrations', () => {
    // Sans cette assertion, un contrat vidé ou un répertoire renommé rendrait
    // la garde verte sur du vide. C'est le défaut de la garde borgne.
    expect(MISSION_BOARD_COLUMNS.length).toBe(12)
    expect(declaredWrites().length).toBeGreaterThan(0)
    expect(sourceFiles(MIGRATIONS).length).toBeGreaterThan(50)
    expect(sourceFiles(ENTITIES).length).toBeGreaterThan(20)
  })

  it('n’écrit que dans les QUATRE tables d’objets — une cinquième est un geste délibéré', () => {
    // La liste EXACTE, et pas seulement « aucune table de board » : c'est ce
    // qui fait qu'un ajout se relit, plutôt que de se glisser dans un diff.
    const tables = [...new Set(declaredWrites().map(change => change.split('.')[0] ?? ''))].sort()
    expect(tables).toEqual([...ORIGIN_TABLES].sort())
  })

  it('un déplacement n’écrit QUE sur un objet qui possède le travail', () => {
    const offenders = declaredWrites().filter(change => {
      const table = change.split('.')[0] ?? ''
      return !ORIGIN_TABLES.includes(table as (typeof ORIGIN_TABLES)[number])
    })
    if (offenders.length > 0) {
      throw new Error(
        [
          'Un déplacement de carte écrit ailleurs que sur son objet d’origine.',
          'Le board est une PROJECTION : un projet garde son étape, une mission',
          'garde son statut. Une écriture hors de `missions.*` / `projects.*` est',
          'un troisième jeu d’états — c’est-à-dire le second pipe que le §6 du',
          'PDF-02 refuse (doctrine `c50_second_pipe`).',
          '',
          ...offenders.map(change => `  · ${change}`),
        ].join('\n'),
      )
    }
    expect(offenders).toEqual([])
  })

  it('aucune migration ne PERSISTE la colonne d’une carte', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(MIGRATIONS)) {
      const sql = stripComments(readFileSync(file, 'utf8'))
      if (/\bmission_board\b/i.test(sql) || /\bboard_column\b/i.test(sql)) {
        offenders.push(file.slice(file.indexOf('/migrations')))
      }
    }
    expect(offenders).toEqual([])
  })

  it('aucune entité ne porte la colonne d’une carte', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(ENTITIES)) {
      const source = stripComments(readFileSync(file, 'utf8'))
      if (/\bboard_column\b/i.test(source) || /\bboardColumn\b/.test(source)) {
        offenders.push(file.slice(file.indexOf('/entities')))
      }
    }
    expect(offenders).toEqual([])
  })

  it('chaque colonne se DÉRIVE d’un état d’origine — sauf les deux qui sont nommées', () => {
    const derived = derivedColumns()
    const orphans = MISSION_BOARD_COLUMNS.filter(column => !derived.has(column))
    // L'égalité est voulue, et dans cet ordre : une colonne orpheline de plus
    // fait échouer, et une colonne nommée ici qui redevient dérivée aussi —
    // auquel cas on retire la ligne au lieu de garder une excuse périmée.
    expect([...orphans].sort()).toEqual([...COLUMNS_WITHOUT_ORIGIN_STATE].sort())
  })

  it('sait dire NON — une écriture de board et une colonne persistée sont vues', () => {
    // On rejoue la règle sur des entrées fabriquées : casser le vrai contrat
    // ferait passer un second pipe en production le temps d'un test.
    const isOriginWrite = (change: string) =>
      ORIGIN_TABLES.includes((change.split('.')[0] ?? '') as (typeof ORIGIN_TABLES)[number])
    expect(isOriginWrite('missions.status')).toBe(true)
    expect(isOriginWrite('projects.stage')).toBe(true)
    expect(isOriginWrite('mission_board.column')).toBe(false)

    const persists = (sql: string) => /\bmission_board\b/i.test(sql) || /\bboard_column\b/i.test(sql)
    expect(persists('ALTER TABLE missions ADD COLUMN board_column text')).toBe(true)
    expect(persists('CREATE TABLE mission_board (id uuid)')).toBe(true)
    expect(persists('ALTER TABLE missions ADD COLUMN ends_on date')).toBe(false)

    // Et le NON de la troisième règle : une treizième colonne orpheline.
    const derived = derivedColumns()
    expect(derived.has('en_cours')).toBe(true)
    expect(derived.has('shortlist_prete')).toBe(false)
  })

  it('les commentaires sont retirés avant lecture — sans quoi ce fichier se dénoncerait', () => {
    expect(stripComments('/* mission_board.column */ const a = 1')).not.toMatch(/mission_board/)
    expect(stripComments('// board_column\nconst a = 1')).not.toMatch(/board_column/)
    expect(stripComments("const sql = 'board_column'")).toMatch(/board_column/)
  })
})
