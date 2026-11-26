import { describe, expect, it } from 'vitest'
import {
  BRIEFING_ACTIONS_MAX,
  BRIEFING_ACTIONS_SHOWN,
  BRIEFING_ARTIFACT_KINDS,
  BRIEFING_CARD_FIELDS,
  BRIEFING_FACT_CAPABILITIES,
  briefingActionSchema,
  briefingActionSourceKey,
  firstOpenTodayRequestSchema,
  firstOpenTodayResponseSchema,
} from './daily-briefing.js'

/**
 * LE CONTRAT D'UNE CARTE DE BRIEF.
 *
 * Une carte portait six champs — un identifiant, un libellé, une destination,
 * un genre, un rang. Elle ne disait ni QUEL FAIT l'a produite, ni D'OÙ il
 * vient, ni CE QUI EST DÉJÀ PRÊT, ni QUAND le fait cesse d'être vrai. Quatre
 * champs ont été ajoutés, et ces tests tiennent les invariants qui les rendent
 * honnêtes plutôt que la forme exacte de leur écriture :
 *
 *  1. l'extension est ADDITIVE — une charge utile écrite avant elle parse ;
 *  2. un fait sans SOURCE n'existe pas (`provenance` est obligatoire DANS
 *     `fact`, et `fact` entier vaut `null` quand la carte ne sait pas dire
 *     d'où vient son fait) ;
 *  3. une date d'observation INCONNUE reste `null` — jamais aujourd'hui ;
 *  4. « rien de prêt » est un tableau vide, pas une absence à signaler.
 */

/** Une carte telle que le produit l'écrivait AVANT ce chantier — six champs. */
const LEGACY_CARD = {
  id: 'conflict:a:b',
  labelKey: 'briefing.actions.conflict',
  labelVars: { first: 'A', second: 'B', minutes: 30 },
  href: null,
  kind: 'conflict',
  priority: 1,
}

describe('briefingActionSchema — l’extension est additive', () => {
  it('accepte une carte écrite AVANT les quatre nouveaux champs', () => {
    // Si ce test tombe : le nouveau contrat casse les cartes existantes, et
    // « en additif » n'a pas été tenu.
    expect(() => briefingActionSchema.parse(LEGACY_CARD)).not.toThrow()
  })

  it('rend les quatre nouveaux champs à leur ABSENCE, jamais à une valeur inventée', () => {
    const card = briefingActionSchema.parse(LEGACY_CARD)
    expect(card.fact).toBeNull()
    expect(card.context).toBeNull()
    expect(card.preparedArtifacts).toEqual([])
    expect(card.expiresAt).toBeNull()
  })

  it('ne retire aucun des six champs d’origine', () => {
    const card = briefingActionSchema.parse(LEGACY_CARD)
    expect(Object.keys(card)).toEqual(
      expect.arrayContaining(['id', 'labelKey', 'labelVars', 'href', 'kind', 'priority']),
    )
  })
})

/**
 * `POST /briefing/first-open-today` (#1936, lot 7A) — le fuseau du client
 * n'est jamais rejeté, il est SIMPLEMENT optionnel côté contrat : la
 * résolution IANA-ou-repli vit côté serveur (`resolveTimeZone`), pas ici.
 */
describe('firstOpenTodayRequestSchema', () => {
  it('accepte un corps sans fuseau', () => {
    const parsed = firstOpenTodayRequestSchema.parse({})
    expect(parsed.timeZone).toBeUndefined()
  })

  it('accepte un fuseau — la validité IANA n’est PAS le rôle du contrat', () => {
    const parsed = firstOpenTodayRequestSchema.parse({ timeZone: 'Europe/Paris' })
    expect(parsed.timeZone).toBe('Europe/Paris')
  })

  it('refuse une chaîne vide plutôt que de la confondre avec « absent »', () => {
    expect(() => firstOpenTodayRequestSchema.parse({ timeZone: '' })).toThrow()
  })
})

describe('firstOpenTodayResponseSchema', () => {
  it('exige un booléen — jamais null ni un compte à interpréter', () => {
    expect(() => firstOpenTodayResponseSchema.parse({ isFirstOpenToday: true })).not.toThrow()
    expect(() => firstOpenTodayResponseSchema.parse({ isFirstOpenToday: false })).not.toThrow()
    expect(() => firstOpenTodayResponseSchema.parse({ isFirstOpenToday: null })).toThrow()
  })
})

describe('briefingActionSchema — un fait porte sa source', () => {
  it('refuse un fait sans provenance : un fait sans source ne s’affiche pas comme un fait', () => {
    const parsed = briefingActionSchema.safeParse({
      ...LEGACY_CARD,
      fact: { labelKey: 'briefing.facts.conflict', labelVars: {} },
    })
    expect(parsed.success).toBe(false)
  })

  it('refuse une provenance sans capacité — « quelque part » n’est pas une source', () => {
    const parsed = briefingActionSchema.safeParse({
      ...LEGACY_CARD,
      fact: { labelKey: null, labelVars: {}, provenance: { source: 'connector', observedAt: null } },
    })
    expect(parsed.success).toBe(false)
  })

  it('accepte une date d’observation INCONNUE, et ne la remplace pas par aujourd’hui', () => {
    // « Non mesuré » n'est jamais « 0 » ni « aujourd'hui ». Une carte dont le
    // fait n'a pas de date DIT que la date est inconnue.
    const card = briefingActionSchema.parse({
      ...LEGACY_CARD,
      fact: {
        labelKey: null,
        labelVars: {},
        provenance: { source: 'connector', capability: 'agenda', observedAt: null },
      },
    })
    expect(card.fact?.provenance.observedAt).toBeNull()
  })

  it('laisse le libellé du fait à `null` quand la carte le dit déjà elle-même', () => {
    // Loi 4 du tome 7 : rien n'apparaît deux fois sous la même forme avec le
    // même contenu. Le bandeau de source s'affiche alors seul.
    const card = briefingActionSchema.parse({
      ...LEGACY_CARD,
      fact: {
        labelKey: null,
        labelVars: {},
        provenance: { source: 'pipeline', capability: 'signals', observedAt: '2026-09-01T06:00:00.000Z' },
      },
    })
    expect(card.fact?.labelKey).toBeNull()
    expect(card.fact?.provenance.capability).toBe('signals')
  })
})

describe('briefingActionSchema — ce qui est déjà prêt', () => {
  it('accepte un tableau VIDE : une carte sans artefact ne montre pas le bloc', () => {
    const card = briefingActionSchema.parse({ ...LEGACY_CARD, preparedArtifacts: [] })
    expect(card.preparedArtifacts).toEqual([])
  })

  it('accepte un artefact qui n’a nulle part où s’ouvrir', () => {
    const card = briefingActionSchema.parse({
      ...LEGACY_CARD,
      preparedArtifacts: [
        { id: 'draft:1', kind: 'draft_message', labelKey: 'briefing.artifacts.draft', labelVars: {}, href: null },
      ],
    })
    expect(card.preparedArtifacts[0]?.href).toBeNull()
  })

  it('refuse un genre d’artefact inconnu — la liste est fermée', () => {
    const parsed = briefingActionSchema.safeParse({
      ...LEGACY_CARD,
      preparedArtifacts: [{ id: 'x', kind: 'anything', labelKey: 'k', labelVars: {}, href: null }],
    })
    expect(parsed.success).toBe(false)
  })
})

/**
 * #2106.12 à #2106.19 — SEPT CHAMPS DÉDIÉS SUR L'ARTEFACT, PAS SUR LA CARTE.
 *
 * Même discipline que l'extension de `briefingActionSchema` ci-dessus :
 * additive (un artefact écrit à cinq champs, avant ce lot, continue de
 * parser), et chaque champ absent rend `null`/sa valeur neutre plutôt qu'une
 * donnée inventée.
 */
const LEGACY_ARTIFACT = {
  id: 'shortlist:meeting-1',
  kind: 'shortlist',
  labelKey: 'briefing.artifacts.meetingAttendees',
  labelVars: { count: 2 },
  href: null,
}

describe('briefingArtifactSchema — sept champs dédiés, additifs', () => {
  it('accepte un artefact écrit AVANT ce lot — cinq champs', () => {
    const card = briefingActionSchema.parse({
      ...LEGACY_CARD,
      preparedArtifacts: [LEGACY_ARTIFACT],
    })
    expect(card.preparedArtifacts).toHaveLength(1)
  })

  it('rend les sept nouveaux champs à leur valeur neutre, jamais inventée', () => {
    const card = briefingActionSchema.parse({
      ...LEGACY_CARD,
      preparedArtifacts: [LEGACY_ARTIFACT],
    })
    const artifact = card.preparedArtifacts[0]
    // #2106.12 — objet métier : aucun par défaut, jamais deviné.
    expect(artifact?.businessObject).toBeNull()
    // #2106.13 — date de préparation : inconnue reste `null`, jamais "maintenant".
    expect(artifact?.preparedAt).toBeNull()
    // #2106.14 — version : la première, jamais 0 (qui se lirait "non versionné").
    expect(artifact?.version).toBe(1)
    // #2106.15 — source : aucune par défaut.
    expect(artifact?.source).toBeNull()
    // #2106.16 — statut : un artefact tout juste parsé est "prêt".
    expect(artifact?.status).toBe('ready')
    // #2106.18 — auteur système : toujours Laura, jamais un humain (D82).
    expect(artifact?.preparedBy).toBe('laura')
    // #2106.19 — coût éventuel : aucun par défaut, jamais 0 (qui dirait "gratuit mesuré").
    expect(artifact?.creditsCost).toBeNull()
  })

  it('accepte les sept champs quand ils sont renseignés', () => {
    const card = briefingActionSchema.parse({
      ...LEGACY_CARD,
      preparedArtifacts: [
        {
          ...LEGACY_ARTIFACT,
          businessObject: { kind: 'account', id: 'acc-1', name: 'ACME' },
          preparedAt: '2026-09-23T07:00:00.000Z',
          version: 2,
          source: 'connector',
          status: 'ready',
          preparedBy: 'laura',
          creditsCost: 3,
        },
      ],
    })
    const artifact = card.preparedArtifacts[0]
    // #2097.21 — `logoUrl: null` par défaut : la lecture ne l'a pas fourni ici.
    // #2097.21 (correctif) — `website: null` par défaut, même raison.
    expect(artifact?.businessObject).toEqual({
      kind: 'account',
      id: 'acc-1',
      name: 'ACME',
      logoUrl: null,
      website: null,
    })
    expect(artifact?.preparedAt).toBe('2026-09-23T07:00:00.000Z')
    expect(artifact?.version).toBe(2)
    expect(artifact?.source).toBe('connector')
    expect(artifact?.creditsCost).toBe(3)
  })

  it('#2106.19 — garde crédit : un coût NÉGATIF est refusé, ce n’est pas un remboursement', () => {
    const parsed = briefingActionSchema.safeParse({
      ...LEGACY_CARD,
      preparedArtifacts: [{ ...LEGACY_ARTIFACT, creditsCost: -1 }],
    })
    expect(parsed.success).toBe(false)
  })

  it('#2106.14 — garde version : zéro n’est pas une version, la liste commence à un', () => {
    const parsed = briefingActionSchema.safeParse({
      ...LEGACY_CARD,
      preparedArtifacts: [{ ...LEGACY_ARTIFACT, version: 0 }],
    })
    expect(parsed.success).toBe(false)
  })

  it('#2106.16 — statut : la liste est fermée, un statut inventé est refusé', () => {
    const parsed = briefingActionSchema.safeParse({
      ...LEGACY_CARD,
      preparedArtifacts: [{ ...LEGACY_ARTIFACT, status: 'anything' }],
    })
    expect(parsed.success).toBe(false)
  })
})

describe('les deux plafonds du brief', () => {
  it('classe plus de cartes qu’il n’en rend d’emblée', () => {
    // Sept classées, cinq rendues, le reste dans un dépli. Si les deux nombres
    // étaient égaux, le dépli n'aurait jamais rien à montrer.
    expect(BRIEFING_ACTIONS_MAX).toBeGreaterThan(BRIEFING_ACTIONS_SHOWN)
    expect(Number.isInteger(BRIEFING_ACTIONS_SHOWN)).toBe(true)
    expect(Number.isInteger(BRIEFING_ACTIONS_MAX)).toBe(true)
    expect(BRIEFING_ACTIONS_SHOWN).toBeGreaterThan(0)
  })

  // #2095.78 — le rendu d'emblée descend à TROIS : le classement (7) reste
  // inchangé, seul ce qui s'affiche sans dépli se resserre.
  it('affiche trois priorités au plus sans dépli', () => {
    expect(BRIEFING_ACTIONS_SHOWN).toBe(3)
  })
})

describe('la liste des nouveaux champs colle au schéma', () => {
  it('chaque champ déclaré existe VRAIMENT sur une carte', () => {
    // Sans ce test, `BRIEFING_CARD_FIELDS` pourrait nommer un champ retiré du
    // schéma : la garde de parité démo classerait alors consciencieusement
    // quelque chose qui n'existe plus. Un registre qui se déclare implémenté
    // sans l'être est un défaut que ce dépôt a déjà payé.
    const shape = Object.keys(briefingActionSchema.shape)
    for (const field of BRIEFING_CARD_FIELDS) {
      expect(shape, `champ déclaré absent du schéma : ${field}`).toContain(field)
    }
  })

  it('ne laisse AUCUN champ neuf hors de la liste', () => {
    // L'autre sens, le seul qui garde vraiment : un cinquième champ ajouté au
    // contrat et jamais classé en démonstration passerait inaperçu.
    const original = ['id', 'labelKey', 'labelVars', 'href', 'kind', 'priority']
    const added = Object.keys(briefingActionSchema.shape).filter(field => !original.includes(field))
    expect(added.sort()).toEqual([...BRIEFING_CARD_FIELDS].sort())
  })
})

describe('les capacités nommées par une provenance', () => {
  it('lit un corpus NON VIDE — sans lui la garde suivante serait verte sur du vide', () => {
    expect(BRIEFING_FACT_CAPABILITIES.length).toBeGreaterThan(0)
    expect(BRIEFING_ARTIFACT_KINDS.length).toBeGreaterThan(0)
  })

  it('nomme une CAPACITÉ, jamais un éditeur', () => {
    // Doctrine : « votre agenda », « votre messagerie » — jamais le nom du
    // fournisseur, sauf dans Réglages › Intégrations.
    const vendors = /google|gmail|microsoft|outlook|office|hubspot|salesforce|pipedrive|attio|apollo|notion|slack/i
    for (const capability of BRIEFING_FACT_CAPABILITIES) {
      expect(vendors.test(capability), `capacité qui nomme un éditeur : ${capability}`).toBe(false)
    }
  })
})

describe('briefingActionSourceKey (#2105.53 — correctif)', () => {
  it('lit le libellé du FAIT quand il existe — même priorité que briefingActionHeadline (apps/web)', () => {
    const key = briefingActionSourceKey({
      labelKey: 'briefing.actions.followUp',
      labelVars: { x: 1 },
      fact: {
        labelKey: 'briefing.fact.x',
        labelVars: { n: 1 },
        provenance: { source: 'connector', capability: 'mailbox', observedAt: null },
      },
    })
    expect(key).toBe('briefing.fact.x?n=1')
  })

  it('retombe sur le libellé de la carte quand il n’y a pas de fait', () => {
    const key = briefingActionSourceKey({ labelKey: 'briefing.actions.followUp', labelVars: { x: 1 }, fact: null })
    expect(key).toBe('briefing.actions.followUp?x=1')
  })

  it('est stable quel que soit l’ordre d’écriture des variables', () => {
    const a = briefingActionSourceKey({ labelKey: 'k', labelVars: { b: 2, a: 1 }, fact: null })
    const b = briefingActionSourceKey({ labelKey: 'k', labelVars: { a: 1, b: 2 }, fact: null })
    expect(a).toBe(b)
  })

  it('distingue deux faits différents du même genre — deux RFP « à répondre bientôt » ne se confondent pas', () => {
    const provenance = { source: 'connector', capability: 'mailbox', observedAt: null } as const
    const a = briefingActionSourceKey({
      labelKey: 'k',
      labelVars: {},
      fact: { labelKey: 'briefing.fact.rfp', labelVars: { rfpId: 'r1' }, provenance },
    })
    const b = briefingActionSourceKey({
      labelKey: 'k',
      labelVars: {},
      fact: { labelKey: 'briefing.fact.rfp', labelVars: { rfpId: 'r2' }, provenance },
    })
    expect(a).not.toBe(b)
  })
})
