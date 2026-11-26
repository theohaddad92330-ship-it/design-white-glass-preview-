import { DEMO_ACTIVITIES, DEMO_OUTREACH_CALL_TASKS } from './demo-dataset'

/**
 * #3697 (parité démo, craft rule n°9) — la fiche Contact montre, en salle : un appel CONSIGNÉ dont
 * le débrief porte une objection réellement exprimée (ligne « Objection exprimée » de la relation,
 * provenance : cet appel) et une tâche d'appel FUTURE (liste « Appels à passer » de la carte Appel).
 * Sans l'un ou l'autre, ces deux lignes seraient invisibles devant un prospect.
 */
describe('démo — #3697, appel consigné avec objection et appel à passer', () => {
  it('un appel attaché à un contact porte une objection exprimée, avec son issue', () => {
    const shown = DEMO_ACTIVITIES.filter(
      activity => activity.kind === 'call' && activity.contact !== null && activity.callDebrief?.objection,
    )
    expect(shown.length).toBeGreaterThanOrEqual(1)
    for (const activity of shown) expect(activity.outcome).toBeDefined()
  })

  it('SAIT DIRE NON — une objection n’est jamais portée par autre chose qu’un appel', () => {
    const wrong = DEMO_ACTIVITIES.filter(activity => activity.kind !== 'call' && activity.callDebrief)
    expect(wrong).toEqual([])
  })

  it('une tâche d’appel future existe pour un contact', () => {
    expect(DEMO_OUTREACH_CALL_TASKS.length).toBeGreaterThanOrEqual(1)
  })
})
