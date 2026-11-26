import { describe, expect, it } from 'vitest'
import {
  minDelayBeforeStep,
  OUTREACH_KILLER_MISTAKES,
  OUTREACH_PERSONA_PROFILES,
  OUTREACH_SCENARIO_IDS,
  OUTREACH_SCENARIOS,
  OUTREACH_WRITING_RULES,
  personaForHierarchyLevel,
  scenarioForRelationship,
} from './outreach-scenarios.js'
import { preSendCheck, preSendFailures, type PreSendCheckItem } from './pre-send-check.js'

const verdict = (items: PreSendCheckItem[], id: string) => items.find(item => item.id === id)?.verdict
const detail = (items: PreSendCheckItem[], id: string) => items.find(item => item.id === id)?.detail ?? ''
const mistake = (items: PreSendCheckItem[], id: string) => items.find(item => item.id === id)?.mistake

/** Un message qui passe les huit points — la base de comparaison. */
const CLEAN = {
  body: 'Bonjour Marie, vu votre migration Kubernetes annoncée en juin. Comment gérez-vous la montée en charge ?',
  step: 1,
  sellerCompany: 'Acme Conseil',
}

describe('le registre de scénarios est réellement là', () => {
  it('porte les quatre scénarios, chacun avec sa cadence et ses interdits', () => {
    expect(OUTREACH_SCENARIO_IDS).toHaveLength(4)
    for (const id of OUTREACH_SCENARIO_IDS) {
      const scenario = OUTREACH_SCENARIOS[id]
      expect(scenario.id).toBe(id)
      expect(scenario.allowedChannels.length).toBeGreaterThan(0)
      expect(scenario.firstStepRules.length).toBeGreaterThan(0)
      expect(scenario.minDelayDays.length).toBe(scenario.maxSteps)
      // Une réponse arrête TOUJOURS une séquence. Ce n'est pas un réglage.
      expect(scenario.stopOnReply).toBe(true)
    }
  })

  it('le premier pas part le jour même, les suivants JAMAIS', () => {
    for (const id of OUTREACH_SCENARIO_IDS) {
      const scenario = OUTREACH_SCENARIOS[id]
      expect(minDelayBeforeStep(scenario, 0)).toBe(0)
      for (let position = 1; position < scenario.maxSteps; position += 1) {
        expect(minDelayBeforeStep(scenario, position)).toBeGreaterThan(0)
      }
    }
  })

  it('un pas au-delà de la cadence garde le dernier délai — il ne retombe pas à zéro', () => {
    expect(minDelayBeforeStep(OUTREACH_SCENARIOS.cold_approach, 9)).toBe(7)
  })

  it('un état de relation inconnu ne se voit PAS attribuer un scénario approchant', () => {
    expect(scenarioForRelationship('froid')?.id).toBe('cold_approach')
    expect(scenarioForRelationship('refere')?.id).toBe('referred_contact')
    // Un client actif n'est aucun des quatre : lui appliquer la cadence d'un
    // inconnu serait pire que de ne rien proposer.
    expect(scenarioForRelationship('client_actif')).toBeNull()
    expect(scenarioForRelationship(null)).toBeNull()
  })

  it('un palier inconnu ne se voit PAS attribuer un persona', () => {
    expect(personaForHierarchyLevel('c_level')).toBe('decideur')
    expect(personaForHierarchyLevel('management')).toBe('manager')
    expect(personaForHierarchyLevel('operationnel')).toBe('operationnel')
    expect(personaForHierarchyLevel('unknown')).toBeNull()
    expect(personaForHierarchyLevel('')).toBeNull()
  })

  it('les quatorze règles et les six erreurs sont là, avec des identifiants uniques', () => {
    // #2123.74/.76/.78/.79 — huit règles du document source, plus les quatre
    // interdits de ton du premier message, plus #2371.7 (catalogue technique
    // au décideur), plus #2372.6 (le document utile s'annonce, il ne se joint pas).
    expect(OUTREACH_WRITING_RULES).toHaveLength(14)
    expect(OUTREACH_KILLER_MISTAKES).toHaveLength(6)
    expect(new Set(OUTREACH_WRITING_RULES.map(r => r.id)).size).toBe(14)
    expect(new Set(OUTREACH_KILLER_MISTAKES.map(m => m.id)).size).toBe(6)
  })
})

describe('#2123.74/.76/.78/.79 — le premier message tient ses interdits de ton', () => {
  it('#2123.74 — nomme un contexte réel : cité ⇒ conforme, connu mais absent ⇒ échec', () => {
    const cited = preSendCheck({ ...CLEAN, realContext: ['migration Kubernetes'] })
    expect(verdict(cited, 'names_real_context')).toBe('pass')
    expect(detail(cited, 'names_real_context')).toContain('migration Kubernetes')

    const generic = preSendCheck({
      ...CLEAN,
      body: 'Bonjour Marie, comment gérez-vous vos projets en ce moment ?',
      realContext: ['migration Kubernetes', 'recrutement de 12 développeurs'],
    })
    expect(verdict(generic, 'names_real_context')).toBe('fail')
    // L'échec dit QUOI citer — le dossier a de la matière, le brouillon ne la prend pas.
    expect(detail(generic, 'names_real_context')).toContain('recrutement de 12 développeurs')
    expect(mistake(generic, 'names_real_context')).toBe('Envoyer le même message à tout le monde.')
  })

  it('#2123.74 — sans élément réel connu, il le DIT : ni conforme, ni échec', () => {
    expect(verdict(preSendCheck(CLEAN), 'names_real_context')).toBe('not_checkable')
    expect(verdict(preSendCheck({ ...CLEAN, realContext: [] }), 'names_real_context')).toBe('not_checkable')
    // Une valeur vide ne compte pas comme un élément : "" est inclus dans tout texte.
    expect(verdict(preSendCheck({ ...CLEAN, realContext: ['  '] }), 'names_real_context')).toBe('not_checkable')
  })

  it('#2123.76 — le premier message ne déroule pas toute l’offre de l’ESN, et seulement le premier', () => {
    const pitch = 'Bonjour Marie, nous intervenons sur le cloud, la data et la cybersécurité. Un besoin ?'
    const first = preSendCheck({ ...CLEAN, body: pitch })
    expect(verdict(first, 'no_full_offer_pitch')).toBe('fail')
    expect(detail(first, 'no_full_offer_pitch')).toContain('nous intervenons sur')
    expect(mistake(first, 'no_full_offer_pitch')).toBe('Parler de soi avant de parler de l’autre.')
    expect(verdict(preSendCheck({ ...CLEAN, body: pitch, step: 2 }), 'no_full_offer_pitch')).toBe('pass')
    expect(verdict(preSendCheck(CLEAN), 'no_full_offer_pitch')).toBe('pass')
  })

  it('#2123.78 — aucune fausse urgence, à n’importe quel rang', () => {
    const rushed = 'Bonjour Marie, dernière chance : nos consultants partent vite. Un échange ?'
    expect(verdict(preSendCheck({ ...CLEAN, body: rushed }), 'no_false_urgency')).toBe('fail')
    expect(verdict(preSendCheck({ ...CLEAN, body: rushed, step: 3 }), 'no_false_urgency')).toBe('fail')
    expect(detail(preSendCheck({ ...CLEAN, body: rushed }), 'no_false_urgency')).toContain('dernière chance')
    // Aucune des six erreurs n'est une fausse urgence : la liste est fermée.
    expect(mistake(preSendCheck({ ...CLEAN, body: rushed }), 'no_false_urgency')).toBeUndefined()
    expect(verdict(preSendCheck(CLEAN), 'no_false_urgency')).toBe('pass')
  })

  it('#2123.79 — aucune observation historique inquiétante en accroche du premier message', () => {
    const alarm = 'Bonjour Marie, après le plan social de 2023, comment se porte votre DSI ?'
    const first = preSendCheck({ ...CLEAN, body: alarm })
    expect(verdict(first, 'no_worrying_history')).toBe('fail')
    expect(detail(first, 'no_worrying_history')).toContain('plan social')
    expect(verdict(preSendCheck({ ...CLEAN, body: alarm, step: 2 }), 'no_worrying_history')).toBe('pass')
    expect(verdict(preSendCheck(CLEAN), 'no_worrying_history')).toBe('pass')
  })

  it('témoin : un message propre et sourcé ne déclenche aucun des quatre', () => {
    const items = preSendCheck({ ...CLEAN, realContext: ['migration Kubernetes'] })
    for (const id of ['names_real_context', 'no_full_offer_pitch', 'no_false_urgency', 'no_worrying_history']) {
      expect(verdict(items, id), id).toBe('pass')
    }
    // « rapidement » et « notre échange » ne sont ni une urgence ni un catalogue.
    const neighbour = preSendCheck({
      ...CLEAN,
      body: 'Bonjour Marie, vu votre migration Kubernetes. Avez-vous pu stabiliser rapidement notre échange de juin ?',
    })
    expect(verdict(neighbour, 'no_false_urgency')).toBe('pass')
    expect(verdict(neighbour, 'no_full_offer_pitch')).toBe('pass')
  })
})

describe('preSendCheck — quatorze points, toujours quatorze', () => {
  it('rend les quatorze lignes, y compris celles qu’il ne sait pas vérifier', () => {
    const items = preSendCheck(CLEAN)
    expect(items).toHaveLength(14)
    expect(items.map(i => i.id)).toEqual(OUTREACH_WRITING_RULES.map(r => r.id))
    // Aucune ligne muette : un contrôle sans explication n'apprend rien.
    for (const item of items) expect(item.detail.trim().length).toBeGreaterThan(0)
  })

  it('un message propre ne déclenche aucun échec', () => {
    expect(preSendFailures(preSendCheck(CLEAN))).toHaveLength(0)
  })

  it('attrape la variable partie telle quelle — l’accident le plus coûteux', () => {
    const items = preSendCheck({ ...CLEAN, body: 'Bonjour {{Prénom}}, comment allez-vous ?' })
    expect(verdict(items, 'variables_filled')).toBe('fail')
    expect(detail(items, 'variables_filled')).toContain('{{Prénom}}')
  })

  it('compte les mots et dit de combien on dépasse', () => {
    const long = `${'mot '.repeat(220)}Une question ?`
    const items = preSendCheck({ ...CLEAN, body: long })
    expect(verdict(items, 'under_200_words')).toBe('fail')
    expect(detail(items, 'under_200_words')).toContain('de trop')
  })

  it('un message sans question n’a rien à quoi répondre', () => {
    const items = preSendCheck({ ...CLEAN, body: 'Bonjour Marie, votre migration est intéressante.' })
    expect(verdict(items, 'easy_question')).toBe('fail')
  })

  it('une question qui ne se répond pas en une phrase est signalée', () => {
    const items = preSendCheck({
      ...CLEAN,
      body: `Bonjour, ${'comment exactement '.repeat(12)}procédez-vous ?`,
    })
    expect(verdict(items, 'easy_question')).toBe('fail')
  })

  it('nomme le jargon plutôt que de dire « trop commercial »', () => {
    const items = preSendCheck({
      ...CLEAN,
      body: 'Bonjour, nos expertises reconnues et notre méthodologie éprouvée. Un avis ?',
    })
    expect(verdict(items, 'no_esn_jargon')).toBe('fail')
    expect(detail(items, 'no_esn_jargon')).toContain('expertises reconnues')
  })

  it('le premier message ne se présente pas — et seulement le premier', () => {
    const withCompany = { ...CLEAN, body: 'Bonjour, je travaille chez Acme Conseil. Un avis ?' }
    expect(verdict(preSendCheck(withCompany), 'no_company_in_first')).toBe('fail')
    expect(verdict(preSendCheck({ ...withCompany, step: 2 }), 'no_company_in_first')).toBe('pass')
  })

  it("sans le nom du vendeur, il DIT qu'il ne peut pas vérifier — il ne conclut pas « conforme »", () => {
    const items = preSendCheck({ body: 'Bonjour, un avis ?', step: 1 })
    expect(verdict(items, 'no_company_in_first')).toBe('not_checkable')
  })

  it('la cohérence M1-M2-M3 n’est JAMAIS déclarée conforme par cette machine', () => {
    for (const step of [1, 2, 3]) {
      expect(verdict(preSendCheck({ ...CLEAN, step }), 'sequence_coherence')).toBe('not_checkable')
    }
  })

  it('attrape la relance vide, la quatrième des six erreurs', () => {
    const items = preSendCheck({ ...CLEAN, step: 2, body: 'Juste un petit follow-up sur mon message. Un avis ?' })
    expect(verdict(items, 'timing_respected')).toBe('fail')
    expect(detail(items, 'timing_respected')).toContain('apporte du neuf')
  })

  it('compare le délai réel au minimum du scénario', () => {
    const tooEarly = preSendCheck({ ...CLEAN, step: 2, daysSincePrevious: 2, minDelayDays: 5 })
    expect(verdict(tooEarly, 'timing_respected')).toBe('fail')
    const onTime = preSendCheck({ ...CLEAN, step: 2, daysSincePrevious: 6, minDelayDays: 5 })
    expect(verdict(onTime, 'timing_respected')).toBe('pass')
  })

  it('sans date du message précédent, il le DIT', () => {
    expect(verdict(preSendCheck({ ...CLEAN, step: 2 }), 'timing_respected')).toBe('not_checkable')
  })

  it('demander un rendez-vous au premier message est un échec, quel que soit le persona', () => {
    const items = preSendCheck({ ...CLEAN, body: 'Bonjour, auriez-vous quinze minutes cette semaine ?' })
    expect(verdict(items, 'right_persona')).toBe('fail')
    // …et au deuxième message, ce n'en est plus un : c'est la suite normale.
    const later = preSendCheck({ ...CLEAN, step: 2, body: 'Bonjour, auriez-vous quinze minutes cette semaine ?' })
    expect(verdict(later, 'right_persona')).not.toBe('fail')
  })

  it('déaccentue et ignore la casse — un jargon écrit sans accent reste du jargon', () => {
    const items = preSendCheck({ ...CLEAN, body: 'Bonjour, NOTRE METHODOLOGIE EPROUVEE. Un avis ?' })
    expect(verdict(items, 'no_esn_jargon')).toBe('fail')
  })
})

/* ------------- les erreurs qui tuent, AVANT l'envoi et non après ------------ */

describe('preSendCheck — un échec NOMME l’erreur qui tue dont il est une occurrence', () => {
  /**
   * Les quatre erreurs qui alimentent un contrôle mécanique, et le point qui les
   * attrape. Les deux autres (`wrote_without_reading`, `gave_up_after_m1`)
   * n'apparaissent JAMAIS ici : la première ne se vérifie pas depuis un texte,
   * la seconde est une règle de séquence — c'est écrit dans le registre, et le
   * test du bas vérifie qu'on ne les a pas discrètement rattachées à un point.
   */
  const MECHANICAL: ReadonlyArray<readonly [string, string, Partial<Parameters<typeof preSendCheck>[0]>]> = [
    ['variables_filled', 'same_message_to_everyone', { body: 'Bonjour {{Prénom}}, un avis ?' }],
    ['no_company_in_first', 'self_before_other', { body: 'Bonjour, je travaille chez Acme Conseil. Un avis ?' }],
    ['timing_respected', 'empty_follow_up', { step: 2, body: 'Juste un petit follow-up sur mon message. Un avis ?' }],
    ['right_persona', 'meeting_in_first_message', { body: 'Bonjour, auriez-vous quinze minutes cette semaine ?' }],
  ]

  it.each(MECHANICAL)('%s en échec cite « %s » en clair', (checkId, mistakeId, input) => {
    const items = preSendCheck({ ...CLEAN, ...input })
    expect(verdict(items, checkId)).toBe('fail')
    // Le libellé vient du registre — pas une deuxième formulation qui divergerait.
    expect(mistake(items, checkId)).toBe(OUTREACH_KILLER_MISTAKES.find(m => m.id === mistakeId)?.mistake)
  })

  it('un point conforme ou non vérifiable ne porte AUCUNE erreur — on n’accuse pas dans le vide', () => {
    const items = preSendCheck(CLEAN)
    expect(preSendFailures(items)).toHaveLength(0)
    for (const item of items) expect(item.mistake).toBeUndefined()
  })

  it('les erreurs citées existent toutes au registre, et le registre n’est pas vide', () => {
    // La garde LIT quelque chose : sans ce compte, elle passerait au vert sur un
    // registre vidé par accident.
    expect(OUTREACH_KILLER_MISTAKES.length).toBeGreaterThan(0)
    const known = new Set(OUTREACH_KILLER_MISTAKES.map(m => m.mistake))
    const cited = MECHANICAL.map(([checkId, , input]) => mistake(preSendCheck({ ...CLEAN, ...input }), checkId))
    expect(cited.filter(Boolean)).toHaveLength(MECHANICAL.length)
    for (const text of cited) expect(known.has(text ?? '')).toBe(true)
  })

  it('les deux erreurs non mécaniques ne sont rattachées à aucun point', () => {
    const attachable = new Set(MECHANICAL.map(([, mistakeId]) => mistakeId))
    expect(attachable.has('wrote_without_reading')).toBe(false)
    expect(attachable.has('gave_up_after_m1')).toBe(false)
  })
})

/* --------------------- le persona, enfin quelque chose ---------------------- */

describe('preSendCheck — le persona dit QUEL levier, pas juste son nom', () => {
  it('nomme le levier, l’unité de langage et ce qui fait décrocher', () => {
    const items = preSendCheck({ ...CLEAN, persona: 'decideur' })
    const profile = OUTREACH_PERSONA_PROFILES.decideur
    // Toujours `not_checkable` : juger l'adéquation d'un levier demande de
    // comprendre un texte. Ce qui change, c'est qu'on dit à quoi le comparer.
    expect(verdict(items, 'right_persona')).toBe('not_checkable')
    expect(detail(items, 'right_persona')).toContain(profile.lever)
    expect(detail(items, 'right_persona')).toContain(profile.speaksIn)
    expect(detail(items, 'right_persona')).toContain(profile.turnsOff)
  })

  it('chaque persona rend SON profil — pas celui d’à côté', () => {
    for (const profile of Object.values(OUTREACH_PERSONA_PROFILES)) {
      expect(detail(preSendCheck({ ...CLEAN, persona: profile.persona }), 'right_persona')).toContain(profile.lever)
    }
  })

  it('sans persona établi, il le DIT — il n’en devine pas un', () => {
    expect(verdict(preSendCheck(CLEAN), 'right_persona')).toBe('not_checkable')
    expect(detail(preSendCheck(CLEAN), 'right_persona')).toContain('n’est pas établi')
    // Un palier inconnu ne fabrique pas de persona : c'est la même règle, vue
    // depuis la dérivation.
    expect(preSendCheck({ ...CLEAN, persona: personaForHierarchyLevel('unknown') })).toEqual(preSendCheck(CLEAN))
  })

  it('le rendez-vous au premier message l’emporte sur le profil — c’est un échec, pas un conseil', () => {
    const items = preSendCheck({ ...CLEAN, persona: 'decideur', body: 'Bonjour, auriez-vous un créneau ?' })
    expect(verdict(items, 'right_persona')).toBe('fail')
  })
})

/* ----------- « pas de date » et « pas de minimum » ne sont pas pareil ------- */

describe('preSendCheck — le délai distingue ce qu’il ignore', () => {
  it('date connue mais minimum inconnu : il donne les jours écoulés sans conclure', () => {
    const items = preSendCheck({ ...CLEAN, step: 2, daysSincePrevious: 3 })
    expect(verdict(items, 'timing_respected')).toBe('not_checkable')
    expect(detail(items, 'timing_respected')).toContain('3 jours')
    // Le mot qui compte : on ne dit pas « conforme », on dit qu'aucun minimum
    // n'est établi.
    expect(detail(items, 'timing_respected')).toContain('minimal')
  })

  it('date inconnue : il ne raconte AUCUN nombre de jours — « 0 jour » serait faux', () => {
    const items = preSendCheck({ ...CLEAN, step: 2, minDelayDays: 5 })
    expect(verdict(items, 'timing_respected')).toBe('not_checkable')
    expect(detail(items, 'timing_respected')).toContain('date du message précédent')
    expect(detail(items, 'timing_respected')).not.toMatch(/\d+\s*jour/)
  })

  it('un message parti le jour même se dit « 0 jour » — là, zéro est VRAI', () => {
    const items = preSendCheck({ ...CLEAN, step: 2, daysSincePrevious: 0, minDelayDays: 5 })
    expect(verdict(items, 'timing_respected')).toBe('fail')
    expect(detail(items, 'timing_respected')).toContain('0 jour')
  })
})

/* ----- #2371.7 — le décideur ne reçoit pas un catalogue de technologies ----- */

describe('preSendCheck — #2371.7 le décideur ne reçoit pas un catalogue de technologies', () => {
  const TECH_PITCH = 'Bonjour, notre stack technique couvre Kubernetes, AWS et React. Un avis ?'

  it('un décideur qui reçoit un catalogue technique : échec', () => {
    const items = preSendCheck({ ...CLEAN, persona: 'decideur', body: TECH_PITCH })
    expect(verdict(items, 'no_tech_catalogue_for_decision_maker')).toBe('fail')
    expect(detail(items, 'no_tech_catalogue_for_decision_maker')).toContain('stack technique')
  })

  it('un manager ou un opérationnel : la règle ne s’applique pas', () => {
    const items = preSendCheck({ ...CLEAN, persona: 'manager', body: TECH_PITCH })
    expect(verdict(items, 'no_tech_catalogue_for_decision_maker')).toBe('pass')
    expect(detail(items, 'no_tech_catalogue_for_decision_maker')).toContain('s’applique')
  })

  it('sans persona établi, il le DIT — il n’accuse pas dans le vide', () => {
    const items = preSendCheck({ ...CLEAN, body: TECH_PITCH })
    expect(verdict(items, 'no_tech_catalogue_for_decision_maker')).toBe('not_checkable')
  })

  it('sans persona établi, son message ne redouble PAS celui de right_persona — deux lignes de la checklist, jamais un écho', () => {
    // Les deux règles partagent la même cause (persona inconnu) mais restent
    // deux points DISTINCTS de la checklist (#2123.74 : huit points, chacun
    // relu séparément). Le même texte deux fois lirait comme un bug d'affichage,
    // pas comme deux règles qui s'appliquent.
    const items = preSendCheck({ ...CLEAN, body: TECH_PITCH })
    expect(detail(items, 'no_tech_catalogue_for_decision_maker')).not.toBe(detail(items, 'right_persona'))
  })

  it('un décideur sans catalogue technique : conforme', () => {
    const items = preSendCheck({ ...CLEAN, persona: 'decideur' })
    expect(verdict(items, 'no_tech_catalogue_for_decision_maker')).toBe('pass')
  })

  it('aucune des six erreurs qui tuent n’est citée — ce n’est pas l’une d’elles', () => {
    const items = preSendCheck({ ...CLEAN, persona: 'decideur', body: TECH_PITCH })
    expect(mistake(items, 'no_tech_catalogue_for_decision_maker')).toBeUndefined()
  })
})

// #2372.6 (LAU-FINAL-087, « ASSET UTILE ») — un document utile s'ANNONCE, il
// n'est envoyé qu'après un intérêt confirmé. Tout message de séquence part AVANT
// une réponse (le M2/M3 relancent un silence) : aucun ne joint donc de document.
describe('#2372.6 — un document s’annonce, il ne se joint pas avant l’intérêt', () => {
  const attached =
    'Bonjour Marie, vu votre migration Kubernetes. Vous trouverez ci-joint notre retour d’expérience. Qu’en pensez-vous ?'
  const announced =
    'Bonjour Marie, vu votre migration Kubernetes. J’ai une synthèse d’un projet comparable : voulez-vous que je vous l’envoie ?'

  it('joindre au premier message ⇒ échec, qui nomme la tournure', () => {
    const items = preSendCheck({ ...CLEAN, body: attached })
    expect(verdict(items, 'asset_after_interest')).toBe('fail')
    expect(detail(items, 'asset_after_interest')).toContain('ci-joint')
  })

  it('une relance de séquence ne joint pas non plus : elle relance un silence, pas un intérêt', () => {
    expect(verdict(preSendCheck({ ...CLEAN, body: attached, step: 2 }), 'asset_after_interest')).toBe('fail')
    const brochure = 'Bonjour Marie, je vous joins notre plaquette pour mémoire. Le sujet est-il toujours ouvert ?'
    const items = preSendCheck({ ...CLEAN, body: brochure, step: 3 })
    expect(verdict(items, 'asset_after_interest')).toBe('fail')
    expect(detail(items, 'asset_after_interest')).toContain('plaquette')
  })

  it('témoin : ANNONCER le document (et proposer de l’envoyer) est conforme', () => {
    expect(verdict(preSendCheck({ ...CLEAN, body: announced }), 'asset_after_interest')).toBe('pass')
    expect(verdict(preSendCheck(CLEAN), 'asset_after_interest')).toBe('pass')
  })
})

describe('#3446 — jeu de tests de la recette prod, tests 2 et 7', () => {
  // TEST 2 (« variables absentes ») — déjà porté par `names_real_context` :
  // un élément réel manquant n'est jamais présenté comme prêt, l'absence est
  // NOMMÉE (jamais devinée), et « aucun élément connu » reste distinct de
  // « connu mais absent du texte ». Ce test pin la lecture EXACTE du corps
  // de #3446.
  it('TEST 2 — un élément réel manquant : le message n’est pas dit prêt, l’information manquante est nommée', () => {
    const generic = {
      ...CLEAN,
      body: 'Bonjour Marie, comment gérez-vous la montée en charge ?',
      realContext: ['migration Kubernetes annoncée en juin'],
    }
    const items = preSendCheck(generic)
    expect(verdict(items, 'names_real_context')).toBe('fail')
    expect(detail(items, 'names_real_context')).toContain('migration Kubernetes annoncée en juin')
  })

  it('TEST 2 bis — aucune variable connue : ni « prêt », ni « échec » — l’absence de donnée reste nommée', () => {
    const noContext = { ...CLEAN, realContext: [] }
    expect(verdict(preSendCheck(noContext), 'names_real_context')).toBe('not_checkable')
  })

  // TEST 7 (« test du nom de compte ») — un message qui reste aussi
  // pertinent après substitution du nom du compte est trop générique. La
  // machine ne compare pas deux rendus : elle vérifie que le texte CITE un
  // élément réel de CE dossier — sans lui, il serait identique pour
  // n’importe quel compte, exactement le critère de généricité de #3446.
  it('TEST 7 — un message qui ne cite aucun élément réel du dossier resterait identique pour un autre compte : échec', () => {
    const interchangeable = {
      ...CLEAN,
      body: 'Bonjour Marie, comment gérez-vous la montée en charge de vos projets ?',
      realContext: ['migration Kubernetes annoncée en juin'],
    }
    const items = preSendCheck(interchangeable)
    expect(verdict(items, 'names_real_context')).toBe('fail')
    expect(mistake(items, 'names_real_context')).toBe('Envoyer le même message à tout le monde.')
  })

  it('TEST 7 bis — témoin : citer l’élément réel du dossier rend le message spécifique à CE compte', () => {
    const specific = preSendCheck({ ...CLEAN, realContext: ['migration Kubernetes annoncée en juin'] })
    expect(verdict(specific, 'names_real_context')).toBe('pass')
  })
})
