import { describe, expect, it } from 'vitest'
import {
  advanceSubmissionSchema,
  advanceSubstatusSchema,
  buildSubmissionPreview,
  canTransition,
  canTransitionSubstatus,
  CONSULTANT_FEEDBACK_AXES,
  createSubmissionSchema,
  submissionSchema,
  deriveSubstatusFromStage,
  FEEDBACK_AXES,
  nextSubstatuses,
  recordConsultantFeedbackSchema,
  recordFeedbackSchema,
  recordSubmissionDetailsSchema,
  recordSubmissionNextActionSchema,
  SUBMISSION_SUBSTATUSES,
  SUBSTATUS_TO_STAGE,
  submissionFunnel,
  type SubmissionStage,
} from './submission.js'
import { MEASURABILITY_THRESHOLDS } from './measurability.js'

function row(over: Partial<Parameters<typeof submissionFunnel>[0][number]> = {}) {
  return {
    stage: 'submitted' as SubmissionStage,
    submittedAt: '2026-08-01T09:00:00.000Z',
    firstFeedbackAt: null,
    outcomeReason: null,
    ...over,
  }
}

describe('canTransition', () => {
  it('laisse avancer dans le sens du cycle', () => {
    expect(canTransition('shortlisted', 'submitted')).toBe(true)
    expect(canTransition('submitted', 'interview')).toBe(true)
    expect(canTransition('interview', 'accepted')).toBe(true)
  })

  it('REFUSE de ressusciter un profil refusé par le client', () => {
    // Effacer un refus sans trace, c'est repousser la même personne chez le
    // même client — la façon la plus rapide de perdre un compte.
    expect(canTransition('rejected', 'shortlisted')).toBe(false)
    expect(canTransition('rejected', 'submitted')).toBe(false)
    expect(canTransition('accepted', 'submitted')).toBe(false)
  })

  it('laisse revenir sur un RETRAIT — il vient de nous', () => {
    expect(canTransition('withdrawn', 'shortlisted')).toBe(true)
    expect(canTransition('withdrawn', 'submitted')).toBe(true)
  })

  it('ne compte pas une étape vers elle-même comme une transition', () => {
    expect(canTransition('submitted', 'submitted')).toBe(false)
  })

  it('n’autorise pas de sauter l’envoi pour aller à l’entretien', () => {
    // Un entretien suppose que le client a reçu quelque chose.
    expect(canTransition('shortlisted', 'interview')).toBe(false)
  })
})

describe('createSubmissionSchema', () => {
  it('retient en SÉLECTION par défaut — retenir n’est pas envoyer', () => {
    const parsed = createSubmissionSchema.parse({
      projectId: '00000000-0000-4000-8000-000000000001',
      consultantId: '00000000-0000-4000-8000-000000000002',
    })
    expect(parsed.stage).toBe('shortlisted')
    expect(parsed.proposedRateCents).toBeNull()
  })

  it('n’accepte pas de créer directement un positionnement clos', () => {
    expect(() =>
      createSubmissionSchema.parse({
        projectId: '00000000-0000-4000-8000-000000000001',
        consultantId: '00000000-0000-4000-8000-000000000002',
        stage: 'accepted',
      }),
    ).toThrow()
  })
})

describe('advanceSubmissionSchema', () => {
  it('EXIGE un motif pour clore', () => {
    // Sans motif, « pourquoi perd-on ? » reste sans réponse pour toujours.
    expect(() => advanceSubmissionSchema.parse({ stage: 'rejected' })).toThrow()
    expect(() => advanceSubmissionSchema.parse({ stage: 'withdrawn' })).toThrow()
    expect(advanceSubmissionSchema.parse({ stage: 'rejected', outcomeReason: 'price' }).outcomeReason).toBe('price')
  })

  it('n’exige aucun motif pour avancer', () => {
    expect(advanceSubmissionSchema.parse({ stage: 'interview' }).stage).toBe('interview')
  })

  it('demande aussi un motif pour une acceptation', () => {
    // Savoir POURQUOI on gagne vaut autant que savoir pourquoi on perd.
    expect(() => advanceSubmissionSchema.parse({ stage: 'accepted' })).toThrow()
  })
})

describe('recordFeedbackSchema', () => {
  it('refuse un retour VIDE — ce n’est pas un retour', () => {
    expect(() => recordFeedbackSchema.parse({})).toThrow()
  })

  it('accepte un verbatim seul', () => {
    expect(recordFeedbackSchema.parse({ verbatim: 'Trop cher pour le budget.' }).technical).toBe('unknown')
  })

  it('accepte un axe seul', () => {
    expect(recordFeedbackSchema.parse({ price: 'below' }).price).toBe('below')
  })

  it('laisse « inconnu » par défaut sur chaque axe', () => {
    // Forcer un avis là où le client n'en a pas donné fabriquerait la donnée qui
    // sert ensuite à décider quel profil pousser.
    const parsed = recordFeedbackSchema.parse({ verbatim: 'Rappelez-nous en septembre.' })
    expect(parsed.experience).toBe('unknown')
    expect(parsed.communication).toBe('unknown')
  })

  // #2335.4 — dix critères NOMMÉS (LAU-FINAL-076) : compétence, séniorité,
  // expérience, contexte, communication, disponibilité, TJM, localisation,
  // timing, autre. Quatre existaient (technical/experience/communication/
  // price) ; six s'ajoutent, additifs, jamais un remplacement.
  //
  // #2178.29 — ONZIÈME axe, « personnalité » : le seul des huit axes demandés
  // par #2178 (compétence/séniorité/contexte/timing/budget/personnalité/
  // disponibilité/autre) qui manquait encore — les sept autres couvraient déjà
  // ce périmètre via `technical`/`seniority`/`context`/`timing`/`price`/
  // `availability`/`other`. AJOUTÉ EN FIN (GA-08), jamais inséré au milieu.
  it('couvre les onze axes nommés du retour client', () => {
    expect(FEEDBACK_AXES).toEqual([
      'technical',
      'experience',
      'communication',
      'price',
      'seniority',
      'context',
      'availability',
      'location',
      'timing',
      'other',
      'personality',
    ])
  })

  it('laisse « inconnu » par défaut sur les six nouveaux axes', () => {
    const parsed = recordFeedbackSchema.parse({ price: 'below' })
    expect(parsed.seniority).toBe('unknown')
    expect(parsed.context).toBe('unknown')
    expect(parsed.availability).toBe('unknown')
    expect(parsed.location).toBe('unknown')
    expect(parsed.timing).toBe('unknown')
    expect(parsed.other).toBe('unknown')
  })

  it('accepte un des six nouveaux axes seul, sans verbatim', () => {
    expect(recordFeedbackSchema.parse({ seniority: 'below' }).seniority).toBe('below')
  })

  // #2178.29 — le geste que l'issue empêchait : aucun motif « personnalité »
  // n'existait, un client ne pouvait pas le dire au client history.
  it('accepte l’axe « personnalité », seul, sans verbatim (#2178.29)', () => {
    const parsed = recordFeedbackSchema.parse({ personality: 'below' })
    expect(parsed.personality).toBe('below')
  })

  it('laisse « inconnu » par défaut sur l’axe « personnalité »', () => {
    expect(recordFeedbackSchema.parse({ price: 'below' }).personality).toBe('unknown')
  })

  // #2335.6 — l'apprentissage est une note ADDITIVE : elle ne porte aucune
  // écriture sur le profil, donc ne peut jamais écraser une preuve existante
  // (garde côté service : voir submissions.service.spec.ts).
  it('accepte un apprentissage libre, optionnel', () => {
    const parsed = recordFeedbackSchema.parse({ price: 'below', learning: 'Le TJM annoncé était 100€ trop haut.' })
    expect(parsed.learning).toBe('Le TJM annoncé était 100€ trop haut.')
  })

  it('laisse l’apprentissage `undefined` quand rien n’est dit', () => {
    expect(recordFeedbackSchema.parse({ price: 'below' }).learning).toBeUndefined()
  })
})

describe('submissionFunnel', () => {
  it('compte « sans retour » À PART des refus', () => {
    // Le compter comme un refus ferait croire à un refus argumenté qui n'a pas
    // eu lieu, et ferait chuter le taux sans qu'aucun client n'ait dit non.
    const funnel = submissionFunnel([
      row({ stage: 'rejected', outcomeReason: 'no_feedback' }),
      row({ stage: 'rejected', outcomeReason: 'price' }),
      row({ stage: 'accepted' }),
    ])
    expect(funnel.noFeedback).toBe(1)
    expect(funnel.rejected).toBe(1)
    expect(funnel.accepted).toBe(1)
    // Dénominateur = ceux qui ont VRAIMENT répondu : 1 accepté + 1 refusé.
    expect(funnel.acceptanceRate).toBe(0.5)
  })

  it('rend `null` — et non 0 % — quand rien n’est encore clos', () => {
    const funnel = submissionFunnel([row(), row({ stage: 'interview' })])
    expect(funnel.acceptanceRate).toBeNull()
    expect(funnel.submitted).toBe(2)
  })

  it('ne compte comme ENVOYÉ que ce qui est réellement parti', () => {
    const funnel = submissionFunnel([row({ stage: 'shortlisted', submittedAt: null })])
    expect(funnel.submitted).toBe(0)
    expect(funnel.byStage.shortlisted).toBe(1)
  })

  it('rend une MÉDIANE de latence, pas une moyenne', () => {
    // Un seul retour à trois mois déplacerait une moyenne et ferait croire que
    // le client met un trimestre à répondre.
    //
    // Cinq retours, et pas trois : depuis le 26/08 la médiane refuse de se
    // publier sous `MEASURABILITY_THRESHOLDS.submissionFeedbackDelay`. Le test
    // d'origine en portait trois — il verrouillait donc exactement le défaut
    // qu'on corrige, ce qui est la raison pour laquelle il faut le relire et
    // non le supprimer.
    const funnel = submissionFunnel([
      row({ submittedAt: '2026-08-01T00:00:00.000Z', firstFeedbackAt: '2026-08-02T00:00:00.000Z' }),
      row({ submittedAt: '2026-08-01T00:00:00.000Z', firstFeedbackAt: '2026-08-03T00:00:00.000Z' }),
      row({ submittedAt: '2026-08-01T00:00:00.000Z', firstFeedbackAt: '2026-08-04T00:00:00.000Z' }),
      row({ submittedAt: '2026-08-01T00:00:00.000Z', firstFeedbackAt: '2026-08-05T00:00:00.000Z' }),
      row({ submittedAt: '2026-08-01T00:00:00.000Z', firstFeedbackAt: '2026-11-01T00:00:00.000Z' }),
    ])
    expect(funnel.medianDaysToFeedback).toBe(3)
  })

  it('ne publie AUCUNE médiane sous le plancher d’observations', () => {
    // Le défaut corrigé le 26/08 : une médiane sortait dès le premier retour,
    // avec l'autorité d'un « jours médians », à côté d'un taux d'acceptation
    // qui, lui, refuse déjà de se calculer sans dénominateur.
    const rows = Array.from({ length: MEASURABILITY_THRESHOLDS.submissionFeedbackDelay - 1 }, () =>
      row({ submittedAt: '2026-08-01T00:00:00.000Z', firstFeedbackAt: '2026-08-04T00:00:00.000Z' }),
    )
    expect(submissionFunnel(rows).medianDaysToFeedback).toBeNull()

    // Et le cas symétrique : au plancher exact, elle se publie.
    const atFloor = [
      ...rows,
      row({ submittedAt: '2026-08-01T00:00:00.000Z', firstFeedbackAt: '2026-08-04T00:00:00.000Z' }),
    ]
    expect(submissionFunnel(atFloor).medianDaysToFeedback).toBe(3)
  })

  it('rend `null` de latence quand personne n’a répondu', () => {
    expect(submissionFunnel([row()]).medianDaysToFeedback).toBeNull()
  })

  it('ignore un retour DATÉ AVANT l’envoi plutôt que de compter une durée négative', () => {
    const funnel = submissionFunnel([
      row({ submittedAt: '2026-08-10T00:00:00.000Z', firstFeedbackAt: '2026-08-01T00:00:00.000Z' }),
    ])
    expect(funnel.medianDaysToFeedback).toBeNull()
  })

  it('rend un entonnoir vide sans erreur', () => {
    const funnel = submissionFunnel([])
    expect(funnel.submitted).toBe(0)
    expect(funnel.acceptanceRate).toBeNull()
    expect(funnel.medianDaysToFeedback).toBeNull()
  })
})

// #2335.5 (LAU-FINAL-076) — le retour CONSULTANT, structuré sur huit axes qui
// lui sont propres, JAMAIS mêlés à ceux du retour client (doctrine : « les deux
// feedbacks restent séparés »).
describe('recordConsultantFeedbackSchema', () => {
  it('couvre les huit axes nommés du retour consultant', () => {
    expect(CONSULTANT_FEEDBACK_AXES).toEqual([
      'interest',
      'understanding',
      'manager',
      'mission',
      'conditions',
      'concerns',
      'availability',
      'decision',
    ])
  })

  it('refuse un retour VIDE', () => {
    expect(() => recordConsultantFeedbackSchema.parse({})).toThrow()
  })

  it('accepte un axe seul', () => {
    expect(recordConsultantFeedbackSchema.parse({ interest: 'above' }).interest).toBe('above')
  })

  it('laisse « inconnu » par défaut sur chaque axe', () => {
    const parsed = recordConsultantFeedbackSchema.parse({ decision: 'meets' })
    expect(parsed.manager).toBe('unknown')
    expect(parsed.mission).toBe('unknown')
  })

  it('n’a AUCUN axe en commun de nom avec les dix du retour client au sens du produit', () => {
    // Même mot autorisé (« availability » existe des deux côtés, doctrine du
    // domaine : la disponibilité du consultant n'est pas celle vue par le
    // client) — mais les deux jeux restent des schémas SÉPARÉS, jamais fusionnés
    // dans un seul objet.
    const parsed = recordConsultantFeedbackSchema.parse({ availability: 'below' })
    expect(parsed).not.toHaveProperty('price')
    expect(parsed).not.toHaveProperty('technical')
  })
})

// #2335.2 (LAU-FINAL-076) — reformulé : SEIZE sous-statuts, ADDITIFS à
// `SubmissionStage` (6 valeurs, 12 fichiers appelants — remplacer aurait un
// rayon d'effet trop large pour ce lot). Chaque sous-statut retombe sur une
// étape existante ; la machine de transition est FERMÉE, comme `canTransition`.
describe('les vingt-et-un sous-statuts du pipeline', () => {
  it('couvre les seize statuts nommés par LAU-FINAL-076, plus les cinq du #2940', () => {
    expect(SUBMISSION_SUBSTATUSES).toHaveLength(21)
    expect(SUBMISSION_SUBSTATUSES).toEqual([
      'to_qualify',
      'consultant_agreement_pending',
      'ready_to_present',
      'to_validate',
      'presented',
      'acknowledged',
      'interview_to_schedule',
      'interview_scheduled',
      'interview_done',
      'second_interview',
      'selected',
      'declined',
      'withdrawn',
      'no_response',
      'converted_to_mission',
      'archived',
      'presentation_failed',
      'presented_manually',
      'to_pursue',
      'to_clarify',
      'to_negotiate',
    ])
  })

  it('chaque sous-statut retombe sur UNE étape existante de SubmissionStage', () => {
    for (const substatus of SUBMISSION_SUBSTATUSES) {
      expect(SUBSTATUS_TO_STAGE[substatus]).toBeDefined()
    }
  })

  it('une transition EXPLICITE est autorisée', () => {
    expect(canTransitionSubstatus('to_qualify', 'consultant_agreement_pending')).toBe(true)
    expect(canTransitionSubstatus('presented', 'acknowledged')).toBe(true)
    expect(canTransitionSubstatus('interview_done', 'selected')).toBe(true)
  })

  it('refuse une transition qui saute des étapes — pas de déclaration implicite', () => {
    expect(canTransitionSubstatus('to_qualify', 'selected')).toBe(false)
  })

  it('un statut clos ne repart JAMAIS tout seul, sauf `withdrawn` (même garde que `SubmissionStage`)', () => {
    expect(canTransitionSubstatus('declined', 'to_qualify')).toBe(false)
    expect(canTransitionSubstatus('withdrawn', 'to_qualify')).toBe(true)
  })

  it('`archived` ne mène plus nulle part', () => {
    for (const substatus of SUBMISSION_SUBSTATUSES) {
      expect(canTransitionSubstatus('archived', substatus)).toBe(false)
    }
  })

  it('refuse de rester sur place', () => {
    expect(canTransitionSubstatus('presented', 'presented')).toBe(false)
  })
})

describe('deriveSubstatusFromStage', () => {
  it('nomme le sous-statut d’entrée de chaque étape', () => {
    expect(deriveSubstatusFromStage('shortlisted', null)).toBe('to_qualify')
    expect(deriveSubstatusFromStage('submitted', null)).toBe('presented')
    expect(deriveSubstatusFromStage('interview', null)).toBe('interview_scheduled')
    expect(deriveSubstatusFromStage('accepted', null)).toBe('selected')
    expect(deriveSubstatusFromStage('withdrawn', null)).toBe('withdrawn')
  })

  it('distingue « sans réponse » d’un refus argumenté', () => {
    expect(deriveSubstatusFromStage('rejected', 'no_feedback')).toBe('no_response')
    expect(deriveSubstatusFromStage('rejected', 'price')).toBe('declined')
  })
})

// #2177.11, #2177.12, #2177.13, #2177.15, #2177.20, #2177.21 — les seize
// sous-statuts existaient (#2335.1) mais RIEN ne les faisait avancer une fois
// posés par défaut : `nextSubstatuses` nomme les cibles atteignables depuis le
// sous-statut courant, exactement comme `canTransition` le fait pour l'étape.
describe('nextSubstatuses', () => {
  it('nomme les cibles atteignables depuis « à qualifier »', () => {
    expect(nextSubstatuses('to_qualify')).toEqual(['consultant_agreement_pending', 'withdrawn'])
  })

  it('rend un tableau vide en bout de chaîne', () => {
    expect(nextSubstatuses('archived')).toEqual([])
  })
})

describe('advanceSubstatusSchema', () => {
  it('accepte un sous-statut valide', () => {
    expect(advanceSubstatusSchema.parse({ substatus: 'ready_to_present' }).substatus).toBe('ready_to_present')
  })

  it('refuse une valeur hors des seize sous-statuts', () => {
    expect(() => advanceSubstatusSchema.parse({ substatus: 'invented' })).toThrow()
  })

  it('refuse un champ en trop', () => {
    expect(() => advanceSubstatusSchema.parse({ substatus: 'to_validate', stage: 'submitted' })).toThrow()
  })
})

// #2177.6 / .8 / .24 / .25 / .28 / .30 — les cinq champs de détail, absents
// du contrat jusqu'ici (« AUCUN champ destinataire dans submissionSchema »).
describe('recordSubmissionDetailsSchema', () => {
  it('accepte les cinq champs, tous facultatifs', () => {
    const parsed = recordSubmissionDetailsSchema.parse({
      recipientContactId: '11111111-1111-4111-8111-111111111111',
      channel: 'linkedin',
      message: 'Bonjour, voici le profil proposé.',
      availability: 'Disponible sous deux semaines',
      conditions: 'Télétravail deux jours par semaine',
    })
    expect(parsed.channel).toBe('linkedin')
  })

  it('accepte un objet vide — rien à changer ne fait rien', () => {
    expect(recordSubmissionDetailsSchema.parse({})).toEqual({})
  })

  it('refuse un canal hors des QUATRE valeurs canoniques', () => {
    expect(() => recordSubmissionDetailsSchema.parse({ channel: 'sms' })).toThrow()
  })

  it('refuse un identifiant de contact mal formé', () => {
    expect(() => recordSubmissionDetailsSchema.parse({ recipientContactId: 'pas-un-uuid' })).toThrow()
  })

  it('refuse un champ en trop', () => {
    expect(() => recordSubmissionDetailsSchema.parse({ message: 'ok', stage: 'submitted' })).toThrow()
  })
})

// #2189.20/.21/.33/.34/.36 (épopée #2940) — cinq sous-statuts ADDITIFS :
// l'échec technique d'une présentation, la copie manuelle sans connecteur, et
// trois décisions post-entretien de plus que « second entretien ».
describe('les cinq sous-statuts du #2940', () => {
  it('« échec » et « copié manuellement » se posent depuis « à valider »', () => {
    expect(canTransitionSubstatus('to_validate', 'presentation_failed')).toBe(true)
    expect(canTransitionSubstatus('to_validate', 'presented_manually')).toBe(true)
  })

  it('un échec se retente — il ne saute jamais vers « présenté »', () => {
    expect(canTransitionSubstatus('presentation_failed', 'to_validate')).toBe(true)
    expect(canTransitionSubstatus('presentation_failed', 'presented')).toBe(false)
  })

  it('« copié manuellement » rejoint la même étape que « présenté »', () => {
    expect(SUBSTATUS_TO_STAGE.presented_manually).toBe(SUBSTATUS_TO_STAGE.presented)
    expect(canTransitionSubstatus('presented_manually', 'acknowledged')).toBe(true)
  })

  it('trois décisions post-entretien de plus que « second entretien »', () => {
    expect(canTransitionSubstatus('interview_done', 'to_pursue')).toBe(true)
    expect(canTransitionSubstatus('interview_done', 'to_clarify')).toBe(true)
    expect(canTransitionSubstatus('interview_done', 'to_negotiate')).toBe(true)
  })

  it('« clarifier » retombe sur poursuivre ou négocier, jamais directement sur retenu', () => {
    expect(canTransitionSubstatus('to_clarify', 'to_pursue')).toBe(true)
    expect(canTransitionSubstatus('to_clarify', 'to_negotiate')).toBe(true)
    expect(canTransitionSubstatus('to_clarify', 'selected')).toBe(false)
  })

  it('« présentation échouée » retombe sur l’étape shortlisted — rien n’est encore parti', () => {
    expect(SUBSTATUS_TO_STAGE.presentation_failed).toBe('shortlisted')
  })
})

// #2189.39 (épopée #2940) — la prochaine action d'UN positionnement, toujours
// datée ET attribuée : les trois champs voyagent ensemble.
describe('recordSubmissionNextActionSchema', () => {
  it('accepte les trois champs posés ensemble', () => {
    const parsed = recordSubmissionNextActionSchema.parse({
      label: 'Relancer le client',
      dueAt: '2026-10-01',
      ownerId: '11111111-1111-4111-8111-111111111111',
    })
    expect(parsed.label).toBe('Relancer le client')
  })

  it('accepte les trois champs à null ensemble — effacer l’action', () => {
    const parsed = recordSubmissionNextActionSchema.parse({ label: null, dueAt: null, ownerId: null })
    expect(parsed.label).toBeNull()
  })

  it('refuse une étape sans date', () => {
    expect(() =>
      recordSubmissionNextActionSchema.parse({
        label: 'Relancer le client',
        dueAt: null,
        ownerId: '11111111-1111-4111-8111-111111111111',
      }),
    ).toThrow()
  })

  it('refuse une date sans porteur', () => {
    expect(() =>
      recordSubmissionNextActionSchema.parse({ label: 'Relancer le client', dueAt: '2026-10-01', ownerId: null }),
    ).toThrow()
  })
})

// #2189.11/.13/.16 (épopée #2940) — l'aperçu d'une présentation : l'objet, le
// CV qui part réellement, et la source des arguments avancés.
describe('buildSubmissionPreview', () => {
  const BASE = {
    consultantName: 'Nadia Fournier',
    needRole: 'Renfort SOC',
    projectLabel: 'Mission SOC',
    accountName: 'Banque Fictive',
    cvSnapshot: null as string | null,
  }

  it('nomme le compte et le besoin dans l’objet', () => {
    const preview = buildSubmissionPreview(BASE, null)
    expect(preview.subject).toContain('Renfort SOC')
    expect(preview.subject).toContain('Banque Fictive')
    expect(preview.subject).toContain('Nadia Fournier')
  })

  it('se rabat sur le libellé du projet si aucun rôle de besoin n’est nommé', () => {
    const preview = buildSubmissionPreview({ ...BASE, needRole: null }, null)
    expect(preview.subject).toContain('Mission SOC')
  })

  it('n’affiche AUCUN CV tant qu’aucune version n’est figée', () => {
    const preview = buildSubmissionPreview(BASE, null)
    expect(preview.cv).toBeNull()
    expect(preview.argumentsSource).toBeNull()
  })

  it('nomme la source des arguments quand un CV est figé', () => {
    const preview = buildSubmissionPreview({ ...BASE, cvSnapshot: 'texte du cv' }, '2026-09-20T00:00:00.000Z')
    expect(preview.cv).toEqual({ capturedAt: '2026-09-20T00:00:00.000Z' })
    expect(preview.argumentsSource).not.toBeNull()
  })
})

describe('#4502 — le poste du consultant sur la présentation', () => {
  it('`consultantTitle` est dans le contrat, nullable et optionnel (réponses d’avant)', () => {
    expect(submissionSchema.shape).toHaveProperty('consultantTitle')
    expect(submissionSchema.shape.consultantTitle.isNullable()).toBe(true)
    expect(submissionSchema.shape.consultantTitle.isOptional()).toBe(true)
  })
})
