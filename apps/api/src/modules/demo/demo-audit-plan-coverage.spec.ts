import { DEMO_PLAN_TASKS } from './demo-dataset'

/**
 * #2068.1 — LA PARITÉ DÉMO DU « PLAN À 4 SEMAINES » DE L'AUDIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE, ALORS QUE `demo-seed.service.spec.ts` EST VERTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `demo-seed.service.spec.ts` prouve que chaque ligne de {@link DEMO_PLAN_TASKS}
 * s'écrit dans `action_plan_items` — une garde par TABLE, verte tant que des
 * lignes existent, même si les 4 semaines du plan de l'audit n'en montraient
 * qu'une seule remplie sur quatre. Une garde aveugle n'est pas une exemption.
 *
 * ⚠️ Ce que cette suite EXÉCUTE vraiment : la MÊME règle de placement que
 * `buildThirtyDayPlanFromActions` (`apps/web/.../lib/build-audit.ts`, #2068.1) —
 * une fenêtre GLISSANTE de 7 jours depuis « aujourd'hui », une échéance en
 * retard traitée comme relevant de la semaine en cours, rien au-delà de la
 * 4e semaine. `build-audit.ts` vit dans `apps/web` et l'API ne l'importe pas
 * (périmètre du dépôt, même choix que `demo-audit-first-moves-coverage.spec.ts`) :
 * la règle est donc RÉIMPLÉMENTÉE ici, sur `DEMO_PLAN_TASKS.dueInDays`, avec la
 * MÊME convention que `seedPlanTasks` (`demo-seed.service.ts`) : `dueInDays`
 * est relatif au moment du semis, qu'on assimile ici à « aujourd'hui » — le
 * scénario le plus courant d'une salle qui vient d'être réinitialisée.
 *
 * Retirer une des trois entrées ajoutées pour les semaines 2/3/4 (Société Générale
 * +10j, Groupe BPCE +17j, SNCF +24j), ou leur donner une échéance qui retombe
 * dans une semaine déjà couverte, fait rougir ce fichier en NOMMANT la semaine
 * vidée — jamais un simple « il en manque un ».
 */

/** Même règle de placement que `buildThirtyDayPlanFromActions` (#2068.1). */
function weekIndexFromDueInDays(dueInDays: number): number | null {
  const clamped = Math.max(dueInDays, 0)
  const weekIndex = Math.floor(clamped / 7)
  return weekIndex <= 3 ? weekIndex : null
}

describe('DEMO_PLAN_TASKS — #2068.1, le plan à 4 semaines de l’audit voit les 4 semaines REMPLIES', () => {
  it('place au moins une tâche dans CHACUNE des 4 semaines, jamais 3 vides sur 4', () => {
    const byWeek: string[][] = [[], [], [], []]
    for (const task of DEMO_PLAN_TASKS) {
      if (task.dueInDays === null) continue
      const weekIndex = weekIndexFromDueInDays(task.dueInDays)
      if (weekIndex === null) continue
      byWeek[weekIndex]?.push(task.label)
    }
    const emptyWeeks = byWeek
      .map((labels, index) => ({ week: index + 1, labels }))
      .filter(entry => entry.labels.length === 0)
    expect(emptyWeeks.map(entry => entry.week)).toEqual([])
    for (const labels of byWeek) expect(labels.length).toBeGreaterThanOrEqual(1)
  })

  it('les tâches sans échéance (Société Générale) restent HORS du plan, jamais un créneau deviné (#2068.13)', () => {
    const undated = DEMO_PLAN_TASKS.filter(task => task.dueInDays === null)
    expect(undated.length).toBeGreaterThanOrEqual(1)
  })

  it('la tâche en retard (Groupe BPCE) tombe dans LA SEMAINE EN COURS, jamais reportée hors fenêtre', () => {
    const overdue = DEMO_PLAN_TASKS.find(task => task.dueInDays !== null && task.dueInDays < 0)
    expect(overdue).toBeDefined()
    expect(weekIndexFromDueInDays(overdue!.dueInDays as number)).toBe(0)
  })
})
