import { describe, expect, it } from 'vitest'
import {
  NEED_BLOCKING_FIELDS,
  NEED_COMPILATION_FIELDS,
  NEED_COMPILATION_SOURCE_KINDS,
  NEED_CONFIRMATION_LEVELS,
  NEED_FIELD_CONFIDENCES,
  NEED_PROCUREMENT_INVOLVEMENTS,
  allowedNeedFieldValues,
  compiledNeedFieldSchema,
  compiledNeedSchema,
  groupNeedStatements,
  identifyNeedSource,
  needCompilationSourceKindSchema,
  needContradictionSchema,
  needFieldProvenanceSchema,
  needUnderstandingGaps,
  needUnknownSchema,
  pickNeedClarification,
  resolveNeedAccount,
} from './need-compilation.js'
import { PROJECT_CONTACT_ROLES } from './project.js'
import { REMOTE_PREFERENCES, TRAVEL_ACCEPTANCES } from './talent-preferences.js'

/** Une provenance complète — chaque test n'en change QU'UNE chose. */
function provenance() {
  return {
    source_kind: 'email' as const,
    excerpt: 'on cherche deux data engineers pour janvier',
    locator: 'message du 12/09 14:03',
    stated_at: '2026-09-12',
    confidence: 'explicite' as const,
  }
}

describe('les sources qu’un besoin peut avoir (#2322.1-13)', () => {
  it('nomme les sources compilables, et le tableur n’en est PAS une (#2322.9)', () => {
    expect(NEED_COMPILATION_SOURCE_KINDS).toContain('chat_message')
    expect(NEED_COMPILATION_SOURCE_KINDS).toContain('free_brief')
    expect(NEED_COMPILATION_SOURCE_KINDS).toContain('email')
    expect(NEED_COMPILATION_SOURCE_KINDS).toContain('meeting_report')
    expect(NEED_COMPILATION_SOURCE_KINDS).toContain('transcript')
    expect(NEED_COMPILATION_SOURCE_KINDS).toContain('screenshot')
    expect(NEED_COMPILATION_SOURCE_KINDS).toContain('crm_record')
    expect(NEED_COMPILATION_SOURCE_KINDS).toContain('field_notes')
    expect(NEED_COMPILATION_SOURCE_KINDS).toContain('document')
    expect(NEED_COMPILATION_SOURCE_KINDS).toContain('job_posting')
    expect(NEED_COMPILATION_SOURCE_KINDS).toContain('rfp')
    // Le no-go du 18/09 : jamais un tableur, jamais un mapping de colonnes.
    expect(NEED_COMPILATION_SOURCE_KINDS).not.toContain('spreadsheet')
    expect(needCompilationSourceKindSchema.safeParse('spreadsheet').success).toBe(false)
  })
})

describe('étape 1 — identifier la source (#2322.15)', () => {
  it('lit le canal : un message de chat, un email, une fiche CRM', () => {
    expect(identifyNeedSource({ channel: 'chat' })).toEqual({ kind: 'chat_message', refusal: null })
    expect(identifyNeedSource({ channel: 'email' })).toEqual({ kind: 'email', refusal: null })
    expect(identifyNeedSource({ channel: 'crm' })).toEqual({ kind: 'crm_record', refusal: null })
  })

  it('lit une capture d’écran à son type de fichier (#2322.8)', () => {
    expect(identifyNeedSource({ filename: 'capture.png', mime: 'image/png' })).toEqual({
      kind: 'screenshot',
      refusal: null,
    })
  })

  it('REFUSE un tableur au lieu d’en deviner les colonnes (#2322.9)', () => {
    const csv = identifyNeedSource({ filename: 'besoins.csv', mime: 'text/csv' })
    expect(csv.kind).toBeNull()
    expect(csv.refusal).toBe('tableur')
    expect(identifyNeedSource({ filename: 'postes.xlsx' }).refusal).toBe('tableur')
  })

  it('ne DEVINE jamais un compte rendu, une transcription ou des notes terrain', () => {
    // Trois sources qu’aucun indice technique ne distingue : seule la personne
    // peut le dire. Déclarée, elle est retenue (#2322.4/.5/.13).
    expect(identifyNeedSource({ declared_kind: 'meeting_report', channel: 'chat' }).kind).toBe('meeting_report')
    expect(identifyNeedSource({ declared_kind: 'transcript' }).kind).toBe('transcript')
    expect(identifyNeedSource({ declared_kind: 'field_notes' }).kind).toBe('field_notes')
    // Non déclarée, du texte collé n’est QUE du texte collé (#2322.2).
    expect(identifyNeedSource({ text: 'ils cherchent un archi cloud' }).kind).toBe('free_brief')
  })

  it('rend `null` plutôt qu’un type inventé quand rien n’est lisible', () => {
    expect(identifyNeedSource({})).toEqual({ kind: null, refusal: null })
    expect(identifyNeedSource({ declared_kind: 'pigeon_voyageur' }).kind).toBeNull()
  })
})

describe('la provenance PAR CHAMP (#2322.72-76)', () => {
  it('accepte une provenance complète', () => {
    expect(needFieldProvenanceSchema.safeParse(provenance()).success).toBe(true)
  })

  it('refuse un champ sans extrait — une valeur sans citation n’est pas compilée (#2322.73)', () => {
    expect(needFieldProvenanceSchema.safeParse({ ...provenance(), excerpt: '' }).success).toBe(false)
    const { excerpt: _excerpt, ...sansExtrait } = provenance()
    expect(needFieldProvenanceSchema.safeParse(sansExtrait).success).toBe(false)
  })

  it('exige que l’endroit d’origine et la date soient DITS, `null` compris (#2322.74/.75)', () => {
    const { locator: _locator, ...sansEndroit } = provenance()
    expect(needFieldProvenanceSchema.safeParse(sansEndroit).success).toBe(false)
    const { stated_at: _statedAt, ...sansDate } = provenance()
    expect(needFieldProvenanceSchema.safeParse(sansDate).success).toBe(false)
    expect(needFieldProvenanceSchema.safeParse({ ...provenance(), locator: null, stated_at: null }).success).toBe(true)
  })

  it('la confiance est un NIVEAU NOMMÉ, jamais une probabilité (#2322.76)', () => {
    expect(NEED_FIELD_CONFIDENCES).toEqual(['explicite', 'deduit', 'incertain'])
    for (const level of NEED_FIELD_CONFIDENCES) {
      expect(needFieldProvenanceSchema.safeParse({ ...provenance(), confidence: level }).success).toBe(true)
    }
    expect(needFieldProvenanceSchema.safeParse({ ...provenance(), confidence: 0.8 }).success).toBe(false)
    expect(needFieldProvenanceSchema.safeParse({ ...provenance(), confidence: '80%' }).success).toBe(false)
  })
})

/** Un champ compilé complet — chaque test n'en change QU'UNE chose. */
function champ() {
  return {
    field: 'work_to_do' as const,
    value: 'reprendre les flux EDI fournisseurs et les industrialiser',
    provenance: provenance(),
  }
}

describe('les champs que le besoin enregistré ne portait pas (#2322.24-51)', () => {
  it('nomme l’entité, le périmètre, le travail, le résultat, les preuves, la mobilité, le processus et la sécurité', () => {
    expect(NEED_COMPILATION_FIELDS).toContain('entity') // #2322.24
    expect(NEED_COMPILATION_FIELDS).toContain('scope') // #2322.25
    expect(NEED_COMPILATION_FIELDS).toContain('work_to_do') // #2322.31
    expect(NEED_COMPILATION_FIELDS).toContain('expected_outcome') // #2322.32
    expect(NEED_COMPILATION_FIELDS).toContain('expected_proofs') // #2322.38
    expect(NEED_COMPILATION_FIELDS).toContain('mobility') // #2322.43
    expect(NEED_COMPILATION_FIELDS).toContain('process') // #2322.47
    expect(NEED_COMPILATION_FIELDS).toContain('security') // #2322.51
  })

  it('réutilise les champs qui existent déjà plutôt que d’en ouvrir des jumeaux', () => {
    for (const existant of ['title', 'skills', 'seniority', 'headcount', 'target_tjm_cents', 'remote']) {
      expect(NEED_COMPILATION_FIELDS).toContain(existant)
    }
    // Le décideur et les achats sont des PERSONNES : ils passent par les rôles
    // de projet (#2322.48 / #2322.49), jamais par un second vocabulaire.
    expect(NEED_COMPILATION_FIELDS).not.toContain('decision_maker')
    expect(PROJECT_CONTACT_ROLES).toContain('decideur')
    expect(PROJECT_CONTACT_ROLES).toContain('acheteur')
  })

  it('refuse un champ inconnu du besoin', () => {
    expect(compiledNeedFieldSchema.safeParse({ ...champ(), field: 'couleur_des_murs' }).success).toBe(false)
  })

  it('refuse une valeur VIDE — une absence ne fait aucune ligne', () => {
    expect(compiledNeedFieldSchema.safeParse({ ...champ(), value: '' }).success).toBe(false)
    expect(compiledNeedFieldSchema.safeParse({ ...champ(), value: '   ' }).success).toBe(false)
    expect(compiledNeedFieldSchema.safeParse({ ...champ(), field: 'expected_proofs', value: [] }).success).toBe(false)
  })

  it('refuse un champ SANS provenance — la citation n’est pas un supplément (#2322.72)', () => {
    const { provenance: _prov, ...sansProvenance } = champ()
    expect(compiledNeedFieldSchema.safeParse(sansProvenance).success).toBe(false)
  })

  it('la mobilité emprunte l’échelle des consultants au lieu d’en ouvrir une jumelle (#2322.43)', () => {
    // GA-26 : ce que la mission demande et ce que la personne accepte se
    // comparent. Deux échelles différentes rendraient ce rapprochement
    // impossible — et l’écart ne se verrait qu’au premier matching.
    expect(allowedNeedFieldValues('mobility')).toEqual(TRAVEL_ACCEPTANCES)
    expect(allowedNeedFieldValues('remote')).toEqual(REMOTE_PREFERENCES)
    expect(allowedNeedFieldValues('work_to_do')).toBeNull()
    expect(TRAVEL_ACCEPTANCES).not.toContain('inconnu')
    expect(compiledNeedFieldSchema.safeParse({ ...champ(), field: 'mobility', value: 'ponctuel' }).success).toBe(true)
    expect(compiledNeedFieldSchema.safeParse({ ...champ(), field: 'mobility', value: 'beaucoup' }).success).toBe(false)
  })

  it('les achats sont impliqués ou non — jamais « peut-être » (#2322.49)', () => {
    expect(NEED_PROCUREMENT_INVOLVEMENTS).toEqual(['implique', 'non_implique'])
    expect(compiledNeedFieldSchema.safeParse({ ...champ(), field: 'procurement', value: 'implique' }).success).toBe(
      true,
    )
    expect(compiledNeedFieldSchema.safeParse({ ...champ(), field: 'procurement', value: 'inconnu' }).success).toBe(
      false,
    )
  })

  it('les listes restent des listes et les textes des textes', () => {
    expect(
      compiledNeedFieldSchema.safeParse({
        ...champ(),
        field: 'expected_proofs',
        value: ['une référence EDI', 'un cas client retail'],
      }).success,
    ).toBe(true)
    expect(
      compiledNeedFieldSchema.safeParse({
        ...champ(),
        field: 'expected_proofs',
        value: 'une référence EDI',
      }).success,
    ).toBe(false)
    expect(compiledNeedFieldSchema.safeParse({ ...champ(), field: 'headcount', value: 2 }).success).toBe(true)
    expect(compiledNeedFieldSchema.safeParse({ ...champ(), field: 'headcount', value: 'deux' }).success).toBe(false)
  })
})

describe('ce qui manque et ce qui se contredit (#2322.54-56)', () => {
  it('une inconnue NOMME le champ et la question à poser (#2322.54)', () => {
    expect(needUnknownSchema.safeParse({ field: 'target_tjm_cents', question: 'Quel TJM cible ?' }).success).toBe(true)
    expect(needUnknownSchema.safeParse({ field: 'target_tjm_cents', question: '' }).success).toBe(false)
    expect(needUnknownSchema.safeParse({ field: 'couleur_des_murs', question: 'Quelle couleur ?' }).success).toBe(false)
  })

  it('une contradiction garde les DEUX phrases, chacune avec sa source (#2322.55)', () => {
    const contradiction = {
      field: 'remote',
      statements: [
        { value: 'full_remote', provenance: provenance() },
        {
          value: 'sur_site',
          provenance: { ...provenance(), excerpt: 'présence obligatoire le lundi' },
        },
      ],
    }
    expect(needContradictionSchema.safeParse(contradiction).success).toBe(true)
    // Une seule phrase n’est pas une contradiction, c’est un fait.
    expect(
      needContradictionSchema.safeParse({
        ...contradiction,
        statements: [contradiction.statements[0]],
      }).success,
    ).toBe(false)
    // Deux fois la MÊME phrase non plus.
    expect(
      needContradictionSchema.safeParse({
        ...contradiction,
        statements: [contradiction.statements[0], contradiction.statements[0]],
      }).success,
    ).toBe(false)
  })

  it('le niveau de confirmation est un mot, jamais un pourcentage (#2322.56)', () => {
    expect(NEED_CONFIRMATION_LEVELS).toEqual(['confirme_par_le_client', 'rapporte', 'hypothese'])
  })
})

describe('un besoin compilé est une PROPOSITION', () => {
  function compile() {
    return {
      source: { kind: 'email' as const, locator: 'fil « besoin EDI »', stated_at: '2026-09-12' },
      account_id: null,
      company_hint: 'Decathlon',
      fields: [champ()],
      proposed_contacts: [],
      unknowns: [{ field: 'target_tjm_cents', question: 'Quel TJM cible ?' }],
      contradictions: [],
      confirmation_level: 'rapporte' as const,
      clarification: null,
      status: 'proposition' as const,
    }
  }

  it('accepte une compilation complète', () => {
    expect(compiledNeedSchema.safeParse(compile()).success).toBe(true)
  })

  it('ne se déclare JAMAIS créé — le besoin attend une validation humaine (#2322.22)', () => {
    expect(compiledNeedSchema.safeParse({ ...compile(), status: 'created' }).success).toBe(false)
  })

  it('refuse deux fois le même champ — une valeur double est une contradiction, pas un doublon', () => {
    expect(compiledNeedSchema.safeParse({ ...compile(), fields: [champ(), champ()] }).success).toBe(false)
  })

  it('refuse qu’un champ soit à la fois su et inconnu', () => {
    const incoherent = {
      ...compile(),
      unknowns: [{ field: 'work_to_do', question: 'Quel travail exactement ?' }],
    }
    expect(compiledNeedSchema.safeParse(incoherent).success).toBe(false)
  })

  it('propose un décideur et un acheteur AVEC leur citation, jamais de mémoire (#2322.48/.49/.66)', () => {
    const avecDecideur = {
      ...compile(),
      proposed_contacts: [
        {
          contact_id: null,
          full_name: 'Claire Dumas',
          title: 'DSI',
          role: 'decideur' as const,
          provenance: provenance(),
        },
        {
          contact_id: null,
          full_name: 'Marc Petit',
          title: null,
          role: 'acheteur' as const,
          provenance: provenance(),
        },
      ],
    }
    expect(compiledNeedSchema.safeParse(avecDecideur).success).toBe(true)
    const sansCitation = {
      ...compile(),
      proposed_contacts: [{ contact_id: null, full_name: 'Claire Dumas', title: 'DSI', role: 'decideur' as const }],
    }
    expect(compiledNeedSchema.safeParse(sansCitation).success).toBe(false)
    const sansNom = {
      ...compile(),
      proposed_contacts: [
        {
          contact_id: null,
          full_name: '',
          title: null,
          role: 'decideur' as const,
          provenance: provenance(),
        },
      ],
    }
    expect(compiledNeedSchema.safeParse(sansNom).success).toBe(false)
  })
})

describe('étape 2 — résoudre l’entreprise (#2322.16)', () => {
  const candidats = [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Decathlon' },
    { id: '22222222-2222-4222-8222-222222222222', name: 'Decathlon Digital' },
    { id: '33333333-3333-4333-8333-333333333333', name: 'Leroy Merlin SAS' },
  ]

  it('reconnaît le compte quand le nom correspond, ponctuation et forme juridique mises à part', () => {
    expect(resolveNeedAccount({ company_hint: 'decathlon', candidates: candidats }).account_id).toBe(candidats[0].id)
    expect(resolveNeedAccount({ company_hint: 'Leroy-Merlin', candidates: candidats }).account_id).toBe(candidats[2].id)
  })

  it('ne choisit JAMAIS le plus proche : deux candidats, personne n’est choisi', () => {
    const deux = [candidats[0], { ...candidats[1], name: 'DECATHLON' }]
    const resolu = resolveNeedAccount({ company_hint: 'Decathlon', candidates: deux })
    expect(resolu.account_id).toBeNull()
    expect(resolu.ambiguous).toBe(true)
    expect(resolu.candidate_ids).toEqual([deux[0].id, deux[1].id])
  })

  it('un nom qui ne correspond à rien reste un nom, pas un compte', () => {
    const resolu = resolveNeedAccount({ company_hint: 'Castorama', candidates: candidats })
    expect(resolu.account_id).toBeNull()
    expect(resolu.ambiguous).toBe(false)
    // « Decathlon Digital » ne répond pas pour « Decathlon » : un préfixe commun
    // n’est pas une identité.
    expect(resolveNeedAccount({ company_hint: 'Decath', candidates: candidats }).account_id).toBeNull()
  })

  it('sans nom d’entreprise, rien n’est résolu — et ce n’est pas une erreur', () => {
    expect(resolveNeedAccount({ company_hint: null, candidates: candidats })).toEqual({
      account_id: null,
      ambiguous: false,
      candidate_ids: [],
    })
  })
})

describe('étape 5 — détecter contradictions et inconnues (#2322.19)', () => {
  it('deux valeurs différentes pour le MÊME champ font une contradiction, pas un écrasement', () => {
    const lecture = groupNeedStatements([
      { field: 'remote', value: 'full_remote', provenance: provenance() },
      {
        field: 'remote',
        value: 'sur_site',
        provenance: { ...provenance(), excerpt: 'présence obligatoire le lundi' },
      },
      { field: 'title', value: 'Data engineer', provenance: provenance() },
    ])
    expect(lecture.fields.map(f => f.field)).toEqual(['title'])
    expect(lecture.contradictions).toHaveLength(1)
    expect(lecture.contradictions[0]?.field).toBe('remote')
    expect(lecture.contradictions[0]?.statements).toHaveLength(2)
  })

  it('deux fois la même valeur n’est pas une contradiction — la source se répète, voilà tout', () => {
    const lecture = groupNeedStatements([
      { field: 'headcount', value: 2, provenance: provenance() },
      { field: 'headcount', value: 2, provenance: { ...provenance(), excerpt: 'deux profils' } },
    ])
    expect(lecture.contradictions).toHaveLength(0)
    expect(lecture.fields).toHaveLength(1)
  })

  it('nomme les champs bloquants qui manquent (#2322.54/.77)', () => {
    expect(NEED_BLOCKING_FIELDS).toEqual(['work_to_do', 'expected_outcome', 'skills'])
    expect(needUnderstandingGaps([champ()])).toEqual(['expected_outcome', 'skills'])
    expect(
      needUnderstandingGaps([
        champ(),
        { field: 'expected_outcome', value: 'des flux fiables', provenance: provenance() },
        { field: 'skills', value: [{ term: 'EDI', required: true }], provenance: provenance() },
      ]),
    ).toEqual([])
  })
})

describe('étape 7 — UNE clarification, et seulement si elle change la suite (#2322.21)', () => {
  function compile() {
    return {
      source: { kind: 'email' as const, locator: null, stated_at: null },
      account_id: null,
      company_hint: null,
      fields: [
        champ(),
        { field: 'expected_outcome' as const, value: 'des flux fiables', provenance: provenance() },
        {
          field: 'skills' as const,
          value: [{ term: 'EDI', required: true }],
          provenance: provenance(),
        },
      ],
      proposed_contacts: [],
      unknowns: [],
      contradictions: [],
      confirmation_level: 'rapporte' as const,
      clarification: null,
      status: 'proposition' as const,
    }
  }

  it('ne demande rien quand rien de bloquant ne manque', () => {
    expect(pickNeedClarification(compile())).toBeNull()
  })

  it('ne demande rien pour une inconnue qui ne change pas la suite', () => {
    const avecTjm = {
      ...compile(),
      unknowns: [{ field: 'target_tjm_cents' as const, question: 'Quel TJM ?' }],
    }
    expect(pickNeedClarification(avecTjm)).toBeNull()
  })

  it('une contradiction passe AVANT une inconnue — elle change ce qu’on écrirait', () => {
    const contredit = {
      ...compile(),
      fields: [champ()],
      unknowns: [{ field: 'expected_outcome' as const, question: 'Quel résultat ?' }],
      contradictions: [
        {
          field: 'remote' as const,
          statements: [
            { value: 'full_remote', provenance: provenance() },
            {
              value: 'sur_site',
              provenance: { ...provenance(), excerpt: 'présence obligatoire le lundi' },
            },
          ],
        },
      ],
    }
    expect(pickNeedClarification(contredit)).toEqual({ field: 'remote', reason: 'contradiction' })
  })

  it('un champ bloquant manquant vaut une question, même s’il n’est pas listé en inconnue', () => {
    const sansResultat = { ...compile(), fields: [champ()] }
    expect(pickNeedClarification(sansResultat)).toEqual({
      field: 'expected_outcome',
      reason: 'blocking_unknown',
    })
  })

  it('REFUSE une question posée à côté de la plaque', () => {
    const horsSujet = {
      ...compile(),
      clarification: {
        field: 'location' as const,
        question: 'Où se trouvent les bureaux ?',
        why: 'pour savoir',
        reason: 'blocking_unknown' as const,
      },
    }
    expect(compiledNeedSchema.safeParse(horsSujet).success).toBe(false)
    const sansRaison = {
      ...compile(),
      fields: [champ()],
      clarification: {
        field: 'expected_outcome' as const,
        question: 'Qu’est-ce qui doit avoir changé ?',
        why: 'sans le résultat attendu, on propose un profil au hasard',
        reason: 'blocking_unknown' as const,
      },
    }
    expect(compiledNeedSchema.safeParse(sansRaison).success).toBe(true)
  })
})

describe('les deux NO-GO de l’issue (#2322.71 / #2322.77)', () => {
  function offre(contractKind: string | null) {
    return {
      source: { kind: 'job_posting' as const, locator: 'annonce du 10/09', stated_at: '2026-09-10' },
      account_id: null,
      company_hint: 'Decathlon',
      fields: [
        { field: 'title' as const, value: 'Data engineer CDI', provenance: provenance() },
        ...(contractKind ? [{ field: 'contract_kind' as const, value: contractKind, provenance: provenance() }] : []),
      ],
      proposed_contacts: [],
      unknowns: [],
      contradictions: [],
      confirmation_level: 'hypothese' as const,
      clarification: null,
      status: 'proposition' as const,
    }
  }

  it('une offre d’emploi ne devient JAMAIS un besoin freelance toute seule (#2322.71)', () => {
    expect(compiledNeedSchema.safeParse(offre('regie')).success).toBe(false)
    expect(compiledNeedSchema.safeParse(offre('forfait')).success).toBe(false)
    expect(compiledNeedSchema.safeParse(offre('recrutement')).success).toBe(true)
    expect(compiledNeedSchema.safeParse(offre(null)).success).toBe(true)
  })

  it('la même régie venue d’un EMAIL passe — c’est la CONVERSION qui est interdite, pas la régie', () => {
    const parEmail = { ...offre('regie'), source: { kind: 'email' as const, locator: null, stated_at: null } }
    expect(compiledNeedSchema.safeParse(parEmail).success).toBe(true)
  })

  it('un besoin résumé par un intitulé de poste n’est jamais « confirmé » (#2322.77)', () => {
    expect(needUnderstandingGaps(offre(null).fields)).toEqual(['work_to_do', 'expected_outcome', 'skills'])
    const pretendConfirme = { ...offre(null), confirmation_level: 'confirme_par_le_client' as const }
    expect(compiledNeedSchema.safeParse(pretendConfirme).success).toBe(false)
  })

  it('… et il l’est dès que le travail, le résultat et les critères bloquants sont là', () => {
    const compris = {
      ...offre(null),
      confirmation_level: 'confirme_par_le_client' as const,
      fields: [
        ...offre(null).fields,
        champ(),
        { field: 'expected_outcome' as const, value: 'des flux fiables', provenance: provenance() },
        {
          field: 'skills' as const,
          value: [{ term: 'EDI', required: true }],
          provenance: provenance(),
        },
      ],
    }
    expect(compiledNeedSchema.safeParse(compris).success).toBe(true)
  })
})
