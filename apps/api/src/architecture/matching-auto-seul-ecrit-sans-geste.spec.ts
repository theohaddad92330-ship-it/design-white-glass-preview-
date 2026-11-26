import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { NEED_AUTO_MATCH_ROUTINE_KEY } from '@bellum/contracts'
import { ROUTINE_CATALOG } from '../modules/routines/routine-catalog'

/**
 * #2916 / #2399.2 — `c93_matching_auto_besoin_entrant` (DÉCISION LOUIS 11/10/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET SON UNIQUE EXCEPTION NOMMÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * Jusqu'au 11/10/2026, un `MatchRun` (le journal de matching, obligation de
 * conformité) ne s'écrivait que sur un GESTE : le bouton « Lancer le matching »,
 * un lot lancé à la main, Laura sur demande, une action d'Action OS approuvée.
 * La décision du 11/10 lève cette règle pour UNE automatisation — « Matcher un
 * besoin entrant » — et pour elle seule. Cette garde tient les deux moitiés :
 *
 *  · elle LAISSE PASSER le cas nommé (`auto-need-matching.service.ts`) ;
 *  · elle dit NON à tout autre appelant de `matchNeed` qui n'est pas dans la
 *    liste ci-dessous — un balayage, un cron, un abonné ORM de plus devrait
 *    venir ici, avec sa décision écrite, avant de passer ;
 *  · elle dit NON à un `INSERT INTO project_needs` en SQL brut hors salle de
 *    démonstration : il contournerait `NeedArrivalSubscriber`, et un besoin
 *    entré par cette porte ne serait jamais matché — en silence.
 */

const MODULES = join(__dirname, '..', 'modules')

/** Mêmes conventions que les autres gardes : le récit d'un défaut écrit en
 *  commentaire n'est pas un appel. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full))
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) found.push(full)
  }
  return found
}

function callsMatchNeed(source: string): boolean {
  return /\.matchNeed\(/.test(stripComments(source))
}

function insertsNeedsRaw(source: string): boolean {
  return /INSERT\s+INTO\s+(public\.)?project_needs\b/i.test(stripComments(source))
}

/**
 * Les appelants de `MatchingService.matchNeed`, chemin relatif à `modules/`.
 * `automatic: true` = écrit SANS geste humain — UN seul, nommé par c93.
 */
const MATCH_NEED_CALLERS: Record<string, { automatic: boolean; why: string }> = {
  'consultants/matching/matching.controller.ts': {
    automatic: false,
    why: 'le bouton « Lancer le matching » et la shortlist sans run préalable — un geste',
  },
  'consultants/matching/bulk-matching.service.ts': {
    automatic: false,
    why: 'le matching massif, lancé à la main sur une sélection de besoins',
  },
  'consultants/matching/matching.service.ts': {
    automatic: false,
    why: '`matchNeedWithChanges` (#4059) enveloppe `matchNeed` : c’est la porte de Laura, sur DEMANDE de la personne, `records:write` comprise (copilot-bridge.controller.ts l’appelle)',
  },
  'action-os/action-os.module.ts': {
    automatic: false,
    why: 'un job d’Action OS, qui passe par la politique d’approbation (GA-239)',
  },
  'action-os/laura-job.executor.ts': {
    automatic: false,
    why: 'l’exécuteur du même job d’Action OS (le port câblé dans action-os.module.ts), après approbation',
  },
  'projects/projects.controller.ts': {
    automatic: false,
    why: '#4339 — la proposition « chercher dans le vivier » d’un changement de colonne, exécutée UNIQUEMENT quand la personne la coche : un geste',
  },
  'consultants/matching/auto-need-matching.service.ts': {
    automatic: true,
    why: 'c93 — « Matcher un besoin entrant », DÉCISION LOUIS 11/10/2026, la seule écriture automatique',
  },
}

describe('c93 — seul « Matcher un besoin entrant » écrit un matching sans geste humain', () => {
  const files = sourceFiles(MODULES)

  it('la garde LIT quelque chose : le corpus n’est pas vide et contient le moteur', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(files.some(file => file.endsWith('matching.service.ts'))).toBe(true)
  })

  it('le détecteur sait dire OUI, et n’attrape pas un appel en commentaire', () => {
    expect(callsMatchNeed('await this.matching.matchNeed(id, ws, user, opts)')).toBe(true)
    expect(callsMatchNeed('// this.matching.matchNeed(id) — raconté, pas appelé')).toBe(false)
    expect(callsMatchNeed('async matchNeed(needId: string)')).toBe(false)
    expect(insertsNeedsRaw('`INSERT INTO project_needs (id) VALUES ($1)`')).toBe(true)
    expect(insertsNeedsRaw('`INSERT INTO project_needs_archive (id)`')).toBe(false)
  })

  it('les appelants de `matchNeed` sont EXACTEMENT ceux de la liste — un nouveau doit écrire sa décision ici', () => {
    const callers = files
      .filter(file => callsMatchNeed(readFileSync(file, 'utf8')))
      .map(file => relative(MODULES, file))
      .sort()
    expect(callers).toEqual(Object.keys(MATCH_NEED_CALLERS).sort())
  })

  it('UNE seule écriture automatique, et c’est celle que c93 nomme', () => {
    const automatic = Object.entries(MATCH_NEED_CALLERS).filter(([, caller]) => caller.automatic)
    expect(automatic.map(([file]) => file)).toEqual(['consultants/matching/auto-need-matching.service.ts'])
  })

  it('aucun balayage de routine n’écrit de matching — la routine c93 se déclenche à l’ARRIVÉE du besoin', () => {
    for (const file of [
      'routines/routine-executors.ts',
      'routines/routines.service.ts',
      'routines/routines.scheduler.ts',
    ]) {
      const source = stripComments(readFileSync(join(MODULES, file), 'utf8'))
      expect(source).not.toMatch(/matchNeed|AutoNeedMatchingService/)
    }
  })

  it('la routine qui porte l’exception est désactivée par défaut et reste en automatique BORNÉ', () => {
    const routine = ROUTINE_CATALOG.find(entry => entry.key === NEED_AUTO_MATCH_ROUTINE_KEY)
    expect(routine).toBeDefined()
    expect(routine?.defaultEnabled).toBe(false)
    expect(routine?.automationLevel).toBe('n4_bounded_auto')
  })

  it('aucun `INSERT INTO project_needs` en SQL brut hors démo — il contournerait le déclencheur', () => {
    const offenders = files
      .filter(file => !relative(MODULES, file).startsWith('demo/'))
      .filter(file => insertsNeedsRaw(readFileSync(file, 'utf8')))
      .map(file => relative(MODULES, file))
    expect(offenders).toEqual([])
  })
})
