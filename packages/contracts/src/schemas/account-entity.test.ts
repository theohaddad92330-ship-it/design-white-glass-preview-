import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_ENTITY_IDENTITY_SOURCES,
  DEFAULT_ENTITY_NAME,
  accountEntityIdentityProblem,
  accountEntitySchema,
  entityLabelKey,
  matchEntityByLabel,
  normaliseEntityLabel,
  normaliseSiret,
  resolveEntityIdForContact,
  siretBelongsToSiren,
  siteSchema,
} from './account-entity.js'

const base = {
  id: '11111111-1111-4111-8111-111111111111',
  account_id: '22222222-2222-4222-8222-222222222222',
  name: 'DSI Groupe',
  kind: 'bu' as const,
  siren: null,
  domain: null,
  is_default: false,
  rank1_incumbent: 'unknown' as const,
  rank1_note: null,
  // Le dossier de facturation (31/08/2026). Aucun de ces cinq champs n'est
  // optionnel à la LECTURE : une entité rendue sans eux laisserait l'écran
  // deviner, et « payeur inconnu » n'est pas « pas de payeur ».
  is_billing: false,
  legal_name: null,
  payment_terms_days: null,
  contract_expires_on: null,
  billing_contact_id: null,
  created_at: '2026-08-19T10:00:00.000Z',
  updated_at: '2026-08-19T10:00:00.000Z',
}

const fallback = {
  ...base,
  id: '33333333-3333-4333-8333-333333333333',
  name: DEFAULT_ENTITY_NAME,
  kind: 'unknown' as const,
  is_default: true,
}

describe('normaliseEntityLabel', () => {
  it('rend null sur un libellé vide ou fait d’espaces', () => {
    expect(normaliseEntityLabel('')).toBeNull()
    expect(normaliseEntityLabel('   ')).toBeNull()
    expect(normaliseEntityLabel(null)).toBeNull()
    expect(normaliseEntityLabel(undefined)).toBeNull()
  })

  it('coupe les espaces sans toucher à la casse affichée', () => {
    expect(normaliseEntityLabel('  TF1 PUB  ')).toBe('TF1 PUB')
  })
})

describe('entityLabelKey', () => {
  it('ignore la casse et les espaces multiples — « TF1  Pub » et « tf1 pub » sont la même division', () => {
    expect(entityLabelKey('TF1  Pub')).toBe(entityLabelKey('tf1 pub'))
  })

  it('ne confond pas deux divisions différentes', () => {
    expect(entityLabelKey('TF1 Pub')).not.toBe(entityLabelKey('TF1 Films'))
  })
})

describe('matchEntityByLabel', () => {
  it('retrouve l’entité par son libellé, quelle que soit la casse', () => {
    expect(matchEntityByLabel([base, fallback], 'dsi groupe')?.id).toBe(base.id)
  })

  it('ne retombe JAMAIS sur l’entité par défaut : un libellé inconnu est inconnu', () => {
    expect(matchEntityByLabel([base, fallback], 'DSI Renouvelables')).toBeNull()
  })

  it('rend null sur un libellé vide plutôt que la première entité venue', () => {
    expect(matchEntityByLabel([base, fallback], '  ')).toBeNull()
  })
})

describe('resolveEntityIdForContact', () => {
  it('rattache au périmètre nommé quand le libellé est connu', () => {
    expect(resolveEntityIdForContact([base, fallback], 'DSI Groupe')).toBe(base.id)
  })

  it('rattache au « périmètre non déterminé » quand aucun libellé n’est donné', () => {
    expect(resolveEntityIdForContact([base, fallback], null)).toBe(fallback.id)
  })

  it('rattache au « périmètre non déterminé » quand le libellé ne correspond à rien de connu', () => {
    // Le contraire — créer une entité à la volée depuis un texte de pipeline —
    // remplirait le compte de divisions inventées par un modèle.
    expect(resolveEntityIdForContact([base, fallback], 'Direction Innovation')).toBe(fallback.id)
  })

  it('rend null quand le compte n’a pas encore d’entité par défaut', () => {
    // Pas d'invention : l'appelant doit créer l'entité par défaut, pas deviner.
    expect(resolveEntityIdForContact([base], 'Direction Innovation')).toBeNull()
    expect(resolveEntityIdForContact([], null)).toBeNull()
  })
})

describe('les schémas', () => {
  it('accepte une entité complète', () => {
    expect(accountEntitySchema.parse(base).name).toBe('DSI Groupe')
  })

  it('refuse un rang 1 hors des trois valeurs — « probablement » n’est pas une réponse', () => {
    expect(() => accountEntitySchema.parse({ ...base, rank1_incumbent: 'maybe' })).toThrow()
  })

  it('refuse un effectif de site négatif', () => {
    expect(() =>
      siteSchema.parse({
        id: base.id,
        account_id: base.account_id,
        entity_id: null,
        label: 'EDF Saclay',
        city: null,
        postal_code: null,
        country: null,
        siret: null,
        headcount: -3,
        created_at: base.created_at,
        updated_at: base.updated_at,
      }),
    ).toThrow()
  })

  it('accepte un site sans effectif — inconnu vaut null, jamais 0', () => {
    const site = siteSchema.parse({
      id: base.id,
      account_id: base.account_id,
      entity_id: null,
      label: 'EDF Saclay',
      city: 'Saclay',
      postal_code: '91190',
      country: 'FR',
      siret: null,
      headcount: null,
      created_at: base.created_at,
      updated_at: base.updated_at,
    })
    expect(site.headcount).toBeNull()
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  L'IDENTITÉ LÉGALE — le SIRET, et ce que « vérifié » a le droit de dire     */
/*  (31/08/2026)                                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('normaliseSiret — quatorze chiffres, ou rien', () => {
  it('retire les séparateurs de SAISIE : ils décorent, ils n’identifient pas', () => {
    expect(normaliseSiret('420 624 777 00034')).toBe('42062477700034')
    expect(normaliseSiret('420.624.777.00034')).toBe('42062477700034')
    expect(normaliseSiret('420-624-777-00034')).toBe('42062477700034')
  })

  it('REFUSE treize chiffres au lieu de les compléter', () => {
    // Un zéro ajouté désignerait un établissement qu’on n’a pas vérifié.
    expect(normaliseSiret('4206247770003')).toBeNull()
  })

  it('REFUSE quinze chiffres au lieu de les tronquer', () => {
    expect(normaliseSiret('420624777000345')).toBeNull()
  })

  it('REFUSE un SIREN — neuf chiffres ne sont pas un établissement', () => {
    // C’est LE cas que la maquette rendait tentant : la base n’a que le SIREN,
    // l’écran veut quatorze chiffres. Les cinq qui manquent ne s’inventent pas.
    expect(normaliseSiret('420624777')).toBeNull()
  })

  it('REFUSE une valeur non numérique, et l’absence', () => {
    expect(normaliseSiret('CHE105944452')).toBeNull()
    expect(normaliseSiret('')).toBeNull()
    expect(normaliseSiret(null)).toBeNull()
    expect(normaliseSiret(undefined)).toBeNull()
  })
})

describe('siretBelongsToSiren — la seule vérification que l’arithmétique autorise', () => {
  it('accepte un SIRET qui commence par le SIREN', () => {
    expect(siretBelongsToSiren('42062477700034', '420624777')).toBe(true)
    expect(siretBelongsToSiren('420 624 777 00034', '420 624 777')).toBe(true)
  })

  it('REFUSE un SIRET dont les neuf premiers chiffres sont ceux d’une AUTRE société', () => {
    expect(siretBelongsToSiren('39305182600017', '420624777')).toBe(false)
  })

  it('ne DÉMENT pas quand le SIREN est absent ou illisible', () => {
    // Une entité étrangère n’a pas de SIREN : refuser ici empêcherait de saisir
    // un établissement parfaitement valide.
    expect(siretBelongsToSiren('42062477700034', null)).toBe(true)
    expect(siretBelongsToSiren('42062477700034', 'CHE105944452')).toBe(true)
  })

  it('ne dit rien d’un SIRET qui n’en est pas un — ce refus-là est celui de normaliseSiret', () => {
    expect(siretBelongsToSiren('420624777', '999999999')).toBe(true)
  })
})

describe('accountEntityIdentityProblem — trois refus, trois mensonges évités', () => {
  it('ne trouve rien à redire à une entité sans identité déclarée', () => {
    expect(accountEntityIdentityProblem({})).toBeNull()
    expect(accountEntityIdentityProblem({ siret: '', siren: '420624777' })).toBeNull()
  })

  it('refuse un SIRET mal formé, et le dit sans proposer de le corriger', () => {
    const problem = accountEntityIdentityProblem({ siret: '4206247770003' })
    expect(problem).toContain('quatorze chiffres')
  })

  it('refuse un SIRET qui appartient à une autre société', () => {
    const problem = accountEntityIdentityProblem({ siret: '39305182600017', siren: '420624777' })
    expect(problem).toContain('autre société')
  })

  it('refuse une source sans date — « vérifié » sans dire QUAND ne vérifie rien', () => {
    const problem = accountEntityIdentityProblem({ identity_source: 'public_registry' })
    expect(problem).toContain('date')
  })

  it('refuse une date sans source — une fraîcheur sans garantie', () => {
    const problem = accountEntityIdentityProblem({ identity_checked_on: '2026-04-15' })
    expect(problem).toContain('source')
  })

  it('accepte le couple complet', () => {
    expect(
      accountEntityIdentityProblem({
        siret: '42062477700034',
        siren: '420624777',
        identity_source: 'human_declared',
        identity_checked_on: '2026-04-15',
      }),
    ).toBeNull()
  })
})

describe('accountEntitySchema — les champs neufs tolèrent une API antérieure', () => {
  it('accepte une entité rendue SANS les trois champs du 31/08', () => {
    // Déploiement décalé : une liste entière ne tombe pas pour un champ neuf.
    const entity = accountEntitySchema.parse(base)
    expect(entity.siret).toBeNull()
    expect(entity.identity_source).toBeNull()
    expect(entity.identity_checked_on).toBeNull()
  })

  it('lit les trois champs quand ils sont là', () => {
    const entity = accountEntitySchema.parse({
      ...base,
      siret: '42062477700034',
      identity_source: 'public_registry',
      identity_checked_on: '2026-04-15',
    })
    expect(entity.siret).toBe('42062477700034')
    expect(entity.identity_source).toBe('public_registry')
    expect(entity.identity_checked_on).toBe('2026-04-15')
  })

  it('ne laisse PAS entrer une source de vérification inventée', () => {
    // `.catch(null)` : une valeur hors liste retombe sur « personne n’a
    // vérifié », jamais sur une source que la liste n’a pas nommée.
    const entity = accountEntitySchema.parse({ ...base, identity_source: 'model_guessed' })
    expect(entity.identity_source).toBeNull()
  })

  it('la liste des sources est FERMÉE, et « le modèle l’a proposé » n’en est pas', () => {
    expect([...ACCOUNT_ENTITY_IDENTITY_SOURCES]).toEqual(['public_registry', 'human_declared'])
  })
})
