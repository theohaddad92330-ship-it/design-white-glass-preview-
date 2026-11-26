import { describe, expect, it } from 'vitest'
import { emptyFor, isSatisfied, validate } from './validation'
import type { Question } from './questions'

// #2059.7 — une question facultative ne bloque jamais l'avancement, même
// vide. `isSatisfied` est le SEUL endroit qui porte ce contournement — le
// test qui prouve qu'on peut avancer sans répondre.

const optionalQuestion: Question = {
  key: 'heard_about_bellum',
  kind: 'single',
  label: 'questions.heardAboutBellum.label',
  choices: [{ value: 'Recommandation' }, { value: 'Autre' }],
  optional: true,
}

const requiredQuestion: Question = {
  key: 'sales_team_size',
  kind: 'single',
  label: 'questions.salesTeamSize.label',
  choices: [{ value: 'Je suis seul (fondateur / indépendant)' }],
}

describe('#2059.7 — isSatisfied laisse avancer une question facultative vide', () => {
  it('une question facultative vide est satisfaite — « Continuer » ne se bloque pas', () => {
    expect(isSatisfied(optionalQuestion, '')).toBe(true)
  })

  it('une question facultative répondue reste satisfaite', () => {
    expect(isSatisfied(optionalQuestion, 'Recommandation')).toBe(true)
  })

  it('une question NON facultative vide reste bloquante — le comportement historique ne bouge pas', () => {
    expect(isSatisfied(requiredQuestion, '')).toBe(false)
    expect(validate(requiredQuestion, '')).toBe(false)
  })

  it('`validate` seul continue de dire la vérité sur une question facultative vide (relecture honnête)', () => {
    // #2027.2/#2059.7 (registre) — la relecture et la barre de progression ne
    // doivent pas confondre « facultative, jamais bloquante » avec
    // « répondue » : c'est pour ça que le contournement vit dans
    // `isSatisfied`, jamais dans `validate`.
    expect(validate(optionalQuestion, '')).toBe(false)
  })
})

// #2088.12 (DÉCISION Louis 18/09, point 16) — le kind `number` n'est ni un
// texte ni une liste : avant ce lot, `isListQuestion` (interne) l'aurait
// classé « liste » par défaut (tout ce qui n'est ni `text` ni `single`), et
// `emptyFor`/`validate` auraient traité une réponse numérique comme un
// tableau — un champ qui n'existait pas encore quand ces deux fonctions ont
// été écrites.
const numberQuestion: Question = {
  key: 'consultant_count',
  kind: 'number',
  label: 'questions.consultantCount.label',
  unitKey: 'questions.consultantCount.unit',
}

describe('#2088.12 — le kind `number` se comporte comme `text`, pas comme une liste', () => {
  it('`emptyFor` rend une chaîne vide, jamais un tableau', () => {
    expect(emptyFor(numberQuestion)).toBe('')
  })

  it('`validate` accepte un nombre entier saisi en chaîne', () => {
    expect(validate(numberQuestion, '7')).toBe(true)
    expect(validate(numberQuestion, '0')).toBe(true)
  })

  it('`validate` refuse une chaîne vide ou non numérique', () => {
    expect(validate(numberQuestion, '')).toBe(false)
    expect(validate(numberQuestion, 'abc')).toBe(false)
  })

  it('`isSatisfied` laisse avancer une question `number` optionnelle vide', () => {
    const optionalNumber: Question = { ...numberQuestion, optional: true }
    expect(isSatisfied(optionalNumber, '')).toBe(true)
  })
})
