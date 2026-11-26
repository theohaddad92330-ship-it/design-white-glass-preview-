import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_CHAT_TALENT_TERRITORY_COVERAGE } from './demo-coverage'
import { DEMO_CONSULTANTS, DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * #2337 — « et en démonstration, le terrain de jeu multi-talents se voit-il ? »
 *
 * Une classification affirme ; ce spec confronte. Chaque fait que l'amorce
 * `p-territory-plan` affiche doit exister dans le jeu seedé : sinon la salle
 * montrerait à un prospect un profil, un besoin ou une compétence qu'aucun
 * écran de la démo ne contient.
 */
const SCRIPT = join(__dirname, '..', '..', '..', '..', 'web', 'src', 'features', 'demo', 'demo-chat-script.ts')

function amorce(): string {
  const text = readFileSync(SCRIPT, 'utf8')
  const start = text.indexOf("id: 'p-territory-plan'")
  expect(start).toBeGreaterThan(-1)
  const end = text.indexOf("id: 'p-", start + 10)
  return text.slice(start, end === -1 ? undefined : end)
}

const AVAILABILITY_LABELS: Record<string, string> = {
  immediate: 'disponible immédiatement',
  sous_1_mois: 'libre sous un mois',
}

// L'entrée scriptée : qui, sur quel besoin, avec quelles compétences citées.
const PAIRS = [
  { talent: 'Camille Roussel', need: 'Ingénieur infrastructure — socle conteneurisé du portail' },
  { talent: 'Inès Kaczmarek', need: 'Consultant sécurité applicative — parcours d’authentification' },
  { talent: 'Marc Ouedraogo', need: 'Ingénieur systèmes — supervision des systèmes temps réel' },
]

describe('DEMO_CHAT_TALENT_TERRITORY_COVERAGE (#2337)', () => {
  it('est classé SEEDÉ', () => {
    expect(DEMO_CHAT_TALENT_TERRITORY_COVERAGE.state).toBe('seede')
  })

  it.each(PAIRS)('$talent existe au vivier, avec la disponibilité et la zone affichées', ({ talent }) => {
    const consultant = DEMO_CONSULTANTS.find(c => c.full_name === talent)
    expect(consultant).toBeDefined()
    const text = amorce()
    expect(text).toContain(AVAILABILITY_LABELS[consultant!.availability])
    expect(text).toContain(consultant!.zones.join(', '))
  })

  it.each(PAIRS)('« $need » est un besoin OUVERT du client d’exemple, couvert par $talent', ({ talent, need }) => {
    expect(DEMO_DELIVERY_CLIENT.account.company_name).toBe('SNCF')
    const seeded = DEMO_DELIVERY_CLIENT.openNeeds.find(n => n.title === need)
    expect(seeded).toBeDefined()
    const consultant = DEMO_CONSULTANTS.find(c => c.full_name === talent)!
    const stack = consultant.stack.map(s => s.toLowerCase())
    const required = seeded!.skills.filter(s => s.required).map(s => s.term.toLowerCase())
    // Toutes les compétences OBLIGATOIRES sont au profil : la compatibilité n'est pas inventée.
    expect(required.every(term => stack.includes(term))).toBe(true)
  })

  it('les compétences citées pour le talent d’entrée sont au profil ET au besoin', () => {
    const text = amorce()
    expect(text).toContain('couvre Kubernetes, Terraform')
    const camille = DEMO_CONSULTANTS.find(c => c.full_name === 'Camille Roussel')!
    const need = DEMO_DELIVERY_CLIENT.openNeeds.find(n => n.title === PAIRS[0]!.need)!
    for (const term of ['Kubernetes', 'Terraform']) {
      expect(camille.stack).toContain(term)
      expect(need.skills.map(s => s.term)).toContain(term)
    }
  })

  it('sait dire NON : un besoin qui n’est pas au jeu n’est pas trouvé', () => {
    expect(DEMO_DELIVERY_CLIENT.openNeeds.find(n => n.title === 'Expert GRC — besoin inventé')).toBeUndefined()
  })

  it('ne promet ni probabilité ni création', () => {
    const text = amorce()
    expect(text).not.toMatch(/probabilit|chances? de (signer|gagner)|%/i)
    expect(text).toContain('Rien n’est créé')
  })
})
