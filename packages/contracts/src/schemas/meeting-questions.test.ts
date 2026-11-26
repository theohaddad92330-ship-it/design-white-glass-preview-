import { describe, expect, it } from 'vitest'
import {
  CALL_GOLDEN_RULE,
  CALL_PREP_CHECKLIST,
  CALL_STEP_GUIDES,
  CALL_STEPS,
  DEFENSE_BLOCKS,
  DEFENSE_CONDUCT_RULES,
  DEFENSE_QUESTIONS,
  DISCOVERY_FAMILIES,
  DISCOVERY_QUESTIONS,
  QUESTION_SELECTION_MAX,
  QUESTION_SELECTION_MIN,
  selectQuestions,
} from './meeting-questions.js'

describe('les trois banques sont réellement là', () => {
  it('la découverte porte ses douze familles, chacune non vide', () => {
    expect(DISCOVERY_FAMILIES).toHaveLength(12)
    for (const family of DISCOVERY_FAMILIES) {
      expect(DISCOVERY_QUESTIONS[family].length).toBeGreaterThan(0)
      for (const question of DISCOVERY_QUESTIONS[family]) expect(question.trim().endsWith('?')).toBe(true)
    }
  })

  /* ═══════════════════════════════════════════════════════════════════════
   * GA-142 — les trois familles manquantes (M2).
   *
   * `04 §6` de la source de récupération nommait 12 familles ; le dépôt n'en
   * portait que 9 (`recovery-juin-2026-2026-08-24.md`, item 13 — clos par un
   * « LIVRÉ » qui ne nommait pas les 3 manquantes : T-159 / T-185 du recomptage
   * du 30/08, `agent_docs/iteration-3-trous-2026-08-30.md:507,538`).
   *
   * Le JSON source (`08/meeting_question_library.json`) qui portait le texte
   * ORIGINAL des 12 familles n'existe plus sur ce disque — c'était un extrait
   * Drive éphémère. Le contenu ci-dessous vient donc d'une AUTRE source du
   * dépôt, réellement présente : les fiches méthode commerciale
   * (`agent_docs/kb/pitch-telephonique.md`, `agent_docs/kb/bible-sales-hacks.md`)
   * — verbatim, jamais inventé. `enjeux_priorites` n'a qu'UNE question : c'est
   * tout ce que ces fiches contiennent sur ce thème précis, adressé au
   * prospect ; le reste (checklists internes « avons-nous… ») ne l'est pas et
   * n'a pas été détourné pour gonfler le compte.
   * ═══════════════════════════════════════════════════════════════════════ */
  it('GA-142 — les 9 familles historiques sont INCHANGÉES, les 3 nouvelles sont à la FIN (GA-08)', () => {
    // Preuve que la garde LIT quelque chose : un ordre figé, pas juste une
    // longueur — un renommage furtif d'une des 9 familles passerait la seule
    // assertion `toHaveLength`.
    expect(DISCOVERY_FAMILIES.slice(0, 9)).toEqual([
      'context',
      'role_scope',
      'pain_consequence',
      'project_mission',
      'organization',
      'decision_procurement',
      'success',
      'close',
      'submission_feedback',
    ])
    expect(DISCOVERY_FAMILIES.slice(9)).toEqual(['stakes_priorities', 'budget_timing_urgency', 'objections_risks'])
  })

  it('GA-142 — le contenu des 3 nouvelles familles est VÉRIFIABLE, pas juste non-vide', () => {
    // Preuve que la garde sait dire NON : ces chaînes sont copiées mot pour mot
    // depuis les fiches source. Un bloc qui écrirait son propre texte (ou du
    // texte générique) casserait cette assertion, alors qu'un simple
    // `.length > 0` l'aurait laissé passer.
    expect(DISCOVERY_QUESTIONS.stakes_priorities).toContain('Avez-vous une visibilité claire sur votre roadmap 2026 ?')
    expect(DISCOVERY_QUESTIONS.budget_timing_urgency).toContain('Quel est votre budget cible ?')
    expect(DISCOVERY_QUESTIONS.budget_timing_urgency).toContain(
      'D’ici 6 mois, si vous deviez renforcer votre équipe, quel profil manquerait en premier ?',
    )
    expect(DISCOVERY_QUESTIONS.objections_risks).toContain('Qu’est-ce qui vous a le plus déçu ?')
    expect(DISCOVERY_QUESTIONS.objections_risks).toContain('Quel critère a bloqué ?')
  })

  it('GA-142 — aucune des nouvelles questions ne recopie une question déjà présente ailleurs', () => {
    // Une bonne extraction ne duplique pas une famille existante sous un autre
    // nom (loi 4 : rien n'apparaît deux fois sous la même forme).
    const existing = new Set([
      ...DISCOVERY_FAMILIES.slice(0, 9).flatMap(f => DISCOVERY_QUESTIONS[f]),
      ...DEFENSE_BLOCKS.flatMap(b => DEFENSE_QUESTIONS[b]),
    ])
    const added = ['stakes_priorities', 'budget_timing_urgency', 'objections_risks'] as const
    for (const family of added) {
      for (const question of DISCOVERY_QUESTIONS[family]) expect(existing.has(question)).toBe(false)
    }
  })

  it('la soutenance porte ses cinq blocs et ses 25 questions', () => {
    expect(DEFENSE_BLOCKS).toHaveLength(5)
    const total = DEFENSE_BLOCKS.reduce((sum, block) => sum + DEFENSE_QUESTIONS[block].length, 0)
    expect(total).toBe(25)
    // Cinq blocs de cinq : le document en fait un point, et un bloc à trois
    // questions signalerait une extraction incomplète.
    for (const block of DEFENSE_BLOCKS) expect(DEFENSE_QUESTIONS[block]).toHaveLength(5)
  })

  it('la soutenance porte aussi ses trois règles de conduite — elles ne sont pas des questions', () => {
    expect(DEFENSE_CONDUCT_RULES).toHaveLength(3)
    for (const rule of DEFENSE_CONDUCT_RULES) expect(rule.trim().endsWith('?')).toBe(false)
  })

  it("l'appel porte ses cinq temps, sa checklist en huit points et sa règle d'or", () => {
    expect(CALL_STEPS).toHaveLength(5)
    for (const step of CALL_STEPS) {
      expect(CALL_STEP_GUIDES[step].goal.trim().length).toBeGreaterThan(0)
      expect(CALL_STEP_GUIDES[step].move.trim().length).toBeGreaterThan(0)
    }
    expect(CALL_PREP_CHECKLIST).toHaveLength(8)
    expect(CALL_GOLDEN_RULE).toContain('action concrète')
  })

  it('aucune banque ne porte de réplique à réciter — seulement des questions', () => {
    // Le guide d'appel range « dérouler son pitch sans créer d'échange » dans ses
    // « à éviter ». Recopier ses réponses-types en ferait exactement cela.
    const everything = [
      ...DISCOVERY_FAMILIES.flatMap(f => DISCOVERY_QUESTIONS[f]),
      ...DEFENSE_BLOCKS.flatMap(b => DEFENSE_QUESTIONS[b]),
    ]
    for (const question of everything) expect(question.trim().endsWith('?')).toBe(true)
  })
})

describe('selectQuestions — on sélectionne, on ne récite pas', () => {
  const bank = { a: ['a1', 'a2', 'a3'], b: ['b1', 'b2'], c: ['c1'] }

  it('couvre les familles AVANT d’approfondir', () => {
    // Trois familles, limite 3 : une question par famille, pas trois de la même.
    expect(selectQuestions({ families: ['a', 'b', 'c'], bank, limit: 3 })).toEqual(['a1', 'b1', 'c1'])
  })

  it('approfondit ensuite, famille par famille, dans le même ordre', () => {
    expect(selectQuestions({ families: ['a', 'b', 'c'], bank, limit: 5 })).toEqual(['a1', 'b1', 'c1', 'a2', 'b2'])
  })

  it('saute une famille DÉJÀ renseignée — reposer une question dit qu’on n’a pas écouté', () => {
    const picked = selectQuestions({ families: ['a', 'b', 'c'], bank, answered: ['a'], limit: 4 })
    expect(picked).not.toContain('a1')
    expect(picked).not.toContain('a2')
    expect(picked).toEqual(['b1', 'c1', 'b2'])
  })

  it('rend une liste VIDE quand tout est renseigné — et ce n’est pas un bug', () => {
    // Retomber sur la banque entière ici ferait exactement ce que la règle
    // interdit : afficher tout, faute d'avoir su quoi choisir.
    expect(selectQuestions({ families: ['a', 'b'], bank, answered: ['a', 'b'] })).toEqual([])
  })

  it('ramène la limite dans [3, 8], quoi qu’on lui demande', () => {
    const full = { x: Array.from({ length: 20 }, (_, i) => `x${i}`) }
    expect(selectQuestions({ families: ['x'], bank: full, limit: 0 })).toHaveLength(QUESTION_SELECTION_MIN)
    expect(selectQuestions({ families: ['x'], bank: full, limit: 99 })).toHaveLength(QUESTION_SELECTION_MAX)
  })

  it('s’arrête quand la banque est épuisée, sans boucler', () => {
    expect(selectQuestions({ families: ['c'], bank, limit: 8 })).toEqual(['c1'])
  })

  it('est DÉTERMINISTE — deux commerciaux qui préparent le même rendez-vous voient la même liste', () => {
    const once = selectQuestions({ families: [...DISCOVERY_FAMILIES], bank: DISCOVERY_QUESTIONS, limit: 6 })
    const twice = selectQuestions({ families: [...DISCOVERY_FAMILIES], bank: DISCOVERY_QUESTIONS, limit: 6 })
    expect(once).toEqual(twice)
    expect(once).toHaveLength(6)
  })

  it('ne rend JAMAIS la banque entière — c’est la règle qui porte tout le module', () => {
    const everything = selectQuestions({ families: [...DISCOVERY_FAMILIES], bank: DISCOVERY_QUESTIONS, limit: 99 })
    const bankSize = DISCOVERY_FAMILIES.reduce((sum, f) => sum + DISCOVERY_QUESTIONS[f].length, 0)
    expect(everything.length).toBeLessThan(bankSize)
    expect(everything.length).toBeLessThanOrEqual(QUESTION_SELECTION_MAX)
  })
})
