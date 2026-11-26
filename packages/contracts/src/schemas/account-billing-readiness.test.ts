import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_BILLING_BLOCKERS,
  ACCOUNT_BILLING_BLOCKER_ACTIONS,
  accountBillingProfileSchema,
  accountIdentityProof,
  assessAccountBillingReadiness,
  billingEntityOfAccount,
  type AccountBillingProfile,
} from './account-billing-readiness.js'

const NOW = new Date('2026-08-31T12:00:00Z')

/** Un profil COMPLET : rien ne manque, rien n'est expiré. Chaque test retire
 *  exactement une chose, pour que le bloqueur attendu soit le seul en jeu. */
function complete(overrides: Partial<AccountBillingProfile> = {}): AccountBillingProfile {
  return {
    entityId: '11111111-1111-4111-8111-111111111111',
    accountId: '22222222-2222-4222-8222-222222222222',
    legalName: 'CANAL+ Groupe SA',
    siren: '420624777',
    paymentTermsDays: 45,
    contractExpiresOn: '2027-01-31',
    billingContactId: '33333333-3333-4333-8333-333333333333',
    ...overrides,
  }
}

describe('assessAccountBillingReadiness', () => {
  it('rend « prêt » sans aucun bloqueur quand le dossier est complet', () => {
    const result = assessAccountBillingReadiness({ profile: complete(), missionsMissingPo: 0 }, NOW)
    expect(result).toEqual({ state: 'ready', blockers: [] })
  })

  it("nomme « pas d'entité de facturation » quand aucune entité n'est désignée", () => {
    const result = assessAccountBillingReadiness({ profile: null, missionsMissingPo: 0 }, NOW)
    expect(result.state).toBe('blocked')
    expect(result.blockers).toEqual(['missing_billing_entity'])
  })

  /**
   * Le point qui décide de l'honnêteté de l'écran : sans entité désignée, on ne
   * SAIT rien des conditions de règlement ni du contrat. Les annoncer manquants
   * ferait trois bloqueurs là où il n'y a qu'un seul geste à faire.
   */
  it("n'empile AUCUN autre bloqueur structurel quand l'entité elle-même manque", () => {
    const result = assessAccountBillingReadiness({ profile: null, missionsMissingPo: 0 }, NOW)
    expect(result.blockers).not.toContain('unknown_payment_terms')
    expect(result.blockers).not.toContain('missing_billing_contact')
    expect(result.blockers).not.toContain('expired_contract')
  })

  it('nomme « pas de contact de facturation » quand personne ne reçoit la facture', () => {
    const result = assessAccountBillingReadiness(
      { profile: complete({ billingContactId: null }), missionsMissingPo: 0 },
      NOW,
    )
    expect(result.state).toBe('blocked')
    expect(result.blockers).toEqual(['missing_billing_contact'])
  })

  it('nomme « conditions de règlement inconnues » quand le délai n’est pas saisi', () => {
    const result = assessAccountBillingReadiness(
      { profile: complete({ paymentTermsDays: null }), missionsMissingPo: 0 },
      NOW,
    )
    expect(result.blockers).toEqual(['unknown_payment_terms'])
  })

  /**
   * `0` est une valeur SAISIE et légitime — « paiement comptant ». La confondre
   * avec l'absence ferait bloquer un client qui paie le jour même. Même
   * distinction que `chargedCostCents` côté mission.
   */
  it('accepte un délai de règlement de 0 jour — comptant est une réponse, pas un vide', () => {
    const result = assessAccountBillingReadiness(
      { profile: complete({ paymentTermsDays: 0 }), missionsMissingPo: 0 },
      NOW,
    )
    expect(result.blockers).not.toContain('unknown_payment_terms')
    expect(result.state).toBe('ready')
  })

  it('nomme « contrat expiré » quand la date est passée', () => {
    const result = assessAccountBillingReadiness(
      { profile: complete({ contractExpiresOn: '2026-08-30' }), missionsMissingPo: 0 },
      NOW,
    )
    expect(result.state).toBe('blocked')
    expect(result.blockers).toEqual(['expired_contract'])
  })

  it("ne bloque pas le JOUR de l'échéance — un contrat court jusqu'à son dernier jour", () => {
    const result = assessAccountBillingReadiness(
      { profile: complete({ contractExpiresOn: '2026-08-31' }), missionsMissingPo: 0 },
      NOW,
    )
    expect(result.blockers).not.toContain('expired_contract')
  })

  /**
   * ⚠️ « Non renseigné » n'est PAS « expiré ». Un contrat-cadre sans terme est
   * le cas normal ; le compter comme expiré ferait rougir tout le portefeuille
   * le jour du déploiement, et personne ne saurait quoi réparer.
   */
  it("ne conclut RIEN d'une échéance de contrat absente", () => {
    const result = assessAccountBillingReadiness(
      { profile: complete({ contractExpiresOn: null }), missionsMissingPo: 0 },
      NOW,
    )
    expect(result.blockers).not.toContain('expired_contract')
    expect(result.state).toBe('ready')
  })

  it('ne conclut rien non plus d’une échéance illisible', () => {
    const result = assessAccountBillingReadiness(
      { profile: complete({ contractExpiresOn: 'pas-une-date' }), missionsMissingPo: 0 },
      NOW,
    )
    expect(result.blockers).not.toContain('expired_contract')
  })

  /**
   * Le bloqueur du bon de commande est LEVÉ de la lentille mission, jamais
   * recalculé ici : `assessInvoiceReadiness` est seul juge de « ce client exige
   * un BDC et il manque » (GA-26).
   */
  it('lève « bon de commande manquant » depuis la lentille mission, sans le recalculer', () => {
    const result = assessAccountBillingReadiness({ profile: complete(), missionsMissingPo: 2 }, NOW)
    expect(result.state).toBe('blocked')
    expect(result.blockers).toEqual(['missing_po'])
  })

  it('ne lève aucun bon de commande quand aucune mission n’en manque', () => {
    const result = assessAccountBillingReadiness({ profile: complete(), missionsMissingPo: 0 }, NOW)
    expect(result.blockers).not.toContain('missing_po')
  })

  it('ordonne les bloqueurs par la gravité du domaine, jamais par ordre de détection', () => {
    const result = assessAccountBillingReadiness(
      {
        profile: complete({ paymentTermsDays: null, billingContactId: null, contractExpiresOn: '2020-01-01' }),
        missionsMissingPo: 1,
      },
      NOW,
    )
    expect(result.blockers).toEqual([
      'missing_billing_contact',
      'missing_po',
      'expired_contract',
      'unknown_payment_terms',
    ])
    // Et l'ordre rendu est bien celui de la liste fermée.
    const positions = result.blockers.map(blocker => ACCOUNT_BILLING_BLOCKERS.indexOf(blocker))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })
})

describe('ACCOUNT_BILLING_BLOCKER_ACTIONS', () => {
  /**
   * « Un indicateur de qualité qui ne mène nulle part ne sert à rien » : chaque
   * bloqueur nomme l'écran où il se répare, comme `BLOCKER_ACTIONS` le fait déjà
   * côté mission.
   */
  it('donne un geste ET une route à CHACUN des bloqueurs, sans trou', () => {
    for (const blocker of ACCOUNT_BILLING_BLOCKERS) {
      const entry = ACCOUNT_BILLING_BLOCKER_ACTIONS[blocker]
      expect(entry, blocker).toBeDefined()
      expect(entry.action.length).toBeGreaterThan(0)
      expect(entry.route.startsWith('/'), `${blocker} → ${entry.route}`).toBe(true)
    }
  })

  it('ne porte aucune route vers un outil externe', () => {
    for (const blocker of ACCOUNT_BILLING_BLOCKERS) {
      expect(ACCOUNT_BILLING_BLOCKER_ACTIONS[blocker].route).not.toMatch(/^https?:/)
    }
  })
})

describe('billingEntityOfAccount', () => {
  const flagged = { id: 'a', account_id: 'compte', is_billing: true, name: 'ACME SAS' }
  const other = { id: 'b', account_id: 'compte', is_billing: false, name: 'ACME DSI' }

  it("rend l'entité DÉSIGNÉE, pas la première venue", () => {
    expect(billingEntityOfAccount([other, flagged])?.id).toBe('a')
  })

  /**
   * ⚠️ Aucun repli sur l'entité par défaut ni sur la première de la liste :
   * deviner qui reçoit la facture ferait afficher un SIREN qui n'est pas celui
   * du payeur — exactement le genre de chiffre qu'on ne rattrape pas.
   */
  it("ne DEVINE jamais une entité de facturation quand aucune n'est désignée", () => {
    expect(billingEntityOfAccount([other])).toBeNull()
    expect(billingEntityOfAccount([])).toBeNull()
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  LA PASTILLE « VÉRIFIÉ » — ce qu'elle a le droit d'affirmer (31/08/2026)    */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('accountIdentityProof — les deux moitiés, ou rien', () => {
  const proof = { identitySource: 'public_registry' as const, identityCheckedOn: '2026-04-15' }

  it('rend la source ET la date quand les deux sont là', () => {
    expect(accountIdentityProof(proof)).toEqual({ source: 'public_registry', checkedOn: '2026-04-15' })
  })

  it('se TAIT sur un dossier absent — un compte non vérifié n’est pas suspect', () => {
    expect(accountIdentityProof(null)).toBeNull()
    expect(accountIdentityProof(undefined)).toBeNull()
  })

  it('se tait sur une source SANS date — « vérifié » sans dire quand ne vérifie rien', () => {
    expect(accountIdentityProof({ ...proof, identityCheckedOn: null })).toBeNull()
    expect(accountIdentityProof({ ...proof, identityCheckedOn: '   ' })).toBeNull()
  })

  it('se tait sur une date SANS source — une fraîcheur sans garantie', () => {
    expect(accountIdentityProof({ ...proof, identitySource: null })).toBeNull()
  })
})

describe('accountBillingProfileSchema — les champs d’identité du 31/08', () => {
  const wire = {
    entityId: '11111111-1111-4111-8111-111111111111',
    accountId: '22222222-2222-4222-8222-222222222222',
    legalName: 'CANAL+ Groupe SA',
    siren: '420624777',
    paymentTermsDays: 45,
    contractExpiresOn: null,
    billingContactId: null,
  }

  it('accepte un dossier rendu par une API ANTÉRIEURE au 31/08', () => {
    // Déploiement décalé : la lentille entière ne doit pas tomber pour trois
    // champs neufs. Ils valent alors « personne n’a répondu », jamais un faux.
    const parsed = accountBillingProfileSchema.parse(wire)
    expect(parsed.siret).toBeNull()
    expect(parsed.identitySource).toBeNull()
    expect(parsed.identityCheckedOn).toBeNull()
  })

  it('porte le SIRET et la preuve d’identité quand le serveur les envoie', () => {
    const parsed = accountBillingProfileSchema.parse({
      ...wire,
      siret: '42062477700034',
      identitySource: 'human_declared',
      identityCheckedOn: '2026-06-02',
    })
    expect(parsed.siret).toBe('42062477700034')
    expect(accountIdentityProof(parsed)).toEqual({ source: 'human_declared', checkedOn: '2026-06-02' })
  })

  it('une source inventée retombe sur « personne n’a vérifié »', () => {
    const parsed = accountBillingProfileSchema.parse({ ...wire, identitySource: 'guessed_by_model' })
    expect(parsed.identitySource).toBeNull()
    expect(accountIdentityProof(parsed)).toBeNull()
  })
})
