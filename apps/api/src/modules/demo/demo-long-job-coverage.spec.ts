import { LONG_JOB_SPECS, contactVerificationLine, longJobProgressSentence } from '../action-os/long-job-catalog'
import { DEMO_COPILOT_DONE_JOB, DEMO_COPILOT_LONG_JOB, DEMO_DOSSIERS } from './demo-dataset'
import { densifiedContactsFor } from './demo-contact-density'

/**
 * #1952 — LE TRAVAIL LONG DE LA SALLE DE DÉMONSTRATION (craft rule n°9).
 *
 * Ce que cette garde refuse, et qui est déjà arrivé ici :
 *  - un semis qui SAUTE PROPREMENT — le nom de société du suivi n'est pas celui
 *    d'un dossier semé, `accountIds.get()` rend `undefined`, la ligne part avec
 *    `account_id: null` et personne ne tombe ;
 *  - un avancement qui n'en est pas un — la phrase serait `null`, le semis
 *    retomberait sur « Analyse lancée. », et la démonstration ne montrerait
 *    justement pas ce que #1952 promet ;
 *  - un POURCENTAGE, sous quelque forme que ce soit (#1952.35).
 */
describe('le travail long semé en démonstration', () => {
  it('vise une société RÉELLEMENT semée — sinon la ligne part sans compte et rien ne tombe', () => {
    const companies = DEMO_DOSSIERS.map(dossier => dossier.account.company_name)
    expect(companies.length).toBeGreaterThan(0)
    expect(companies).toContain(DEMO_COPILOT_LONG_JOB.company)
  })

  it('montre un travail EN VOL : des étapes franchies, et pas toutes', () => {
    expect(DEMO_COPILOT_LONG_JOB.phases_done).toBeGreaterThan(0)
    expect(DEMO_COPILOT_LONG_JOB.phases_done).toBeLessThan(DEMO_COPILOT_LONG_JOB.phases_total)
    expect(DEMO_COPILOT_LONG_JOB.minutes_ago).toBeGreaterThan(0)
  })

  it('produit une phrase d’avancement MESURÉE, et aucun pourcentage', () => {
    const sentence = longJobProgressSentence(
      LONG_JOB_SPECS.account_analysis,
      DEMO_COPILOT_LONG_JOB.phases_done,
      DEMO_COPILOT_LONG_JOB.phases_total,
    )
    expect(sentence).not.toBeNull()
    expect(sentence).toContain('étapes sur')
    expect(sentence).not.toContain('%')
  })

  it('le coût affiché est le débit du LANCEMENT, pas un forfait inventé', () => {
    expect(Number.isInteger(DEMO_COPILOT_LONG_JOB.spent_credits)).toBe(true)
    expect(DEMO_COPILOT_LONG_JOB.spent_credits).toBeGreaterThan(0)
    expect(DEMO_COPILOT_LONG_JOB.spent_credits).toBe(DEMO_COPILOT_LONG_JOB.estimated_credits)
  })
})

/**
 * #1952.32 (#2844, lot h9 27/09/2026) — LA TROISIÈME CARTE, LA SEULE `done`,
 * POUR QUE « CE QUI DOIT ÊTRE VÉRIFIÉ » SE MONTRE ENFIN EN SALLE.
 *
 * Ce que cette garde refuse :
 *  - une carte `done` sur un compte SANS contact `email_confidence`
 *    medium/low — `toVerify` resterait vide et la ligne ne se montrerait
 *    jamais, exactement le trou que ce lot referme ;
 *  - une carte `done` visant le MÊME compte qu'une des deux autres cartes
 *    (deux analyses du même compte n'arrive pas — le suivi est unique par
 *    lancement).
 */
describe('la troisième carte de suivi (done) — CardResult.toVerify', () => {
  it('vise une société RÉELLEMENT semée, distincte des deux autres cartes', () => {
    const companies = DEMO_DOSSIERS.map(dossier => dossier.account.company_name)
    expect(companies).toContain(DEMO_COPILOT_DONE_JOB.company)
    expect(DEMO_COPILOT_DONE_JOB.company).not.toBe(DEMO_COPILOT_LONG_JOB.company)
  })

  it('montre un travail ARRIVÉ, pas un vol en cours', () => {
    expect(DEMO_COPILOT_DONE_JOB.phases_done).toBe(DEMO_COPILOT_DONE_JOB.phases_total)
    expect(DEMO_COPILOT_DONE_JOB.spent_credits).toBe(DEMO_COPILOT_DONE_JOB.estimated_credits)
  })

  it('son compte porte au moins un contact medium/low — sinon toVerify resterait vide', () => {
    const lines = densifiedContactsFor(DEMO_COPILOT_DONE_JOB.company)
      .map(contact => contactVerificationLine(contact.full_name, contact.email_confidence))
      .filter((line): line is string => line !== null)
    expect(lines.length).toBeGreaterThan(0)
  })
})
