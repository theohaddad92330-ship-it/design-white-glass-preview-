import { describe, expect, it } from 'vitest'
import { findTalentDuplicates, readExperienceKeys, type TalentIdentity } from './talent-duplicates.js'
import {
  TALENT_DUPLICATE_ACTIONS,
  TALENT_IDENTITY_STATES,
  compareTalentFields,
  explainTalentDuplicate,
  hasIdentitySignal,
  resolveTalentIdentityState,
  stateAfterDecision,
  talentDuplicateDecisionSchema,
} from './talent-identity.js'

/**
 * #2327 — LAU-FINAL-068 : résolution d'identité des talents.
 *
 * La doctrine qui tient tout le fichier (`c37_fusion_doublons`) : on PROPOSE un
 * rapprochement, on ne fusionne JAMAIS. Les tests ci-dessous vérifient donc des
 * PROPOSITIONS — leurs raisons, leurs signaux, leurs contradictions — et jamais
 * une écriture.
 */
function talent(over: Partial<TalentIdentity> & { id: string }): TalentIdentity {
  return { fullName: 'Yanis Berthier', email: null, phone: null, lastEmployer: null, ...over }
}

const CV_A = [
  'YANIS BERTHIER',
  'Expériences',
  '2019 – 2022 · Société Alpha · Ingénieur plateforme',
  '2016 - 2019 | Banque Beta | Développeur Java',
  'Janvier 2022 – aujourd’hui : Groupe Gamma, architecte cloud',
  'Mis à jour le 12 mars 2024',
  '2021',
].join('\n')

describe('#2327.7 — readExperienceKeys : une expérience = un employeur ET une période', () => {
  it('lit les lignes qui portent une PÉRIODE et des mots, et rien d’autre', () => {
    const keys = readExperienceKeys(CV_A)
    expect(keys).toEqual([
      '2019 2022 societe alpha ingenieur plateforme',
      '2016 2019 banque beta developpeur java',
      'janvier 2022 aujourd hui groupe gamma architecte cloud',
    ])
  })

  it('rapproche deux écritures du même intervalle (tirets, séparateurs, casse)', () => {
    const other = readExperienceKeys('2019-2022 — SOCIÉTÉ ALPHA — ingénieur plateforme')
    expect(readExperienceKeys(CV_A)).toContain(other[0])
  })

  it('ne lit rien d’un texte vide ou absent', () => {
    expect(readExperienceKeys(null)).toEqual([])
    expect(readExperienceKeys('   ')).toEqual([])
  })
})

describe('#2327 — les nouvelles sources d’identité', () => {
  it('#2327.4 — le profil public rapproche, quelle que soit son écriture', () => {
    const found = findTalentDuplicates(
      {
        fullName: null,
        email: 'autre@example.fr',
        phone: null,
        lastEmployer: null,
        publicProfileUrl: 'https://www.example.org/in/yanis-b/?ref=cv',
      },
      [talent({ id: 'a', email: 'yanis@example.fr', publicProfileUrl: 'example.org/in/Yanis-B' })],
    )
    expect(found[0]).toMatchObject({ talentId: 'a', reason: 'same_public_profile', confidence: 0.9 })
    // Deux adresses différentes sur la même personne : c'est une contradiction
    // NOMMÉE, pas un détail à taire.
    expect(found[0]?.conflicts).toEqual(['email'])
  })

  it('#2327.6 — le dernier employeur, fourni, fait enfin monter la clé nom + employeur', () => {
    const found = findTalentDuplicates(
      { fullName: 'Marie Dupont', email: null, phone: null, lastEmployer: 'Partenaire Delta' },
      [talent({ id: 'a', fullName: 'Marie Dupont', lastEmployer: 'partenaire delta' })],
    )
    expect(found[0]).toMatchObject({ reason: 'same_name_same_employer', signals: ['name', 'employer'] })
  })

  it('#2327.15 — nom + employeur + période : doublon PROBABLE, plus fort que nom + employeur', () => {
    const found = findTalentDuplicates(
      {
        fullName: 'Yanis Berthier',
        email: null,
        phone: null,
        lastEmployer: null,
        experienceKeys: readExperienceKeys(CV_A),
      },
      [talent({ id: 'a', experienceKeys: readExperienceKeys('2019-2022 Société Alpha Ingénieur plateforme') })],
    )
    expect(found[0]).toMatchObject({ reason: 'same_name_same_employer_period', confidence: 0.7, sharedExperiences: 1 })
  })

  it('#2327.8 — la localisation CORROBORE un nom, elle ne rapproche jamais seule', () => {
    const memeVille = findTalentDuplicates(
      { fullName: 'Marie Dupont', email: null, phone: null, lastEmployer: null, location: 'Lyon' },
      [talent({ id: 'a', fullName: 'Marie Dupont', location: 'lyon ' })],
    )
    expect(memeVille[0]).toMatchObject({ reason: 'same_name_same_location', confidence: 0.4 })

    const villeSeule = findTalentDuplicates(
      { fullName: 'Paul Martin', email: null, phone: null, lastEmployer: null, location: 'Lyon' },
      [talent({ id: 'a', fullName: 'Marie Dupont', location: 'Lyon' })],
    )
    expect(villeSeule).toEqual([])
  })

  it('#2327.9 / #2327.16 — le MÊME document sous deux noms est rapproché, sans rien écraser', () => {
    const found = findTalentDuplicates(
      { fullName: null, email: null, phone: null, lastEmployer: null, documentHashes: ['abc123'] },
      [talent({ id: 'a', fullName: 'Nom différent', documentHashes: ['zzz', 'ABC123'] })],
    )
    expect(found[0]).toMatchObject({ reason: 'same_document', confidence: 0.9, signals: ['document'] })
  })

  it('#2327.10 / #2327.11 / #2327.13 — un identifiant externe fiable donne une forte confiance', () => {
    const found = findTalentDuplicates(
      { fullName: 'Autre Nom', email: null, phone: null, lastEmployer: null, externalIds: ['ats-x:4411'] },
      [talent({ id: 'a', externalIds: ['crm-y:4411', 'ats-x:4411'] })],
    )
    expect(found[0]).toMatchObject({ reason: 'same_external_id', confidence: 0.95 })
    expect(found[0]?.conflicts).toEqual(['name'])

    // Le même numéro chez deux outils différents ne désigne personne en commun.
    const autreOutil = findTalentDuplicates(
      { fullName: 'Autre Nom', email: null, phone: null, lastEmployer: null, externalIds: ['ats-x:4411'] },
      [talent({ id: 'a', externalIds: ['crm-y:4411'] })],
    )
    expect(autreOutil).toEqual([])
  })

  it('CV anonymisé — des expériences identiques, sans nom, posent la question', () => {
    const keys = readExperienceKeys(CV_A)
    const found = findTalentDuplicates(
      { fullName: null, email: null, phone: null, lastEmployer: null, experienceKeys: keys },
      [talent({ id: 'a', experienceKeys: keys })],
    )
    expect(found[0]).toMatchObject({ reason: 'same_experiences', confidence: 0.5, sharedExperiences: 3 })

    // UNE seule ligne commune, sans nom : deux personnes passées par la même
    // société la même année. Ce n'est pas assez.
    const uneSeule = findTalentDuplicates(
      { fullName: null, email: null, phone: null, lastEmployer: null, experienceKeys: keys.slice(0, 1) },
      [talent({ id: 'a', experienceKeys: keys })],
    )
    expect(uneSeule).toEqual([])
  })

  it('#2327.26 — un rapprochement porte TOUT ce qui concorde, pas seulement sa clé', () => {
    const keys = readExperienceKeys(CV_A)
    const found = findTalentDuplicates(
      { fullName: 'Yanis Berthier', email: 'yanis@example.fr', phone: null, lastEmployer: null, experienceKeys: keys },
      [talent({ id: 'a', email: 'YANIS@example.fr', experienceKeys: keys })],
    )
    expect(found[0]).toMatchObject({
      reason: 'same_email',
      signals: ['email', 'name', 'experiences'],
      sharedExperiences: 3,
      conflicts: [],
    })
  })
})

describe('#2327.23 / #2327.24 — jamais entre deux espaces, ni avec un référentiel public', () => {
  it('écarte une fiche d’un autre espace, même à adresse identique', () => {
    const found = findTalentDuplicates(
      { fullName: 'Yanis Berthier', email: 'yanis@example.fr', phone: null, lastEmployer: null, workspaceId: 'w1' },
      [
        talent({ id: 'autre-espace', email: 'yanis@example.fr', workspaceId: 'w2' }),
        // Un référentiel public n'appartient à aucun espace : il reste séparé.
        talent({ id: 'public', email: 'yanis@example.fr', workspaceId: null }),
        talent({ id: 'meme-espace', email: 'yanis@example.fr', workspaceId: 'w1' }),
      ],
    )
    expect(found.map(match => match.talentId)).toEqual(['meme-espace'])
  })

  it('ne se compare jamais à elle-même', () => {
    const found = findTalentDuplicates(
      { fullName: 'Yanis Berthier', email: null, phone: null, lastEmployer: null, selfId: 'a' },
      [talent({ id: 'a' }), talent({ id: 'b' })],
    )
    expect(found.map(match => match.talentId)).toEqual(['b'])
  })
})

describe('#2327.18 — les sept états', () => {
  const match = (over: Partial<ReturnType<typeof findTalentDuplicates>[number]>) => ({
    talentId: 'a',
    fullName: 'Yanis Berthier',
    reason: 'same_name' as const,
    confidence: 0.3,
    signals: ['name' as const],
    sharedExperiences: 0,
    conflicts: [],
    ...over,
  })

  it('liste les sept états du document, dans son ordre', () => {
    expect(TALENT_IDENTITY_STATES).toEqual([
      'resolved',
      'probable_duplicate',
      'ambiguous',
      'new',
      'updated',
      'conflicting',
      'ignored',
    ])
  })

  it('dérive l’état des propositions — jamais une fusion', () => {
    expect(resolveTalentIdentityState([])).toBe('new')
    expect(resolveTalentIdentityState([match({ reason: 'same_email', confidence: 0.95 })])).toBe('resolved')
    expect(resolveTalentIdentityState([match({ reason: 'same_name_same_employer_period', confidence: 0.7 })])).toBe(
      'probable_duplicate',
    )
    // Même nom : jamais suffisant (NO-GO du chapitre).
    expect(resolveTalentIdentityState([match({})])).toBe('ambiguous')
    // Deux fiches probables à la fois : on ne sait pas laquelle.
    expect(
      resolveTalentIdentityState([
        match({ talentId: 'a', reason: 'same_phone', confidence: 0.8 }),
        match({ talentId: 'b', reason: 'same_name_same_employer', confidence: 0.6 }),
      ]),
    ).toBe('ambiguous')
  })

  it('« données contradictoires » : une clé forte et un champ qui diverge', () => {
    expect(resolveTalentIdentityState([match({ reason: 'same_email', confidence: 0.95, conflicts: ['name'] })])).toBe(
      'conflicting',
    )
    // Deux clés fortes qui désignent deux fiches différentes.
    expect(
      resolveTalentIdentityState([
        match({ talentId: 'a', reason: 'same_email', confidence: 0.95 }),
        match({ talentId: 'b', reason: 'same_document', confidence: 0.9 }),
      ]),
    ).toBe('conflicting')
  })

  it('l’état après une décision humaine', () => {
    expect(stateAfterDecision('update_existing', 'probable_duplicate')).toBe('updated')
    expect(stateAfterDecision('ignore', 'probable_duplicate')).toBe('ignored')
    expect(stateAfterDecision('keep_separate', 'resolved')).toBe('new')
    // Confier la question à quelqu'un ne la tranche pas.
    expect(stateAfterDecision('assign_to_recruiter', 'ambiguous')).toBe('ambiguous')
  })
})

describe('#2327.20 — les actions ouvertes', () => {
  it('quatre actions, et « fusionner » n’en fait PAS partie (c37_fusion_doublons)', () => {
    expect(TALENT_DUPLICATE_ACTIONS).toEqual(['keep_separate', 'update_existing', 'ignore', 'assign_to_recruiter'])
    expect(talentDuplicateDecisionSchema.safeParse({ otherTalentId: UUID, action: 'merge' }).success).toBe(false)
  })

  it('« attribuer » exige quelqu’un à qui attribuer', () => {
    expect(
      talentDuplicateDecisionSchema.safeParse({ otherTalentId: UUID, action: 'assign_to_recruiter' }).success,
    ).toBe(false)
    expect(
      talentDuplicateDecisionSchema.safeParse({ otherTalentId: UUID, action: 'assign_to_recruiter', assigneeId: UUID })
        .success,
    ).toBe(true)
  })
})

const UUID = '9d359267-f7ee-430f-a614-2044a2e77ab5'

describe('#2327.19 — compareTalentFields : identiques, différents, absents d’un côté', () => {
  it('range chaque champ, sans confondre « absent » et « différent »', () => {
    const result = compareTalentFields(
      { fullName: 'Yanis Berthier', email: 'yanis@example.fr', phone: '06 00 00 00 01', title: null, location: 'Lyon' },
      {
        fullName: 'YANIS  berthier',
        email: 'y.berthier@example.fr',
        phone: '+33600000001',
        title: 'Dev',
        location: null,
      },
    )
    expect(result.identical).toEqual(['fullName', 'phone'])
    expect(result.different).toEqual(['email'])
    expect(result.oneSided).toEqual(['title', 'location'])
  })
})

describe('#2327.26 — explainTalentDuplicate : la phrase que Laura peut dire', () => {
  it('reprend la formulation du chapitre', () => {
    const keys = readExperienceKeys(CV_A)
    const [found] = findTalentDuplicates(
      { fullName: 'Autre', email: 'yanis@example.fr', phone: null, lastEmployer: null, experienceKeys: keys },
      [talent({ id: 'a', fullName: 'Autre', email: 'yanis@example.fr', experienceKeys: keys })],
    )
    expect(found && explainTalentDuplicate(found, 'fr')).toBe(
      'Ces deux fiches semblent appartenir à la même personne parce qu’elles partagent le même e-mail, le même nom et trois expériences identiques.',
    )
    expect(found && explainTalentDuplicate(found, 'en')).toBe(
      'These two records seem to belong to the same person because they share the same email, the same name and three identical experiences.',
    )
  })

  it('NO-GO — le nom seul est dit INSUFFISANT, jamais présenté comme une preuve', () => {
    const [found] = findTalentDuplicates({ fullName: 'Marie Dupont', email: null, phone: null, lastEmployer: null }, [
      talent({ id: 'a', fullName: 'Marie Dupont' }),
    ])
    expect(found && explainTalentDuplicate(found, 'fr')).toBe(
      'Ces deux fiches portent le même nom, et rien d’autre ne concorde : ce n’est pas suffisant pour dire qu’il s’agit de la même personne.',
    )
  })

  it('nomme la contradiction', () => {
    const [found] = findTalentDuplicates(
      { fullName: 'Paul Martin', email: 'yanis@example.fr', phone: null, lastEmployer: null },
      [talent({ id: 'a', email: 'yanis@example.fr' })],
    )
    expect(found && explainTalentDuplicate(found, 'fr')).toBe(
      'Ces deux fiches semblent appartenir à la même personne parce qu’elles partagent le même e-mail. À vérifier : le nom diffère.',
    )
  })
})

/**
 * #2183.13 — LE PALIER DE CONFIANCE À LA CRÉATION.
 *
 * La création (`new`) ne demandait jusqu'ici qu'une chose : « aucune fiche ne
 * ressemble ». Un candidat SANS AUCUN signal d'identité — ni nom, ni e-mail,
 * ni téléphone, ni expérience lue — passait cette barre en silence : on n'a
 * rien comparé, donc « aucune ressemblance » n'est pas une conclusion, c'est
 * une absence de question posée. `hasIdentitySignal` nomme ce plancher.
 */
describe('hasIdentitySignal — #2183.13', () => {
  it('porte un signal avec un nom seul', () => {
    expect(hasIdentitySignal({ fullName: 'Yanis Berthier', email: null, phone: null })).toBe(true)
  })

  it('porte un signal avec un e-mail seul', () => {
    expect(hasIdentitySignal({ fullName: null, email: 'y@example.fr', phone: null })).toBe(true)
  })

  it('porte un signal avec des expériences lues, même sans identité déclarée', () => {
    expect(
      hasIdentitySignal({ fullName: null, email: null, phone: null, experienceKeys: ['2019 2022 alpha ingenieur'] }),
    ).toBe(true)
  })

  it('ne porte AUCUN signal — nom, e-mail, téléphone et expériences tous vides', () => {
    expect(hasIdentitySignal({ fullName: null, email: null, phone: null, experienceKeys: [] })).toBe(false)
  })

  it('une chaîne blanche ne vaut pas un signal', () => {
    expect(hasIdentitySignal({ fullName: '   ', email: null, phone: null })).toBe(false)
  })
})
