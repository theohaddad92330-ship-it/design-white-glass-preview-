import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

/**
 * #2390.19 — NO-GO : signaler sans résoudre, ou déplacer sans validation.
 *
 * Deux moitiés, chacune prouvée en LISANT le code (pas un commentaire) :
 *
 *  1. déplacer sans validation — `AgendaService.rescheduleEvent` n'a qu'UN
 *     appelant hors backends : la route HTTP `PATCH /agenda/events/:id`
 *     (un geste humain, après la boîte de confirmation). Ni routine, ni cron,
 *     ni outil de Laura n'y touche ;
 *  2. signaler sans résoudre — l'écran qui ouvre un conflit appelle
 *     `resolveOverlap`, donc montre des options chiffrées, pas un constat.
 */
const ROOT = join(__dirname, '..', '..', '..', '..', '..')

function grep(pattern: string, ...paths: string[]): string[] {
  try {
    return execFileSync('git', ['grep', '-l', '-E', pattern, '--', ...paths, ':!*.spec.ts', ':!*.test.*'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean)
  } catch {
    return [] // git grep sort 1 sans résultat
  }
}

describe('#2390.19 — NO-GO du calendrier', () => {
  it('seule la route HTTP appelle agenda.rescheduleEvent — aucune routine, aucun outil de Laura', () => {
    const callers = grep(
      'agenda\\.rescheduleEvent\\(|agendaService\\.rescheduleEvent\\(',
      'apps/api/src',
      'apps/ia/app',
    )
    expect(callers).toEqual(['apps/api/src/modules/agenda/agenda.controller.ts'])
  })

  it('aucun outil de chat ne déplace un évènement', () => {
    expect(grep('reschedule_event|move_event|update_event', 'apps/ia/app')).toEqual([])
  })

  it('la boîte de conflit calcule des options (résoudre), elle ne se contente pas de signaler', () => {
    expect(grep("from '@/features/agenda/conflict-resolution'", 'apps/web/src/features/briefing')).toContain(
      'apps/web/src/features/briefing/view/ConflictDialog.tsx',
    )
  })

  it('la garde sait dire NON — elle voit bien un appelant qui existe', () => {
    expect(grep('rescheduleEvent', 'apps/api/src/modules/agenda').length).toBeGreaterThan(1)
  })
})
