import { describe, expect, it } from 'vitest'
import {
  accessLevelFact,
  accountAccessLevel,
  detectedPartnersFrom,
  PARTNER_RANKS,
  partnerScore,
  qualifyAccountPartnerSchema,
  qualifyRank2,
  rank1Recommendation,
} from './partner.js'

/**
 * Les partenaires présents sur un compte (PDF 2 §4.1, décision D11).
 *
 * Ce que ces fonctions tranchent est la question la plus structurante d'une
 * vente ESN : est-ce qu'on attaque en direct, ou est-ce qu'on passe par
 * quelqu'un ? Le §2 le dit — le rang 1 est une propriété de l'ENTITÉ, pas du
 * compte : on ne traite pas avec « EDF », on traite avec une DSI qui a, ou non,
 * son intégrateur en place.
 */
describe('rank1Recommendation', () => {
  it('recommande d’aller CHERCHER l’information quand on ne sait pas', () => {
    // « On ne sait pas » et « il n'y en a pas » mènent à deux stratégies
    // opposées. Les confondre fait attaquer en direct un compte verrouillé.
    const verdict = rank1Recommendation({ rank1Incumbent: 'unknown', partners: [] })
    expect(verdict.play).toBe('find_out')
    expect(verdict.reason).toBeTruthy()
  })

  it('recommande le direct quand aucun rang 1 n’est en place', () => {
    expect(rank1Recommendation({ rank1Incumbent: 'no', partners: [] }).play).toBe('direct')
  })

  it('recommande de passer par le rang 1 quand on en connaît un', () => {
    const verdict = rank1Recommendation({
      rank1Incumbent: 'yes',
      partners: [{ name: 'Sopra', rank: 'rank1', relationship: 'partner' }],
    })
    expect(verdict.play).toBe('through_partner')
    expect(verdict.partner).toBe('Sopra')
  })

  it('recommande de DÉLOGER quand le rang 1 en place est un concurrent, pas un partenaire', () => {
    // La nuance est tout le sujet : un rang 1 avec qui on travaille est une
    // porte d'entrée, un rang 1 avec qui on ne travaille pas est un mur.
    const verdict = rank1Recommendation({
      rank1Incumbent: 'yes',
      partners: [{ name: 'Capgemini', rank: 'rank1', relationship: 'competitor' }],
    })
    expect(verdict.play).toBe('displace')
    expect(verdict.partner).toBe('Capgemini')
  })

  it('dit qu’il faut chercher QUI, quand un rang 1 est déclaré sans être nommé', () => {
    const verdict = rank1Recommendation({ rank1Incumbent: 'yes', partners: [] })
    expect(verdict.play).toBe('find_out')
  })

  // #3205.6 (épopée #3239) — les deux issues manquantes de la spec, ajoutées
  // SEULEMENT quand une donnée réelle les justifie, jamais devinées.
  describe('target_other_subsidiary et differentiate (#3205.6)', () => {
    it('vise une AUTRE filiale déjà connue ouverte plutôt que de déloger un mur', () => {
      const verdict = rank1Recommendation({
        rank1Incumbent: 'yes',
        partners: [{ name: 'Capgemini', rank: 'rank1', relationship: 'competitor' }],
        otherOpenEntity: 'Filiale Assurance',
      })
      expect(verdict.play).toBe('target_other_subsidiary')
      expect(verdict.partner).toBe('Filiale Assurance')
    })

    it('se différencie plutôt que déloger quand le positionnement propre est niche/expertise', () => {
      const verdict = rank1Recommendation({
        rank1Incumbent: 'yes',
        partners: [{ name: 'Capgemini', rank: 'rank1', relationship: 'competitor' }],
        sellingPosture: 'nicheVerticals',
      })
      expect(verdict.play).toBe('differentiate')
      expect(verdict.partner).toBe('Capgemini')
    })

    it('une autre filiale ouverte l’emporte sur la différenciation quand les deux sont vraies', () => {
      const verdict = rank1Recommendation({
        rank1Incumbent: 'yes',
        partners: [{ name: 'Capgemini', rank: 'rank1', relationship: 'competitor' }],
        otherOpenEntity: 'Filiale Assurance',
        sellingPosture: 'nicheVerticals',
      })
      expect(verdict.play).toBe('target_other_subsidiary')
    })

    it('une posture de volume/prix ne déclenche jamais la différenciation : reste displace', () => {
      const verdict = rank1Recommendation({
        rank1Incumbent: 'yes',
        partners: [{ name: 'Capgemini', rank: 'rank1', relationship: 'competitor' }],
        sellingPosture: 'volumeFlexible',
      })
      expect(verdict.play).toBe('displace')
    })

    it('sans autre filiale ni posture déclarée, le comportement historique ne change pas', () => {
      const verdict = rank1Recommendation({
        rank1Incumbent: 'yes',
        partners: [{ name: 'Capgemini', rank: 'rank1', relationship: 'competitor' }],
      })
      expect(verdict.play).toBe('displace')
    })
  })
})

describe('accountAccessLevel (#2646.1, décision Louis 20/09/2026)', () => {
  it('nomme `direct` quand aucun rang 1 n’est en place', () => {
    expect(accountAccessLevel({ rank1Incumbent: 'no', hasDeclaredPartner: false })).toBe('direct')
    // Même sans rang 1, un partenaire déclaré ne change rien : la porte est
    // déjà ouverte, ce n'est pas « rang 2 » qui décrirait mieux l'état.
    expect(accountAccessLevel({ rank1Incumbent: 'no', hasDeclaredPartner: true })).toBe('direct')
  })

  it('reste `inconnu` quand le rang 1 n’est pas établi — jamais `rang3_plus` par défaut (GA-18/GA-19)', () => {
    expect(accountAccessLevel({ rank1Incumbent: 'unknown', hasDeclaredPartner: false })).toBe('inconnu')
    expect(accountAccessLevel({ rank1Incumbent: 'unknown', hasDeclaredPartner: true })).toBe('inconnu')
  })

  it('nomme `rang2` quand un rang 1 est en place ET qu’un partenaire est déclaré', () => {
    expect(accountAccessLevel({ rank1Incumbent: 'yes', hasDeclaredPartner: true })).toBe('rang2')
  })

  it('nomme `rang3_plus` — la règle exacte de Louis : rang 1 concurrent ET aucun partenaire déclaré', () => {
    expect(accountAccessLevel({ rank1Incumbent: 'yes', hasDeclaredPartner: false })).toBe('rang3_plus')
  })
})

describe('accessLevelFact (#2646.1, badge sans preuve, corrigé le 21/09/2026)', () => {
  it('nomme les entités OUVERTES qui fondent `direct`', () => {
    const fact = accessLevelFact({
      rank1Incumbent: 'no',
      entities: [
        { name: 'Siège', rank1Incumbent: 'no' },
        { name: 'DSI Sud', rank1Incumbent: 'no' },
      ],
      partnerName: null,
    })
    expect(fact).toEqual({ kind: 'no_incumbent', entities: ['Siège', 'DSI Sud'] })
  })

  it('rend `null` pour `inconnu` — aucun fait n’est établi, en inventer un serait mentir', () => {
    const fact = accessLevelFact({
      rank1Incumbent: 'unknown',
      entities: [{ name: 'Siège', rank1Incumbent: 'unknown' }],
      partnerName: null,
    })
    expect(fact).toBeNull()
  })

  it('nomme l’entité verrouillée ET le partenaire qui fondent `rang2`', () => {
    const fact = accessLevelFact({
      rank1Incumbent: 'yes',
      entities: [{ name: 'DSI', rank1Incumbent: 'yes' }],
      partnerName: 'Sopra',
    })
    expect(fact).toEqual({ kind: 'incumbent_with_partner', entities: ['DSI'], partner: 'Sopra' })
  })

  it('nomme l’entité verrouillée SANS partenaire pour `rang3_plus`', () => {
    const fact = accessLevelFact({
      rank1Incumbent: 'yes',
      entities: [{ name: 'DSI', rank1Incumbent: 'yes' }],
      partnerName: null,
    })
    expect(fact).toEqual({ kind: 'incumbent_without_partner', entities: ['DSI'] })
  })
})

describe('partnerScore', () => {
  it('pèse plus lourd quand le partenaire est en rang 1', () => {
    const rank1 = partnerScore({ rank: 'rank1', relationship: 'partner', placements: 0 })
    const rank2 = partnerScore({ rank: 'rank2', relationship: 'partner', placements: 0 })
    expect(rank1).toBeGreaterThan(rank2)
  })

  it('pèse plus lourd quand on a déjà placé chez lui', () => {
    const withPlacements = partnerScore({ rank: 'rank2', relationship: 'partner', placements: 3 })
    const without = partnerScore({ rank: 'rank2', relationship: 'partner', placements: 0 })
    expect(withPlacements).toBeGreaterThan(without)
  })

  it('ne dépasse jamais 100 et ne descend jamais sous 0', () => {
    expect(partnerScore({ rank: 'rank1', relationship: 'partner', placements: 999 })).toBeLessThanOrEqual(100)
    expect(partnerScore({ rank: 'unknown', relationship: 'competitor', placements: 0 })).toBeGreaterThanOrEqual(0)
  })

  it('couvre les trois rangs', () => {
    for (const rank of PARTNER_RANKS) {
      expect(partnerScore({ rank, relationship: 'partner', placements: 0 })).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('detectedPartnersFrom', () => {
  it('maps an esnPresence entry to a partner row', () => {
    const [row] = detectedPartnersFrom([
      {
        name: 'Capgemini',
        certainty: 'forte',
        scope: 'TMA SAP sur la DSI groupe',
        detectedAt: '2026-08-22',
        competeAngle: 'jouer la séniorité',
        partnershipAngle: 'se placer en rang 2 sur le run',
      },
    ])
    expect(row).toEqual({
      name: 'Capgemini',
      certainty: 'forte',
      scope: 'TMA SAP sur la DSI groupe',
      detectedAt: '2026-08-22',
      note: 'jouer la séniorité · se placer en rang 2 sur le run',
    })
  })

  it('defaults a missing certainty to the level that asks for a check', () => {
    // Un dossier analysé AVANT le tome 1 n'a pas de certitude. La supposer
    // « forte » ferait passer une inférence ancienne pour une donnée vérifiée.
    const [row] = detectedPartnersFrom([{ name: 'Atos' }])
    expect(row?.certainty).toBe('faible')
  })

  it('never invents a scope or a detection date', () => {
    const [row] = detectedPartnersFrom([{ name: 'Atos' }])
    expect(row?.scope).toBeNull()
    expect(row?.detectedAt).toBeNull()
  })

  it('drops an entry with no usable name rather than writing an anonymous row', () => {
    expect(detectedPartnersFrom([{ name: '   ' }, { name: 'Sopra Steria' }]).map(r => r.name)).toEqual(['Sopra Steria'])
  })

  it('deduplicates on the name, case-insensitively', () => {
    const rows = detectedPartnersFrom([{ name: 'Sopra Steria' }, { name: 'SOPRA STERIA', scope: 'cloud' }])
    expect(rows).toHaveLength(1)
  })

  it('carries both angles so the double usage survives to the screen', () => {
    // « Concurrencer OU solliciter en rang 2 » est la demande n°3 du bêta
    // testeur. N'en garder qu'un choisirait à sa place.
    const [row] = detectedPartnersFrom([{ name: 'Atos', competeAngle: 'A', partnershipAngle: 'B' }])
    expect(row?.note).toBe('A · B')
  })

  // #2298.7 — décision Louis 18/09/2026 : une relation ESN nomme sa preuve,
  // pas seulement la stratégie qu'on en tire. `evidence` (ce que la source
  // dit vraiment) existait déjà dans `esnPresenceEntrySchema` mais était
  // silencieusement écarté ici — la seule métadonnée « sourcée » du lot qui
  // avait déjà une source et n'était juste pas branchée.
  it('carries the detection evidence AHEAD of the angles, jamais à leur place', () => {
    const [row] = detectedPartnersFrom([
      { name: 'Atos', evidence: 'Cité comme titulaire du marché TMA sur le portail BOAMP', competeAngle: 'A' },
    ])
    expect(row?.note).toBe('Cité comme titulaire du marché TMA sur le portail BOAMP · A')
  })

  it('SAIT DIRE NON — sans evidence ni angle, note reste null (jamais une chaîne vide)', () => {
    const [row] = detectedPartnersFrom([{ name: 'Atos' }])
    expect(row?.note).toBeNull()
  })

  it('returns nothing for anything that is not a list', () => {
    expect(detectedPartnersFrom(null)).toEqual([])
    expect(detectedPartnersFrom(undefined)).toEqual([])
    expect(detectedPartnersFrom(['not-an-object' as unknown])).toEqual([])
  })
})

/* Une entrée relue depuis `accounts.raw_analysis` porte les MÊMES champs, mais
 * en snake_case : la persistance NestJS snake_case tout le dossier avant de
 * l'écrire (`toSnakeCaseKeys`). La reprise des dossiers déjà analysés lit donc
 * `compete_angle` là où le pipeline vient d'écrire `competeAngle` — deux
 * orthographes du même fait, et une seule fonction pour les deux. */
describe('detectedPartnersFrom — dossier relu depuis la base', () => {
  it('reads the snake_case spelling written by the persistence layer', () => {
    expect(
      detectedPartnersFrom([
        {
          name: 'Capgemini',
          certainty: 'forte',
          scope: 'SAP',
          detected_at: '2026-08-19',
          compete_angle: 'Coûts élevés',
          partnership_angle: 'Renfort de niche',
        },
      ]),
    ).toEqual([
      {
        name: 'Capgemini',
        certainty: 'forte',
        scope: 'SAP',
        detectedAt: '2026-08-19',
        note: 'Coûts élevés · Renfort de niche',
      },
    ])
  })

  it('prefers the camelCase spelling when both are present', () => {
    const [partner] = detectedPartnersFrom([
      { name: 'Sopra', detectedAt: '2026-08-22', detected_at: '2020-01-01', competeAngle: 'A', compete_angle: 'B' },
    ])
    expect(partner?.detectedAt).toBe('2026-08-22')
    expect(partner?.note).toBe('A')
  })

  it('still refuses to guess a certainty on an old dossier that has none', () => {
    const [partner] = detectedPartnersFrom([{ name: 'Atos', presence: 'confirmée' }])
    expect(partner?.certainty).toBe('faible')
  })
})

/**
 * #2122.46 — « QUALIFIER » UNE RELATION DÉJÀ CONNUE DE L'ESPACE.
 *
 * `createAccountPartnerSchema` sert à DÉCLARER une ESN que l'espace ne connaît
 * pas encore ; il refuse un nom déjà présent (`PartnersService.create` lève un
 * 400 sur le doublon, parce que deux lignes pour la même ESN donneraient deux
 * rangs contradictoires). Il n'existait donc AUCUN chemin pour qualifier une
 * ligne canonique — celle que le pipeline a détectée et dont le rang et la
 * relation valent `unknown`. C'est ce trou que ce schéma ferme.
 */
describe('qualifyAccountPartnerSchema (#2122.46)', () => {
  it('accepte un rang seul, une relation seule, ou les deux', () => {
    expect(qualifyAccountPartnerSchema.parse({ rank: 'rank1' })).toEqual({ rank: 'rank1' })
    expect(qualifyAccountPartnerSchema.parse({ relationship: 'competitor' })).toEqual({ relationship: 'competitor' })
    expect(qualifyAccountPartnerSchema.parse({ rank: 'rank2', relationship: 'partner' })).toEqual({
      rank: 'rank2',
      relationship: 'partner',
    })
  })

  it('refuse un corps VIDE — « qualifier » sans rien dire n’est pas une qualification', () => {
    expect(qualifyAccountPartnerSchema.safeParse({}).success).toBe(false)
  })

  it('refuse une valeur hors des énumérations partagées', () => {
    expect(qualifyAccountPartnerSchema.safeParse({ rank: 'rank3' }).success).toBe(false)
    expect(qualifyAccountPartnerSchema.safeParse({ relationship: 'ami' }).success).toBe(false)
  })

  // #2316.34 — le fait terrain, structuré comme les deux autres champs.
  it('accepte une information terrain SEULE — #2316.34', () => {
    expect(qualifyAccountPartnerSchema.parse({ note: 'TMA reprise en interne au 01/09' })).toEqual({
      note: 'TMA reprise en interne au 01/09',
    })
  })

  it('accepte `null` pour effacer une information terrain', () => {
    expect(qualifyAccountPartnerSchema.parse({ note: null })).toEqual({ note: null })
  })

  it('coupe les espaces et refuse plus de 500 caractères', () => {
    expect(qualifyAccountPartnerSchema.parse({ note: '  espacé  ' })).toEqual({ note: 'espacé' })
    expect(qualifyAccountPartnerSchema.safeParse({ note: 'a'.repeat(501) }).success).toBe(false)
  })

  // #2316.22-.27 — un critère de qualification rang2 seul suffit à ne pas être vide.
  it('accepte un seul critère de qualification rang2, sans rang ni relation', () => {
    expect(qualifyAccountPartnerSchema.parse({ rank2_brief_precise: true })).toEqual({
      rank2_brief_precise: true,
    })
  })
})

describe('qualifyRank2 (#2316.22-.27) — la règle NO-GO du rang 2', () => {
  it('dit NO-GO dès qu’un critère MESURÉ est faux, même si les autres sont vrais', () => {
    const result = qualifyRank2({
      rank2_scope_accessible: true,
      rank2_brief_precise: false,
      rank2_contact_accountable: true,
      rank2_economics_clear: true,
      rank2_next_steps_ready: true,
    })
    expect(result.decision).toBe('no_go')
  })

  it('reste INCOMPLET (ni refus ni feu vert) quand un critère n’est pas encore mesuré', () => {
    const result = qualifyRank2({
      rank2_scope_accessible: true,
      rank2_brief_precise: true,
      rank2_contact_accountable: true,
      rank2_economics_clear: true,
      rank2_next_steps_ready: null,
    })
    expect(result.decision).toBe('incomplete')
    // « Non mesuré » sort du dénominateur — jamais 5, tant que tout n’est pas mesuré.
    expect(result.measuredCount).toBe(4)
    expect(result.metCount).toBe(4)
  })

  it('dit GO seulement quand les cinq critères sont mesurés ET vrais', () => {
    const result = qualifyRank2({
      rank2_scope_accessible: true,
      rank2_brief_precise: true,
      rank2_contact_accountable: true,
      rank2_economics_clear: true,
      rank2_next_steps_ready: true,
    })
    expect(result.decision).toBe('go')
    expect(result.measuredCount).toBe(5)
    expect(result.metCount).toBe(5)
  })

  it('traite une clé absente (deploy-skew) comme « non mesuré », jamais comme un échec', () => {
    const result = qualifyRank2({})
    expect(result.decision).toBe('incomplete')
    expect(result.measuredCount).toBe(0)
    expect(result.criteria.every(criterion => criterion.met === null)).toBe(true)
  })

  it('nomme les cinq critères, dans l’ordre du retour — jamais un score nu', () => {
    const result = qualifyRank2({})
    expect(result.criteria.map(criterion => criterion.key)).toEqual([
      'scope_accessible',
      'brief_precise',
      'contact_accountable',
      'economics_clear',
      'next_steps_ready',
    ])
  })
})

// Incident 24/09 (jumeau) : detectedAt est un texte libre qui part en
// account_partners.detected_at (timestamptz). Illisible, il vaut null.
describe('detectedPartnersFrom — une date illisible (incident 24/09)', () => {
  it.each(['None', 'n/a', 'récemment'])('« %s » donne detectedAt null', raw => {
    expect(detectedPartnersFrom([{ name: 'Capgemini', detectedAt: raw }])[0]?.detectedAt).toBeNull()
  })

  it('une date lisible reste inchangée', () => {
    expect(detectedPartnersFrom([{ name: 'Capgemini', detected_at: '2026-08-19' }])[0]?.detectedAt).toBe('2026-08-19')
  })
})
