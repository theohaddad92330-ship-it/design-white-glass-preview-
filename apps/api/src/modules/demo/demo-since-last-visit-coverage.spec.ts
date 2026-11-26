import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SINCE_LAST_VISIT_LINES } from '@bellum/contracts'
import { DEMO_SINCE_LAST_VISIT_LINES } from './demo-coverage'

/**
 * « Et en démonstration, ces six lignes montrent quoi ? »
 *
 * La garde PAR TABLE ne pose pas la question : les six lignes de « ce qui a
 * bougé depuis ta dernière visite » n'ajoutent aucune table, elles lisent
 * `signal_history`, `activities`, `interventions`, `attack_angles` et
 * `routine_runs`. C'est
 * exactement le silence qui fait découvrir un bloc vide en réunion plutôt qu'en
 * CI — et ce bloc a déjà été marqué « branché et vu à l'écran » alors que son
 * contenu n'existait pas.
 *
 * Ce que cette garde prouve, en plus de la couverture :
 *  - elle LIT un corpus non vide (les cinq lignes du contrat) ;
 *  - elle sait dire NON (une ligne ajoutée au contrat sans décision de démo, ou
 *    une justification vide, la font rougir) ;
 *  - elle refuse une justification qui décrit un ÉTAT du semis plutôt qu'une
 *    RÈGLE — c'est la faute qui rend une entrée fausse au semis suivant.
 */
describe('couverture démo — les six lignes « depuis ta dernière visite »', () => {
  it('lit un corpus NON VIDE — sans lui, la garde passerait au vert sur du vide', () => {
    expect(SINCE_LAST_VISIT_LINES.length).toBe(6)
    expect(Object.keys(DEMO_SINCE_LAST_VISIT_LINES).length).toBeGreaterThan(0)
  })

  it('classe CHAQUE ligne du contrat : seedée, ou vide à dessein avec sa raison', () => {
    // Si ce test tombe : une ligne a été ajoutée au contrat sans que personne
    // ait répondu « et en démonstration, ça montre quoi ? ».
    expect(Object.keys(DEMO_SINCE_LAST_VISIT_LINES).sort()).toEqual([...SINCE_LAST_VISIT_LINES].sort())
  })

  it('ne garde pas de justification périmée — une ligne disparue du contrat ment sur le produit', () => {
    const known = new Set<string>(SINCE_LAST_VISIT_LINES)
    expect(Object.keys(DEMO_SINCE_LAST_VISIT_LINES).filter(key => !known.has(key))).toEqual([])
  })

  it('exige une raison SUBSTANTIELLE pour chaque ligne laissée vide', () => {
    // Une raison doit tenir devant quelqu'un qui présente le produit. Une
    // phrase de trois mots ne tient pas — et « ⚠️ Ne JAMAIS déplacer une
    // entrée ici pour faire passer le test » est la règle de tout ce fichier.
    // Le nom de la ligne fautive est DANS la valeur comparée : sans lui, un
    // échec dirait « false n'est pas true » et il faudrait le déboguer.
    const tooShort = Object.entries(DEMO_SINCE_LAST_VISIT_LINES)
      .filter(([, entry]) => entry.state !== 'seede' && entry.reason.length <= 200)
      .map(([kind]) => kind)
    expect(tooShort).toEqual([])
  })

  it('la raison est une RÈGLE : elle NOMME ce dont la ligne dérive', () => {
    // Une justification qui décrit l'état du semis (« la table est vide »)
    // meurt au premier changement de semis. Celle qui NOMME la source dérivée
    // reste vraie, et la ligne s'allume toute seule le jour où la source parle.
    const sources: Record<string, RegExp> = {
      account_signals: /signal_history/,
      replies_received: /activities/,
      job_changes: /contactSourceTag/,
      missions_moving: /interventions/,
      attack_angles_added: /attack_angles|attackAngles/,
      night_routines_run: /RoutineRunEntity|routine_runs/,
    }
    const silent = Object.entries(sources)
      .filter(([kind, pattern]) => !pattern.test(DEMO_SINCE_LAST_VISIT_LINES[kind]?.reason ?? ''))
      .map(([kind]) => kind)
    expect(silent).toEqual([])
  })

  it('les cinq tables invoquées sont bien celles que le service LIT', () => {
    // Une raison de démo qui nomme une table que le code ne lit plus est un
    // audit documentaire, pas le code. On relit la source.
    const service = readFileSync(join(__dirname, '..', 'briefing', 'briefing.service.ts'), 'utf8')
    expect(service).toContain('signalsDetectedSince')
    expect(service).toContain("direction: 'inbound'")
    expect(service).toContain('contactSourceTag')
    expect(service).toContain('RENEWAL_AT_RISK')
    expect(service).toContain('this.attackAngles.count')
    expect(service).toContain('this.routineRuns.count')
  })
})
