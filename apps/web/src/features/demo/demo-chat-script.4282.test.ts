import { describe, expect, it } from 'vitest'
import { demoTurn } from '@/features/chat/api/demo-turn'

/** #4282.13 — « radar SAP » posé à Laura en salle rend les sept blocs, sans probabilité ni source nommée. */
describe('#4282.13 — le radar SAP de Laura en salle de démonstration', () => {
  const reply = demoTurn('Fais-moi un radar SAP France', 'REPLI').reply

  it('rend les sept blocs dans l’ordre et renvoie au même radar dans Découvrir', () => {
    const blocks = [
      'Missions plaçables maintenant',
      'Comptes les plus chauds',
      'Routes de rang 2',
      'Besoins historiques',
      'Relais et prescripteurs',
      'Empreinte par compte',
      'Classement en trois poches',
    ]
    const positions = blocks.map(block => reply.indexOf(block))
    expect(positions.every(p => p >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(reply).toContain('/discover/radar?technology=SAP')
    expect(reply).toContain('la cible est le publieur')
    expect(reply).toContain('à revalider')
  })

  it('sait dire NON : aucune probabilité, aucune source nommée', () => {
    expect(reply).not.toMatch(/%|probab|dataforge|orion|france travail|boamp|decp/i)
    expect(demoTurn('Fais-moi un radar Cobol', 'REPLI').reply).toBe('REPLI')
  })
})
