import { describe, expect, it } from 'vitest'
import { CREDIT_WEIGHTS } from '../billing/credit-weights.js'
import {
  BULK_VERIFY_MAX_CONTACTS,
  bulkVerificationCost,
  bulkVerifyContactsRequestSchema,
  computeContactFieldStatus,
  ENRICHMENT_RETRY_COOLDOWN_DAYS,
  enrichmentCooldown,
  formatPhoneForDisplay,
  isPlausiblePhoneNumber,
  looksLikePhoneNumber,
  missingEnrichmentChannels,
  toE164,
} from './contact-enrichment.js'

const DAY_MS = 86_400_000
const NOW = new Date('2026-07-19T12:00:00.000Z')
const daysAgo = (days: number): string => new Date(NOW.getTime() - days * DAY_MS).toISOString()

describe('missingEnrichmentChannels', () => {
  it('lists every empty reachability channel, email → linkedin → phone', () => {
    expect(missingEnrichmentChannels({})).toEqual(['email', 'linkedin', 'phone'])
  })

  it('drops the channels already filled', () => {
    expect(missingEnrichmentChannels({ email: 'a@b.com', phone: null, linkedin_url: null })).toEqual([
      'linkedin',
      'phone',
    ])
    expect(
      missingEnrichmentChannels({ email: 'a@b.com', phone: '+33600000000', linkedin_url: 'https://li/x' }),
    ).toEqual([])
  })
})

describe('enrichmentCooldown', () => {
  it('never blocks a first attempt', () => {
    expect(enrichmentCooldown({}, NOW)).toBeNull()
    expect(enrichmentCooldown({ last_enrichment_at: daysAgo(1) }, NOW)).toBeNull()
  })

  it('never blocks when the last attempt DID bring something back', () => {
    // A productive attempt says nothing about the next one — Apollo filled the
    // email, the phone may well land later.
    expect(
      enrichmentCooldown(
        { last_enrichment_at: daysAgo(1), last_enrichment_result: 'matched', last_enrichment_missing: ['phone'] },
        NOW,
      ),
    ).toBeNull()
  })

  it('holds a retry we KNOW is pointless: empty attempt, same gaps, inside the cooldown', () => {
    const cooldown = enrichmentCooldown(
      {
        email: 'a@b.com',
        last_enrichment_at: daysAgo(3),
        last_enrichment_result: 'no_new_data',
        last_enrichment_missing: ['linkedin', 'phone'],
      },
      NOW,
    )
    expect(cooldown).not.toBeNull()
    expect(cooldown?.lastAttemptAt).toBe(daysAgo(3))
    expect(cooldown?.retryAvailableAt).toBe(
      new Date(Date.parse(daysAgo(3)) + ENRICHMENT_RETRY_COOLDOWN_DAYS * DAY_MS).toISOString(),
    )
  })

  it('releases the hold once the cooldown elapsed — never a permanent block', () => {
    expect(
      enrichmentCooldown(
        {
          email: 'a@b.com',
          last_enrichment_at: daysAgo(ENRICHMENT_RETRY_COOLDOWN_DAYS + 1),
          last_enrichment_result: 'no_new_data',
          last_enrichment_missing: ['linkedin', 'phone'],
        },
        NOW,
      ),
    ).toBeNull()
  })

  it('releases the hold as soon as the gaps changed — the provider has a new match key', () => {
    // The rep typed the phone in by hand since the empty attempt: the missing
    // set shrank, so the next call asks a different question. Retry allowed.
    expect(
      enrichmentCooldown(
        {
          email: 'a@b.com',
          phone: '+33600000000',
          last_enrichment_at: daysAgo(3),
          last_enrichment_result: 'no_new_data',
          last_enrichment_missing: ['linkedin', 'phone'],
        },
        NOW,
      ),
    ).toBeNull()
  })

  it('falls back to the plain timer when a legacy row recorded no gap list', () => {
    expect(
      enrichmentCooldown(
        { email: 'a@b.com', last_enrichment_at: daysAgo(2), last_enrichment_result: 'no_new_data' },
        NOW,
      ),
    ).not.toBeNull()
  })

  it('ignores an unparsable / absent timestamp rather than blocking', () => {
    expect(
      enrichmentCooldown({ last_enrichment_at: 'not-a-date', last_enrichment_result: 'no_new_data' }, NOW),
    ).toBeNull()
    expect(enrichmentCooldown({ last_enrichment_result: 'no_new_data' }, NOW)).toBeNull()
  })
})

// #2297.37 — le statut `not_found` d'un champ enrichi (email/téléphone) était
// jusqu'ici seulement DÉDUIT (une valeur vide + une tentative passée), en dur
// dans `ContactKeyInfo.tsx`, jamais nommé. `computeContactFieldStatus` porte
// désormais les cinq statuts possibles d'un champ, une seule fois (GA-26) —
// même priorité que le composant : valeur > archivé > non trouvé > disponible
// (avant-vente) > jamais tenté.
describe('computeContactFieldStatus', () => {
  it('`value` — une coordonnée présente gagne sur tout le reste', () => {
    expect(computeContactFieldStatus({ value: 'a@b.com', enrichmentAttempted: true })).toBe('value')
  })

  it('`not_attempted` — rien trouvé, rien tenté, aucune promesse Apollo : silence', () => {
    expect(computeContactFieldStatus({ value: null, enrichmentAttempted: false })).toBe('not_attempted')
  })

  it('`available` — la recherche gratuite promet la coordonnée, avant tout enrichissement payé', () => {
    expect(computeContactFieldStatus({ value: null, enrichmentAttempted: false, apolloAvailable: true })).toBe(
      'available',
    )
  })

  it('`not_found` — un enrichissement a été TENTÉ et le champ est resté vide (#2598.2)', () => {
    expect(computeContactFieldStatus({ value: null, enrichmentAttempted: true })).toBe('not_found')
  })

  it('`not_found` gagne sur la promesse Apollo périmée — une tentative passée répond à la question', () => {
    expect(computeContactFieldStatus({ value: null, enrichmentAttempted: true, apolloAvailable: true })).toBe(
      'not_found',
    )
  })

  it('`archived` — une coordonnée archivée par la rétention n’est ni « jamais cherchée » ni « non trouvée » (#2297.51)', () => {
    expect(
      computeContactFieldStatus({ value: null, enrichmentAttempted: true, archivedAt: '2026-01-01T00:00:00.000Z' }),
    ).toBe('archived')
  })

  // #3822.2 — « erreur » : l'appel fournisseur a ÉCHOUÉ sur ce canal (panne,
  // timeout), distinct de `not_found` (l'appel a RÉPONDU, et n'a rien rapporté).
  // Confondre les deux dirait « recherché sans résultat » d'un canal jamais
  // vraiment interrogé — l'exact défaut que la doctrine « on n'affiche pas ce
  // qu'on n'a pas » interdit. Persisté par contact ET par coordonnée
  // (`contacts.enrichment_coordinates`, état `unknown`), visible après reload.
  it('`error` — le dernier appel sur CE canal a échoué, distinct de `not_found`', () => {
    expect(computeContactFieldStatus({ value: null, enrichmentAttempted: true, errored: true })).toBe('error')
  })

  it('`error` gagne sur `archived` — une panne ne doit pas se lire comme un fait de rétention', () => {
    expect(
      computeContactFieldStatus({
        value: null,
        enrichmentAttempted: true,
        errored: true,
        archivedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe('error')
  })

  it('`value` gagne sur `error` — une coordonnée déjà connue reste affichée malgré une panne plus récente', () => {
    expect(computeContactFieldStatus({ value: 'a@b.com', enrichmentAttempted: true, errored: true })).toBe('value')
  })

  // #2297.33/.39 — le téléphone n'avait AUCUN statut de validité (#2120.69 :
  // « aucune vérification de numéro n'existe dans le produit »), contrairement
  // à l'email (`email_confidence`, dérivé du `email_status` qu'Apollo calcule
  // lui-même). `invalid` ne devine PAS le contrat d'un fournisseur (le
  // vocabulaire de statut d'Apollo pour un numéro n'est documenté nulle part
  // dans ce dépôt — « un contrat d'API non vérifiable ne se devine pas ») : il
  // se fonde sur la SEULE chose qu'on contrôle, la FORME de la valeur stockée,
  // avec le même test que celui qui filtre déjà les fournisseurs de secours
  // (`looksLikePhoneNumber`, ex-`tolerant-extract.ts`, réutilisé — GA-26).
  it('`invalid` — une valeur présente qui ne ressemble pas à un numéro gagne sur `value`', () => {
    expect(computeContactFieldStatus({ value: 'N/A', enrichmentAttempted: true, invalid: true })).toBe('invalid')
  })

  it('`value` gagne quand la forme est valide, même avec le paramètre `invalid` fourni', () => {
    expect(computeContactFieldStatus({ value: '+33 1 23 45 67 89', enrichmentAttempted: true, invalid: false })).toBe(
      'value',
    )
  })

  // #3782 — RÉGRESSION : une révélation du mobile Apollo en attente de webhook
  // (`enrichment_coordinates.phone.state === 'pending'`, `contacts.service.ts`
  // `foldEnrichmentCoordinateStates`) arrivait ici avec `enrichmentAttempted:
  // true` (la tentative synchrone a déjà matché sur l'e-mail) et aucune valeur.
  // Avant ce correctif, l'absence de statut `pending` faisait retomber le
  // calcul sur `not_found` : la fiche disait « numéro introuvable » alors que
  // le fournisseur répond encore — exactement le retour bêta du 06/10 (« avant
  // l'enrichissement c'était indiqué disponible, après il dit introuvable »).
  it('`pending` — une révélation attendue par webhook n’est jamais un « non trouvé » (#3782)', () => {
    expect(computeContactFieldStatus({ value: null, enrichmentAttempted: true, pending: true })).toBe('pending')
  })

  it('`pending` gagne sur la promesse Apollo périmée, comme `not_found`', () => {
    expect(
      computeContactFieldStatus({ value: null, enrichmentAttempted: true, pending: true, apolloAvailable: true }),
    ).toBe('pending')
  })

  it('`error` gagne sur `pending` — une panne constatée fait plus autorité qu’une attente', () => {
    expect(computeContactFieldStatus({ value: null, enrichmentAttempted: true, pending: true, errored: true })).toBe(
      'error',
    )
  })

  it('`value` gagne sur `pending` — une coordonnée déjà connue reste affichée', () => {
    expect(computeContactFieldStatus({ value: 'a@b.com', enrichmentAttempted: true, pending: true })).toBe('value')
  })
})

// #2297.33/.39 — même heuristique que celle qui filtre déjà les réponses des
// fournisseurs de secours (`tolerant-extract.ts`) : au moins huit chiffres,
// aucune lettre. Réutilisée ici (GA-26 : un réglage vit à un seul endroit),
// jamais recopiée.
describe('looksLikePhoneNumber', () => {
  it('accepte un numéro français formaté', () => {
    expect(looksLikePhoneNumber('+33 1 23 45 67 89')).toBe(true)
  })

  it('refuse une chaîne trop courte (poste interne, pas un moyen d’appeler)', () => {
    expect(looksLikePhoneNumber('4512')).toBe(false)
  })

  it('refuse une chaîne qui contient des lettres', () => {
    expect(looksLikePhoneNumber('ID-20250814')).toBe(false)
  })

  it('refuse un texte manifestement pas un numéro', () => {
    expect(looksLikePhoneNumber('N/A')).toBe(false)
  })
})

/**
 * #3850.1 — mesuré en prod le 08/10 : un code postal brésilien « 90480-000 »
 * a été ENREGISTRÉ comme téléphone sur une fiche réelle (Romali Mondal).
 * `looksLikePhoneNumber` (huit à quinze chiffres, aucune lettre) laisse
 * passer ce motif — il n'a jamais été conçu pour le POINT D'ÉCRITURE, où on
 * peut se permettre d'être plus strict qu'à l'affichage (une valeur déjà en
 * base, elle, doit rester VISIBLE même suspecte — § `invalid` plus haut).
 *
 * `isPlausiblePhoneNumber` est la garde d'ÉCRITURE : E.164 plausible
 * (`+`/`00` + 8 à 15 chiffres), ou le format local FRANÇAIS usuel (0 + 9
 * chiffres) — jamais un autre motif deviné. Un code postal, une date ou un
 * identifiant qui tombe dans la fenêtre 8-15 chiffres n'a NI indicatif NI la
 * forme locale française : il est rejeté, sans qu'on ait besoin de connaître
 * le pays réel du contact (doctrine : un contrat non vérifiable ne se
 * devine pas — on ne DEVINE pas non plus un indicatif qu'on ne nous a pas
 * donné).
 */
describe('isPlausiblePhoneNumber (#3850.1 — garde au point d’écriture)', () => {
  it('accepte un numéro français formaté international', () => {
    expect(isPlausiblePhoneNumber('+33 6 81 05 00 91')).toBe(true)
  })

  it('accepte un numéro local français non préfixé (format fournisseur historique)', () => {
    expect(isPlausiblePhoneNumber('06 39 98 41 27')).toBe(true)
  })

  it('accepte un indicatif international non-FR (+1, +55…)', () => {
    expect(isPlausiblePhoneNumber('+1 415 555 0132')).toBe(true)
    expect(isPlausiblePhoneNumber('+55 11 98765 4321')).toBe(true)
  })

  it('accepte le préfixe de sortie 00 comme un indicatif explicite', () => {
    expect(isPlausiblePhoneNumber('00 33 6 81 05 00 91')).toBe(true)
  })

  it('refuse un code postal brésilien (CEP) — exactement le cas Romali Mondal', () => {
    expect(isPlausiblePhoneNumber('90480-000')).toBe(false)
  })

  it('refuse une date, quel que soit le séparateur', () => {
    expect(isPlausiblePhoneNumber('2026-08-14')).toBe(false)
    expect(isPlausiblePhoneNumber('14.08.2026')).toBe(false)
  })

  it('refuse un identifiant purement numérique (type SIREN)', () => {
    expect(isPlausiblePhoneNumber('552100554')).toBe(false)
  })

  it('refuse ce que `looksLikePhoneNumber` laissait passer à tort', () => {
    // Même chaîne : la garde d'affichage dit "a la forme d'un numéro", la
    // garde d'écriture dit "mais ni indicatif ni forme locale FR plausible".
    expect(looksLikePhoneNumber('90480-000')).toBe(true)
    expect(isPlausiblePhoneNumber('90480-000')).toBe(false)
  })

  it('refuse une chaîne vide ou un texte', () => {
    expect(isPlausiblePhoneNumber('')).toBe(false)
    expect(isPlausiblePhoneNumber('N/A')).toBe(false)
  })
})

// #3850.4 — stockage E.164 compact, sans espace. `toE164` ne REVALIDE rien :
// elle suppose une valeur déjà jugée plausible par la garde d'écriture.
describe('toE164 (#3850.4 — stockage, sans espace)', () => {
  it('ne touche pas une valeur déjà au format E.164 compact', () => {
    expect(toE164('+33681050091')).toBe('+33681050091')
  })

  it('compacte un E.164 espacé', () => {
    expect(toE164('+33 6 81 05 00 91')).toBe('+33681050091')
  })

  it('remplace le 00 de sortie par un +', () => {
    expect(toE164('00 33 6 81 05 00 91')).toBe('+33681050091')
  })

  it('convertit le format local français (0 initial → +33)', () => {
    expect(toE164('06 39 98 41 27')).toBe('+33639984127')
  })
})

// #3850.4 — affichage international lisible (« +33 6 81 05 00 91 »).
describe('formatPhoneForDisplay (#3850.4 — affichage, international lisible)', () => {
  it('formate un numéro français — le découpage EXACT de la doctrine (D82/#3850)', () => {
    expect(formatPhoneForDisplay('+33681050091')).toBe('+33 6 81 05 00 91')
  })

  it('formate un numéro français déjà espacé — idempotent', () => {
    expect(formatPhoneForDisplay('+33 6 81 05 00 91')).toBe('+33 6 81 05 00 91')
  })

  it('formate un format local français (0 initial) en international', () => {
    expect(formatPhoneForDisplay('06 39 98 41 27')).toBe('+33 6 39 98 41 27')
  })

  // #3850 (recette MO 10/10) revient sur « indicatif non-FR = compact » : le +44 de la recette restait
  // sans formatage à côté des +33. Le découpage vient d'un REGISTRE d'indicatifs (sans préfixe), pas de la longueur.
  it('#3850 — un indicatif non-FR connu se lit « indicatif + groupes »', () => {
    expect(formatPhoneForDisplay('+447765108039')).toBe('+44 7765 108039')
    expect(formatPhoneForDisplay('+14155550132')).toBe('+1 415 555 0132')
    expect(formatPhoneForDisplay('+4915112345678')).toBe('+49 151 123 456 78')
    // Idempotent.
    expect(formatPhoneForDisplay('+44 7765 108039')).toBe('+44 7765 108039')
  })

  it('#3850 — sait dire NON : un indicatif hors registre reste en E.164 compact, jamais deviné', () => {
    expect(formatPhoneForDisplay('+99912345678')).toBe('+99912345678')
  })

  it('rend une valeur invalide TELLE QUELLE — jamais un découpage deviné', () => {
    expect(formatPhoneForDisplay('90480-000')).toBe('90480-000')
  })
})

// #2296.38 à .41 — vérification en masse : la BORNE (cinquante), et aucune
// règle dédiée au « poste mondial » (#2296.41 : le cas particulier, c'est
// qu'il n'y en a pas — un contact au périmètre mondial est juste un UUID de
// plus dans la même liste, jamais filtré ni traité différemment ici).
describe('bulkVerifyContactsRequestSchema', () => {
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

  it('accepte une liste d’un seul contact', () => {
    const parsed = bulkVerifyContactsRequestSchema.parse({ contact_ids: [uuid(1)] })
    expect(parsed.contact_ids).toEqual([uuid(1)])
  })

  it(`accepte exactement ${BULK_VERIFY_MAX_CONTACTS} contacts — la borne #2296.38`, () => {
    const ids = Array.from({ length: BULK_VERIFY_MAX_CONTACTS }, (_, i) => uuid(i))
    expect(() => bulkVerifyContactsRequestSchema.parse({ contact_ids: ids })).not.toThrow()
  })

  it(`refuse ${BULK_VERIFY_MAX_CONTACTS + 1} contacts — jamais un lot sans borne`, () => {
    const ids = Array.from({ length: BULK_VERIFY_MAX_CONTACTS + 1 }, (_, i) => uuid(i))
    expect(() => bulkVerifyContactsRequestSchema.parse({ contact_ids: ids })).toThrow()
  })

  it('refuse une liste vide — rien à vérifier n’est pas une vérification', () => {
    expect(() => bulkVerifyContactsRequestSchema.parse({ contact_ids: [] })).toThrow()
  })

  it('ne distingue pas un contact au périmètre mondial des autres — même UUID, même chemin', () => {
    // #2296.41 : aucun champ « scope »/« global » dans ce schéma — un contact
    // mondial n'a structurellement rien qui le sépare des 49 autres du lot.
    expect(Object.keys(bulkVerifyContactsRequestSchema.shape)).toEqual(['contact_ids'])
  })
})

// #2964 — le coût AVANT le clic d'une vérification FORCÉE : tous les contacts
// sélectionnés partent (aucun filtre « champ manquant », contrairement à
// `bulkEnrichmentCost`), sur le MÊME barème que l'enrichissement.
describe('bulkVerificationCost', () => {
  it('facture TOUS les contacts sélectionnés, sans filtre — le point qui manquait au bouton', () => {
    expect(bulkVerificationCost(3)).toEqual({ billable: 3, maxCredits: 3 * CREDIT_WEIGHTS.contact_enrichment })
  })

  it(`borne l'annoncé à ${BULK_VERIFY_MAX_CONTACTS} — jamais un coût sur ce qui ne partira pas`, () => {
    expect(bulkVerificationCost(BULK_VERIFY_MAX_CONTACTS + 20)).toEqual({
      billable: BULK_VERIFY_MAX_CONTACTS,
      maxCredits: BULK_VERIFY_MAX_CONTACTS * CREDIT_WEIGHTS.contact_enrichment,
    })
  })

  it('zéro sélectionné = zéro annoncé, jamais un coût sur rien', () => {
    expect(bulkVerificationCost(0)).toEqual({ billable: 0, maxCredits: 0 })
  })
})
