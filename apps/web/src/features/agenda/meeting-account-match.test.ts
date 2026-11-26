import type { AgendaEvent } from '@bellum/contracts'
import {
  externalAccountCandidatesForEvent,
  isConfidentialAgendaEvent,
  isPersonalAgendaEvent,
  isPostMeetingRecapCandidate,
  isRecurringAgendaEvent,
  matchAccountForEvent,
  matchLinkedRecordForEvent,
  resolveAssociatedAccount,
  type MatchableAccount,
  type MatchableLinkedRecord,
} from './meeting-account-match'

const ACCOUNTS: MatchableAccount[] = [
  { id: 'a1', company_name: 'ACME Industries', website: 'https://www.acme.fr/contact' },
  { id: 'a2', company_name: 'Verdal Distribution', website: 'verdal-distribution.example' },
  { id: 'a3', company_name: 'TF1', website: null },
  { id: 'a4', company_name: 'TF1 Publicité', website: null },
  { id: 'a5', company_name: 'SG', website: null },
]

function event(partial: Partial<AgendaEvent>): Pick<AgendaEvent, 'summary' | 'attendees' | 'visibility'> {
  return { summary: null, attendees: [], visibility: null, ...partial } as Pick<
    AgendaEvent,
    'summary' | 'attendees' | 'visibility'
  >
}

const guest = (email: string, external = true) =>
  ({ email, displayName: null, responseStatus: null, external }) as AgendaEvent['attendees'][number]

describe('matchAccountForEvent', () => {
  it('rattache par le DOMAINE d’un invité externe', () => {
    // Une preuve : l'adresse dit chez qui travaille la personne, quel que soit
    // le titre donné à la réunion.
    const match = matchAccountForEvent(
      event({ summary: 'Point hebdo', attendees: [guest('j.morvan@verdal-distribution.example')] }),
      ACCOUNTS,
    )
    expect(match?.id).toBe('a2')
  })

  it('ignore le domaine d’un invité INTERNE', () => {
    // Un collègue ne rattache pas la réunion à son propre employeur.
    const match = matchAccountForEvent(
      event({ summary: 'Point interne', attendees: [guest('moi@acme.fr', false)] }),
      ACCOUNTS,
    )
    expect(match).toBeNull()
  })

  it('sait lire un domaine derrière un www et un chemin', () => {
    const match = matchAccountForEvent(event({ attendees: [guest('c@acme.fr')] }), ACCOUNTS)
    expect(match?.id).toBe('a1')
  })

  it('retombe sur le nom dans le titre quand aucun domaine ne tranche', () => {
    const match = matchAccountForEvent(event({ summary: 'Cadrage ACME Industries 2027' }), ACCOUNTS)
    expect(match?.id).toBe('a1')
  })

  it('préfère le nom le PLUS précis', () => {
    // « TF1 » et « TF1 Publicité » coexistent : le plus long qui apparaît gagne.
    const match = matchAccountForEvent(event({ summary: 'Point TF1 Publicité' }), ACCOUNTS)
    expect(match?.id).toBe('a4')
  })

  it('ne cherche JAMAIS un nom trop court dans un titre', () => {
    // « SG » apparaîtrait dans « SGDF » et dans la moitié des phrases.
    expect(matchAccountForEvent(event({ summary: 'Réunion SGDF scouts' }), ACCOUNTS)).toBeNull()
  })

  it('le domaine l’emporte sur le titre', () => {
    // Le titre nomme un compte, l'invité en désigne un autre : c'est l'adresse
    // qui fait foi, parce qu'elle ne se trompe pas de société.
    const match = matchAccountForEvent(
      event({ summary: 'Cadrage ACME Industries', attendees: [guest('x@verdal-distribution.example')] }),
      ACCOUNTS,
    )
    expect(match?.id).toBe('a2')
  })

  it('rend null plutôt que de rattacher au hasard', () => {
    // Préparer la mauvaise réunion est pire que ne pas la préparer.
    expect(matchAccountForEvent(event({ summary: 'Déjeuner' }), ACCOUNTS)).toBeNull()
    expect(matchAccountForEvent(event({}), ACCOUNTS)).toBeNull()
    expect(matchAccountForEvent(event({ summary: 'ACME Industries' }), [])).toBeNull()
  })

  // #2319.18 — une réunion PERSONNELLE (Microsoft `sensitivity: personal`) ne
  // se rattache à AUCUN compte, même si son titre contient par coïncidence le
  // nom d'un client (« Appel ACME Industries — plombier ») : matcher au
  // hasard sur une réunion privée fuiterait un dossier client dans un moment
  // qui n'a rien à voir avec le travail.
  it('ne rattache JAMAIS une réunion PERSONNELLE, même si son titre nomme un compte', () => {
    expect(matchAccountForEvent(event({ summary: 'ACME Industries', visibility: 'personal' }), ACCOUNTS)).toBeNull()
    expect(
      matchAccountForEvent(
        event({ summary: 'RDV perso', visibility: 'personal', attendees: [guest('c@acme.fr')] }),
        ACCOUNTS,
      ),
    ).toBeNull()
  })
})

// #2103.30 — PLUSIEURS ENTREPRISES INVITÉES : `matchAccountForEvent` devinait
// silencieusement la PREMIÈRE quand deux domaines externes désignaient deux
// comptes distincts. Cette fonction rend la liste ENTIÈRE : `length > 1` est
// le signal qu'un choix humain est nécessaire (voir `MeetingPrepDialog.tsx`).
describe('externalAccountCandidatesForEvent', () => {
  it('rend UN candidat quand un seul domaine externe tranche', () => {
    const candidates = externalAccountCandidatesForEvent(event({ attendees: [guest('c@acme.fr')] }), ACCOUNTS)
    expect(candidates.map(a => a.id)).toEqual(['a1'])
  })

  it('rend les DEUX comptes quand deux domaines externes désignent deux comptes distincts', () => {
    const candidates = externalAccountCandidatesForEvent(
      event({
        summary: 'Point à trois',
        attendees: [guest('c@acme.fr'), guest('j.morvan@verdal-distribution.example')],
      }),
      ACCOUNTS,
    )
    expect(candidates.map(a => a.id).sort()).toEqual(['a1', 'a2'])
  })

  it('ne compte pas deux fois le MÊME compte pour deux domaines qui le désignent tous les deux', () => {
    const candidates = externalAccountCandidatesForEvent(
      event({ attendees: [guest('c@acme.fr'), guest('d@acme.fr')] }),
      ACCOUNTS,
    )
    expect(candidates.map(a => a.id)).toEqual(['a1'])
  })

  it('ignore les invités INTERNES et les domaines sans compte', () => {
    const candidates = externalAccountCandidatesForEvent(
      event({ attendees: [guest('moi@acme.fr', false), guest('x@inconnu.example')] }),
      ACCOUNTS,
    )
    expect(candidates).toEqual([])
  })

  it('rend une liste vide sans invité externe', () => {
    expect(externalAccountCandidatesForEvent(event({}), ACCOUNTS)).toEqual([])
  })

  it('rend une liste vide sur une réunion PERSONNELLE, même avec un invité externe', () => {
    expect(
      externalAccountCandidatesForEvent(event({ visibility: 'personal', attendees: [guest('c@acme.fr')] }), ACCOUNTS),
    ).toEqual([])
  })
})

// #2319.18 — une réunion PERSONNELLE, distincte d'un point interne.
describe('isPersonalAgendaEvent', () => {
  it('reconnaît une réunion PERSONNELLE (Microsoft `sensitivity: personal`)', () => {
    expect(isPersonalAgendaEvent(event({ visibility: 'personal' }))).toBe(true)
  })

  it('ne confond pas un point interne (visibilité normale) avec une réunion personnelle', () => {
    expect(isPersonalAgendaEvent(event({ visibility: null }))).toBe(false)
    expect(isPersonalAgendaEvent(event({ visibility: 'normal' }))).toBe(false)
  })
})

// #2319.10 — le niveau de confidentialité, résolu pour l'affichage.
describe('isConfidentialAgendaEvent', () => {
  it('reconnaît un rendez-vous marqué CONFIDENTIEL par le calendrier', () => {
    expect(isConfidentialAgendaEvent(event({ visibility: 'confidential' }))).toBe(true)
  })

  it('rend `false` sur une visibilité normale ou absente', () => {
    expect(isConfidentialAgendaEvent(event({ visibility: null }))).toBe(false)
    expect(isConfidentialAgendaEvent(event({ visibility: 'normal' }))).toBe(false)
  })

  it('un rendez-vous PERSONNEL n’est pas CONFIDENTIEL — deux notions distinctes', () => {
    expect(isConfidentialAgendaEvent(event({ visibility: 'personal' }))).toBe(false)
  })
})

// #2319.14 — événement récurrent, nommé dans la Résolution du rendez-vous.
describe('isRecurringAgendaEvent', () => {
  it('reconnaît une occurrence d’une série (recurringEventId / seriesMasterId déjà résolus par #2103.29)', () => {
    expect(isRecurringAgendaEvent({ recurring: true })).toBe(true)
  })

  it('rend `false` sur un événement non récurrent', () => {
    expect(isRecurringAgendaEvent({ recurring: false })).toBe(false)
  })

  it('un champ ABSENT (réponse antérieure à #2103.29) se lit « non récurrent », jamais « inconnu »', () => {
    expect(isRecurringAgendaEvent({ recurring: undefined })).toBe(false)
  })
})

// #2319.6 / #2319.7 / #2319.8 — LAQUELLE opportunité/besoin/mission DÉJÀ liée
// au compte ce rendez-vous vise-t-il, quand son nom apparaît dans le titre ?
describe('matchLinkedRecordForEvent', () => {
  const RECORDS: MatchableLinkedRecord[] = [
    { id: 'o1', label: 'Migration cloud' },
    { id: 'o2', label: 'Migration cloud — lot 2' },
    { id: 'n1', label: 'TJM' },
  ]

  it('retombe sur le libellé qui apparaît dans le titre', () => {
    const match = matchLinkedRecordForEvent({ summary: 'Point Migration cloud' }, RECORDS)
    expect(match?.id).toBe('o1')
  })

  it('préfère le libellé le PLUS précis', () => {
    const match = matchLinkedRecordForEvent({ summary: 'Cadrage Migration cloud — lot 2' }, RECORDS)
    expect(match?.id).toBe('o2')
  })

  it('ne cherche jamais un libellé trop court', () => {
    // « TJM » apparaîtrait dans la moitié des titres de rendez-vous.
    expect(matchLinkedRecordForEvent({ summary: 'Point TJM consultants' }, RECORDS)).toBeNull()
  })

  it('rend `null` plutôt qu’une fiche devinée au hasard', () => {
    expect(matchLinkedRecordForEvent({ summary: 'Déjeuner' }, RECORDS)).toBeNull()
    expect(matchLinkedRecordForEvent({ summary: null }, RECORDS)).toBeNull()
    expect(matchLinkedRecordForEvent({ summary: 'Migration cloud' }, [])).toBeNull()
  })
})

// #2319.16 / #2319.131 — LE COMPTE ASSOCIÉ, CORRIGIBLE : un geste utilisateur
// gagne toujours sur le rattachement automatique, juste ou pas.
describe('resolveAssociatedAccount', () => {
  it('suit le rattachement automatique sans correction', () => {
    const resolved = resolveAssociatedAccount(event({ summary: 'Cadrage ACME Industries' }), ACCOUNTS, null)
    expect(resolved?.id).toBe('a1')
  })

  it('une CORRECTION gagne sur un rattachement automatique erroné', () => {
    // Le titre matche ACME (a1), mais l'utilisateur sait que c'est en fait Verdal.
    const resolved = resolveAssociatedAccount(event({ summary: 'Cadrage ACME Industries' }), ACCOUNTS, 'a2')
    expect(resolved?.id).toBe('a2')
  })

  it('une CORRECTION gagne aussi quand rien n’avait été rattaché', () => {
    const resolved = resolveAssociatedAccount(event({ summary: 'Déjeuner' }), ACCOUNTS, 'a3')
    expect(resolved?.id).toBe('a3')
  })

  it('sans correction, une AMBIGUÏTÉ (deux comptes désignés) rend `null` — pas un choix au hasard', () => {
    const resolved = resolveAssociatedAccount(
      event({ attendees: [guest('c@acme.fr'), guest('j.morvan@verdal-distribution.example')] }),
      ACCOUNTS,
      null,
    )
    expect(resolved).toBeNull()
  })

  it('une correction TRANCHE l’ambiguïté', () => {
    const resolved = resolveAssociatedAccount(
      event({ attendees: [guest('c@acme.fr'), guest('j.morvan@verdal-distribution.example')] }),
      ACCOUNTS,
      'a2',
    )
    expect(resolved?.id).toBe('a2')
  })

  it('un identifiant de correction inconnu rend `null` plutôt qu’un rattachement automatique caché', () => {
    expect(resolveAssociatedAccount(event({ summary: 'Cadrage ACME Industries' }), ACCOUNTS, 'inconnu')).toBeNull()
  })
})

// #2103.1 — LE DÉCLENCHEUR post-RDV : proposer un CR seulement pour un
// rendez-vous EXTERNE et TERMINÉ.
describe('isPostMeetingRecapCandidate', () => {
  const NOW = new Date('2026-09-26T14:00:00.000Z')
  const base = { isPersonal: false, isInternalMeeting: false, now: NOW }

  it('rendez-vous externe déjà terminé — candidat', () => {
    expect(isPostMeetingRecapCandidate({ end: '2026-09-26T13:00:00.000Z' }, base)).toBe(true)
  })

  it('rendez-vous pas encore terminé — pas candidat', () => {
    expect(isPostMeetingRecapCandidate({ end: '2026-09-26T15:00:00.000Z' }, base)).toBe(false)
  })

  it('sans heure de fin connue — pas candidat, jamais deviné', () => {
    expect(isPostMeetingRecapCandidate({ end: null }, base)).toBe(false)
  })

  it('réunion PERSONNELLE terminée — jamais candidate (#2319.18)', () => {
    expect(isPostMeetingRecapCandidate({ end: '2026-09-26T13:00:00.000Z' }, { ...base, isPersonal: true })).toBe(false)
  })

  it('point INTERNE terminé — jamais candidat', () => {
    expect(isPostMeetingRecapCandidate({ end: '2026-09-26T13:00:00.000Z' }, { ...base, isInternalMeeting: true })).toBe(
      false,
    )
  })
})
