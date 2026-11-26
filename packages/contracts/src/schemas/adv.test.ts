import { describe, expect, it } from 'vitest'
import {
  ADV_BLOCKERS,
  ADV_BLOCKER_ACTIONS,
  ADV_DOSSIER_KINDS,
  ADV_FILTERABLE_TILES,
  ADV_RESERVED_BLOCKERS,
  ADV_TILES,
  advAgeDays,
  advDossierSchema,
  advRenewalOpenedOn,
  advSummarySchema,
  assessAdvDossier,
  updateAdvDossierSchema,
} from './adv.js'
import { BLOCKER_ACTIONS, INVOICE_BLOCKERS } from './invoice-readiness.js'
import { RENEWAL_J60_DAYS } from './mission.js'

/** Le dossier le plus complet possible — rien ne manque, donc rien ne bloque. */
const complete = {
  kind: 'start' as const,
  billingContactId: '0c1e6f4a-1111-4111-8111-111111111111',
  requiresPo: true,
  poNumber: 'BDC-2026-118',
  clientBillingReference: 'FOURN-4471',
  paymentTermsDays: 60,
  paymentDetailsTransmittedAt: '2026-08-04T09:00:00.000Z',
  clientEntityId: '0c1e6f4a-2222-4222-8222-222222222222',
}

describe('les motifs de blocage ADV', () => {
  it('réutilise VERBATIM les deux codes que la facturation nomme déjà', () => {
    // Le dépôt porte déjà « personne à qui envoyer la facture » et « pas de bon
    // de commande ». En inventer une seconde graphie ferait deux vérités sur le
    // même fait, traduites deux fois, comptées deux fois.
    expect(INVOICE_BLOCKERS).toContain('missing_billing_contact')
    expect(INVOICE_BLOCKERS).toContain('missing_po')
    expect(ADV_BLOCKERS).toContain('missing_billing_contact')
    expect(ADV_BLOCKERS).toContain('missing_po')
  })

  it('n’invente aucun doublon d’un code de facturation existant', () => {
    const shared = ['missing_billing_contact', 'missing_po']
    const ownCodes = ADV_BLOCKERS.filter(code => !shared.includes(code))
    const collisions = ownCodes.filter(code => (INVOICE_BLOCKERS as readonly string[]).includes(code))
    expect(collisions).toEqual([])
  })

  it('hérite la route de réparation des codes partagés, sans la recopier', () => {
    // Une dérivation vit à UN seul endroit. Recopier « /missions » ici les
    // ferait diverger le jour où l'écran de réparation déménage.
    expect(ADV_BLOCKER_ACTIONS.missing_billing_contact).toBe(BLOCKER_ACTIONS.missing_billing_contact)
    expect(ADV_BLOCKER_ACTIONS.missing_po).toBe(BLOCKER_ACTIONS.missing_po)
  })

  it('donne à CHAQUE motif une action et une route de réparation', () => {
    for (const blocker of ADV_BLOCKERS) {
      expect(ADV_BLOCKER_ACTIONS[blocker].action.length).toBeGreaterThan(0)
      expect(ADV_BLOCKER_ACTIONS[blocker].route.startsWith('/')).toBe(true)
    }
  })

  it('ne porte AUCUN motif qui nommerait un moyen de paiement', () => {
    // Bellum ne stocke aucun IBAN (`admin-docs.ts`, migration `AdminDocsConnections`,
    // `tool-catalog.ts`). Le motif de la maquette — « RIB manquant » — devient
    // donc un ÉTAT de transmission, jamais un numéro.
    const forbidden = /iban|\brib\b|bic|swift/i
    for (const blocker of ADV_BLOCKERS) expect(blocker).not.toMatch(forbidden)
    expect(ADV_BLOCKERS).toContain('payment_details_not_transmitted')
  })
})

describe('assessAdvDossier — ce qui manque, et rien d’autre', () => {
  it('ne bloque rien sur un dossier complet', () => {
    expect(assessAdvDossier(complete)).toEqual({ state: 'complete', blockers: [] })
  })

  it('nomme le contact de facturation absent', () => {
    const { blockers } = assessAdvDossier({ ...complete, billingContactId: null })
    expect(blockers).toEqual(['missing_billing_contact'])
  })

  it('ne réclame un bon de commande que si le client en exige un', () => {
    expect(assessAdvDossier({ ...complete, poNumber: null }).blockers).toEqual(['missing_po'])
    expect(assessAdvDossier({ ...complete, requiresPo: false, poNumber: null }).blockers).toEqual([])
  })

  it('nomme la référence cliente absente, et ne se laisse pas berner par des espaces', () => {
    expect(assessAdvDossier({ ...complete, clientBillingReference: null }).blockers).toEqual([
      'missing_client_reference',
    ])
    expect(assessAdvDossier({ ...complete, clientBillingReference: '   ' }).blockers).toEqual([
      'missing_client_reference',
    ])
  })

  it('nomme l’entité de facturation non désignée', () => {
    expect(assessAdvDossier({ ...complete, clientEntityId: null }).blockers).toEqual(['missing_billing_entity'])
  })

  it('ne juge PAS l’identité de l’entité — c’est le motif KYC, livré ailleurs', () => {
    // `account_entities.siren` est optionnel et rien ne l'écrit : en faire un
    // motif allumerait la pastille sur 100 % des dossiers, pour toujours.
    // La désignation se répare ici ; la vérification d'identité a son socle.
    expect(ADV_BLOCKERS).toContain('kyc_not_validated')
    expect(assessAdvDossier(complete).blockers).toEqual([])
  })

  it('nomme les conditions de règlement inconnues — et 0 jour n’en est pas une', () => {
    expect(assessAdvDossier({ ...complete, paymentTermsDays: null }).blockers).toEqual(['unknown_payment_terms'])
    expect(assessAdvDossier({ ...complete, paymentTermsDays: 0 }).blockers).toEqual(['unknown_payment_terms'])
  })

  it('nomme les coordonnées de règlement non transmises — un ÉTAT, jamais un numéro', () => {
    const { blockers } = assessAdvDossier({ ...complete, paymentDetailsTransmittedAt: null })
    expect(blockers).toEqual(['payment_details_not_transmitted'])
  })

  it('ne produit JAMAIS le motif KYC — il est réservé, pas calculé ici', () => {
    // Le KYC des entités de facturation est livré par un autre lot. Sa PLACE
    // est réservée dans la taxonomie ; le produire ici sans le calculer
    // afficherait un motif que personne ne peut lever.
    const everythingMissing = assessAdvDossier({
      kind: 'renewal',
      billingContactId: null,
      requiresPo: true,
      poNumber: null,
      clientBillingReference: null,
      paymentTermsDays: null,
      paymentDetailsTransmittedAt: null,
      clientEntityId: null,
    })
    expect(everythingMissing.blockers).not.toContain('kyc_not_validated')
    expect(ADV_RESERVED_BLOCKERS).toEqual(['kyc_not_validated'])
    expect(ADV_BLOCKERS).toContain('kyc_not_validated')
  })

  it('rend les motifs dans l’ordre de la taxonomie — le premier est celui à traiter', () => {
    const { blockers, state } = assessAdvDossier({
      ...complete,
      billingContactId: null,
      poNumber: null,
      clientBillingReference: null,
    })
    expect(state).toBe('incomplete')
    expect(blockers).toEqual(['missing_billing_contact', 'missing_po', 'missing_client_reference'])
  })
})

describe('l’ancienneté d’un dossier', () => {
  const now = new Date('2026-08-31T12:00:00.000Z')

  it('compte les jours depuis l’ouverture', () => {
    expect(advAgeDays('2026-08-21', now)).toBe(10)
  })

  it('rend `null` — et jamais 0 — quand la date d’ouverture est inconnue', () => {
    expect(advAgeDays(null, now)).toBeNull()
    expect(advAgeDays('pas-une-date', now)).toBeNull()
  })

  it('ouvre un dossier de renouvellement le jour où sa fenêtre s’ouvre', () => {
    // La fenêtre d'action commence à J-60 de la fin : c'est ce jour-là que le
    // dossier devient à traiter, pas le jour où la mission a commencé.
    expect(advRenewalOpenedOn('2026-10-30')).toBe('2026-08-31')
    expect(RENEWAL_J60_DAYS).toBe(60)
  })

  it('rend `null` quand la mission n’a pas de fin connue', () => {
    // Une mission sans fin est justement celle qu'on ne renouvelle jamais à
    // temps : lui inventer une date d'ouverture la rendrait « toute neuve »
    // pour toujours.
    expect(advRenewalOpenedOn(null)).toBeNull()
  })
})

describe('le résumé — ce qui se compte, et ce qui se DIT non mesuré', () => {
  const summary = {
    month: '2026-08',
    total: 12,
    starts: 5,
    renewals: 7,
    active: 9,
    readyToInvoice: 3,
    inNegotiation: null,
    incomplete: 8,
    startsDelta: null,
    renewalsDelta: null,
    byBlocker: ADV_BLOCKERS.map(blocker => ({
      blocker,
      count: blocker === 'kyc_not_validated' ? null : 1,
    })),
  }

  it('accepte un résumé complet', () => {
    expect(advSummarySchema.parse(summary)).toMatchObject({ month: '2026-08', total: 12 })
  })

  /**
   * ⚠️ CE TEST A CHANGÉ DE SENS LE 31/08/2026, avec le champ qu'il garde.
   *
   * Il refusait TOUT delta chiffré, parce qu'aucune source n'existait. Un
   * démarrage étant un flux DATÉ (`missions.started_on`), il se recompte à
   * l'identique pour un mois passé : la source existe désormais, et le contrat
   * l'accepte. Ce qu'il garde maintenant, c'est que `null` reste une réponse —
   * le premier mois d'un espace n'a pas de mois de référence — et qu'un delta
   * n'est jamais approximatif.
   *
   * `renewalsDelta`, lui, vaut toujours `null` en pratique, et c'est le SERVICE
   * qui le tient (`adv.service.spec.ts`) : la fenêtre J-60/J-30 des
   * renouvellements est relative à maintenant, donc irrecomposable pour un mois
   * passé. Un contrat ne peut pas garder ça — seul le calcul le sait.
   */
  it('accepte un delta de démarrages, ENTIER ou `null` — jamais approximatif', () => {
    expect(advSummarySchema.parse({ ...summary, startsDelta: 9 }).startsDelta).toBe(9)
    expect(advSummarySchema.parse({ ...summary, startsDelta: -4 }).startsDelta).toBe(-4)
    // Un zéro MESURÉ est vrai : autant de démarrages qu'en juillet est une
    // information. Ce qu'on refusait, c'était le zéro qui remplace une absence —
    // et celui-là n'a plus de chemin, puisque l'absence s'écrit `null`.
    expect(advSummarySchema.parse({ ...summary, startsDelta: 0 }).startsDelta).toBe(0)
    expect(advSummarySchema.parse({ ...summary, startsDelta: null }).startsDelta).toBeNull()
    expect(() => advSummarySchema.parse({ ...summary, startsDelta: 1.5 })).toThrow()
    expect(() => advSummarySchema.parse({ ...summary, startsDelta: '9' })).toThrow()
  })

  it('REFUSE un « en négociation » chiffré — le modèle n’a pas cet état', () => {
    expect(() => advSummarySchema.parse({ ...summary, inNegotiation: 0 })).toThrow()
  })

  it('porte une entrée par motif, KYC compris, et la sienne vaut `null`', () => {
    const parsed = advSummarySchema.parse(summary)
    expect(parsed.byBlocker.map(entry => entry.blocker)).toEqual([...ADV_BLOCKERS])
    expect(parsed.byBlocker.find(entry => entry.blocker === 'kyc_not_validated')?.count).toBeNull()
  })
})

describe('les tuiles', () => {
  it('nomme les six tuiles de la maquette', () => {
    expect(ADV_TILES).toEqual(['all', 'starts', 'renewals', 'active', 'ready_to_invoice', 'in_negotiation'])
  })

  it('ne rend filtrables que les tuiles réellement mesurées', () => {
    // Une tuile non mesurée ne peut pas filtrer : cliquer dessus rendrait une
    // liste vide qui se lirait « il n'y en a aucun ».
    expect(ADV_FILTERABLE_TILES).not.toContain('in_negotiation')
    expect(ADV_FILTERABLE_TILES.length).toBe(ADV_TILES.length - 1)
  })
})

describe('le geste d’écriture', () => {
  it('accepte le RETRAIT d’un terme — jamais sa mise à zéro', () => {
    expect(updateAdvDossierSchema.parse({ paymentTermsDays: null })).toEqual({ paymentTermsDays: null })
    expect(() => updateAdvDossierSchema.parse({ paymentTermsDays: 0 })).toThrow()
  })

  it('n’accepte AUCUN champ qui ressemblerait à un moyen de paiement', () => {
    expect(() => updateAdvDossierSchema.parse({ iban: 'FR7630006000011234567890189' })).toThrow()
    // Ce qui se saisit est un ÉTAT booléen, et il pose une date côté serveur.
    expect(updateAdvDossierSchema.parse({ paymentDetailsTransmitted: true })).toEqual({
      paymentDetailsTransmitted: true,
    })
  })

  it('refuse une référence cliente vide plutôt que d’enregistrer du blanc', () => {
    expect(() => updateAdvDossierSchema.parse({ clientBillingReference: '   ' })).toThrow()
  })
})

describe('la ligne rendue', () => {
  it('porte son motif, son ancienneté mesurable et le compte où le réparer', () => {
    const row = advDossierSchema.parse({
      missionId: '0c1e6f4a-3333-4333-8333-333333333333',
      missionLabel: 'Ingénieur DevOps',
      accountId: '0c1e6f4a-4444-4444-8444-444444444444',
      accountName: 'Lacoste',
      kind: 'start',
      missionStatus: 'onboarding',
      state: 'incomplete',
      blockers: ['missing_client_reference'],
      openedOn: '2026-08-01',
      startedOn: '2026-08-01',
      endsOn: null,
      clientBillingReference: null,
      paymentTermsDays: 60,
      paymentDetailsTransmittedAt: null,
      clientEntityId: null,
      clientEntityName: null,
    })
    expect(row.kind).toBe('start')
    expect(ADV_DOSSIER_KINDS).toEqual(['start', 'renewal'])
  })
})
