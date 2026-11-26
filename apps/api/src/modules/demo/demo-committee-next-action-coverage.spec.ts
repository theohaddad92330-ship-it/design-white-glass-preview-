/**
 * #3282 / #3263.19 (recette Z2 04/10) — « Prochaine action : <date> » sur un
 * siège du comité d'achat SG. Le journal ne montrait la mention que sur NOVA :
 * le dossier SG, celui qu'on ouvre en réunion, avait six sièges sans date.
 *
 * La date vient de `ContactsService.nextActionDueByContact` : une action du plan
 * OUVERTE, datée, rattachée au contact (jamais recalculée côté écran).
 */
import { DEMO_DOSSIERS, DEMO_PLAN_TASKS } from './demo-dataset'

const SG = 'Société Générale'

describe('démo — une prochaine action datée sur un siège du comité SG (#3282, #3263.19)', () => {
  const sgContactNames = new Set(
    DEMO_DOSSIERS.filter(d => d.account.company_name === SG).flatMap(d => d.contacts.map(c => c.full_name)),
  )

  it('au moins une action ouverte, datée, nomme un contact du dossier SG', () => {
    const seats = DEMO_PLAN_TASKS.filter(
      t =>
        t.company === SG &&
        t.contact !== null &&
        sgContactNames.has(t.contact) &&
        t.dueInDays !== null &&
        t.executionStatus !== 'done',
    )
    expect(seats.length).toBeGreaterThan(0)
  })

  // #3282 (recette 05/10) — au moins une personne NOMMÉE (nom unique du dossier) porte une action datée.
  it('au moins une personne nommée du dossier SG porte une action ouverte et datée', () => {
    const names = DEMO_DOSSIERS.filter(d => d.account.company_name === SG).flatMap(d => d.contacts)
    const count = (name: string) => names.filter(c => c.full_name === name).length
    const named = DEMO_PLAN_TASKS.filter(
      t =>
        t.company === SG &&
        t.contact !== null &&
        count(t.contact) === 1 &&
        !/^(Directeur|Responsable|Architecte)/.test(t.contact) &&
        t.dueInDays !== null &&
        t.executionStatus !== 'done',
    )
    expect(named.length).toBeGreaterThanOrEqual(2)
  })
})
