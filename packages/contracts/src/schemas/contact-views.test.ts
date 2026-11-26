import { describe, expect, it } from 'vitest'
import {
  billableForEnrichment,
  bulkEnrichmentCost,
  bulkEnrichmentExclusionReason,
  bulkEnrichmentExclusions,
  CONTACT_VIEWS,
  deprioritisesInternational,
  groupByContactView,
  resolveContactView,
} from './contact-views.js'

describe('les cinq vues de la liste de contacts (§37)', () => {
  it('les cinq du rapport', () => {
    expect(CONTACT_VIEWS).toEqual(['to_contact', 'to_enrich', 'to_verify', 'known', 'hidden'])
  })

  it('l’identité passe AVANT le canal', () => {
    // Un profil dont on n'a pas le nom complet n'est pas « à enrichir », il est
    // « à vérifier » : enrichir un profil non identifié dépense un crédit sur
    // une question mal posée.
    expect(resolveContactView({ full_name: null })).toBe('to_verify')
    expect(resolveContactView({ full_name: 'Ludovic V.' })).toBe('to_enrich')
    expect(resolveContactView({ full_name: 'Ludovic V.', email: 'l@sg.fr' })).toBe('to_contact')
  })

  it('« masqué » et « déjà connu » priment sur toute tâche', () => {
    // Reproposer d'enrichir quelqu'un qu'on a déjà touché est la façon la plus
    // sûre de faire perdre confiance en la liste.
    expect(resolveContactView({ hidden: true, full_name: 'X', email: 'x@y.fr' })).toBe('hidden')
    expect(resolveContactView({ full_name: 'X', email_sent_at: '2026-07-01' })).toBe('known')
    expect(resolveContactView({ full_name: 'X', crm_synced_at: '2026-07-01' })).toBe('known')
  })

  it('le statut de relation dit « déjà connu » aussi bien qu’un horodatage', () => {
    // La liste `/contacts` ne transporte NI `email_sent_at` NI `crm_synced_at` :
    // elle transporte `user_status`. Tout ce qui dépasse `new` dit exactement la
    // même chose — quelqu'un a déjà touché ce contact. Fabriquer un horodatage
    // pour satisfaire la signature aurait été une donnée inventée ; refaire la
    // règle côté écran en aurait fait une seconde dérivation (GA-26).
    expect(resolveContactView({ full_name: 'X', user_status: 'contacted' })).toBe('known')
    expect(resolveContactView({ full_name: 'X', user_status: 'replied' })).toBe('known')
    expect(resolveContactView({ full_name: 'X', user_status: 'refused' })).toBe('known')
    // `new` est l'absence de relation : il ne doit RIEN changer au classement.
    expect(resolveContactView({ full_name: 'X', user_status: 'new' })).toBe('to_enrich')
    expect(resolveContactView({ full_name: 'X', email: 'x@y.fr', user_status: 'new' })).toBe('to_contact')
    // Un statut vide ou inconnu ne conclut pas non plus : seule une valeur
    // NOMMÉE et différente de `new` établit qu'on a touché la personne.
    expect(resolveContactView({ full_name: 'X', user_status: '' })).toBe('to_enrich')
    expect(resolveContactView({ full_name: 'X', user_status: null })).toBe('to_enrich')
  })

  it('« masqué » l’emporte même sur une relation existante', () => {
    // Une décision de l'utilisateur ne se fait contredire par aucune tâche.
    expect(resolveContactView({ full_name: 'X', user_status: 'replied', hidden: true })).toBe('hidden')
  })

  it('l’appartenance se dérive de l’état, jamais d’une case à cocher', () => {
    // Un contact enrichi doit quitter « à enrichir » tout seul, sinon la liste
    // devient un inventaire à tenir à la main — donc faux au bout d'une semaine.
    const avant = { full_name: 'Ludovic' }
    const apres = { ...avant, email: 'l@sg.fr' }
    expect(resolveContactView(avant)).toBe('to_enrich')
    expect(resolveContactView(apres)).toBe('to_contact')
  })

  it('range une liste entière en un passage, sans en perdre', () => {
    const contacts = [
      { full_name: 'A', email: 'a@x.fr' },
      { full_name: 'B' },
      { full_name: null },
      { full_name: 'D', hidden: true },
      { full_name: 'E', email_sent_at: '2026-07-01' },
    ]
    const groups = groupByContactView(contacts)
    expect(Object.values(groups).flat()).toHaveLength(contacts.length)
    expect(groups.to_contact).toHaveLength(1)
    expect(groups.to_verify).toHaveLength(1)
  })
})

describe('le coût d’une action de lot, annoncé avant le clic (§37)', () => {
  it('« jusqu’à N crédits » — le maximum, jamais une estimation basse', () => {
    // L'enrichissement ne débite que sur un résultat : le coût réel est
    // inférieur ou égal. Annoncer le maximum est la seule formulation qui ne
    // puisse pas décevoir.
    const cost = bulkEnrichmentCost([{ full_name: 'A' }, { full_name: 'B' }, { full_name: 'C' }])
    expect(cost).toEqual({ billable: 3, maxCredits: 3 })
  })

  it('un contact déjà pourvu n’entre pas dans le compte', () => {
    // Le facturer serait payer deux fois pour la même information.
    const cost = bulkEnrichmentCost([
      { full_name: 'A', email: 'a@x.fr' },
      { full_name: 'B', phone: '0600' },
      { full_name: 'C' },
    ])
    expect(cost).toEqual({ billable: 1, maxCredits: 1 })
  })

  it('un profil sans identité n’est pas facturable', () => {
    expect(bulkEnrichmentCost([{ full_name: null }])).toEqual({ billable: 0, maxCredits: 0 })
  })

  it('le lot ANNONCÉ est exactement le lot ENVOYÉ', () => {
    // Le prix annoncé doit être celui débité. Deux prédicats — un pour compter,
    // un pour choisir qui part à l'enrichissement — divergent le jour où l'un
    // des deux bouge, et l'écart se lit sur une facture. `billableForEnrichment`
    // est donc la SEULE porte : `bulkEnrichmentCost` compte ce qu'elle rend.
    const contacts = [
      { id: 'a', full_name: 'A' },
      { id: 'b', full_name: 'B', email: 'b@x.fr' },
      { id: 'c', full_name: null },
      { id: 'd', full_name: 'D', phone: '0600' },
      { id: 'e', full_name: 'E' },
    ]
    const billable = billableForEnrichment(contacts)
    expect(billable.map(c => c.id)).toEqual(['a', 'e'])
    expect(bulkEnrichmentCost(contacts).billable).toBe(billable.length)
  })

  it('préserve le type de l’appelant — on renvoie les contacts, pas des copies', () => {
    // L'écran doit pouvoir enrichir CES objets-là (id, company_name…), pas une
    // projection réduite à ce que le contrat sait lire.
    const row = { id: 'a', full_name: 'A', company_name: 'ACME' }
    expect(billableForEnrichment([row])[0]).toBe(row)
  })
})

// #2297.25 / #2297.26 — l'exclusion d'un lot était SILENCIEUSE : le contact
// disparaissait entre la sélection et l'annonce sans qu'aucune raison ne
// voyage. Même prédicat que `billableForEnrichment` (un seul endroit, GA-26) :
// une raison nommée par contact exclu, jamais un second calcul.
describe('pourquoi un contact ne part pas à l’enrichissement de lot (#2297.25/#2297.26)', () => {
  it('identité non résolue AVANT coordonnée déjà là — même priorité que resolveContactView', () => {
    expect(bulkEnrichmentExclusionReason({ full_name: null, email: 'a@b.fr' })).toBe('identity_unresolved')
  })

  it('déjà pourvu d’une coordonnée (email OU téléphone)', () => {
    expect(bulkEnrichmentExclusionReason({ full_name: 'A', email: 'a@b.fr' })).toBe('already_has_contact_info')
    expect(bulkEnrichmentExclusionReason({ full_name: 'A', phone: '0600' })).toBe('already_has_contact_info')
  })

  it('`null` — facturable, aucune exclusion', () => {
    expect(bulkEnrichmentExclusionReason({ full_name: 'A' })).toBeNull()
  })

  it('décompte par raison, une raison à zéro n’apparaît pas', () => {
    const contacts = [
      { id: 'a', full_name: 'A' },
      { id: 'b', full_name: 'B', email: 'b@x.fr' },
      { id: 'c', full_name: null },
      { id: 'd', full_name: 'D', phone: '0600' },
      { id: 'e', full_name: null },
    ]
    expect(bulkEnrichmentExclusions(contacts)).toEqual([
      { reason: 'identity_unresolved', count: 2 },
      { reason: 'already_has_contact_info', count: 2 },
    ])
    expect(bulkEnrichmentExclusions([{ id: 'a', full_name: 'A' }])).toEqual([])
  })

  // #2297.26 — LAU-FINAL-038 (PREVIEW) demande d'annoncer les « contacts déjà
  // enrichis récemment » avant le clic. Le serveur (`preflightEnrichment`)
  // refusait déjà ces contacts sans débit via `enrichmentCooldown`, mais
  // l'annonce côté lot ne le reprenait pas : un contact qui allait être
  // silencieusement écarté restait compté « facturable » dans l'aperçu.
  describe('un contact récemment tenté, sans nouvelle donnée, n’entre pas dans le lot (#2297.26)', () => {
    const NOW = new Date('2026-09-30T12:00:00.000Z')
    const DAY_MS = 86_400_000
    const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS).toISOString()

    it('tentative récente et infructueuse — même règle que `enrichmentCooldown`', () => {
      const contact = {
        full_name: 'A',
        last_enrichment_result: 'no_new_data',
        last_enrichment_at: daysAgo(1),
      }
      expect(bulkEnrichmentExclusionReason(contact, NOW)).toBe('on_cooldown')
      expect(bulkEnrichmentCost([contact], NOW)).toEqual({ billable: 0, maxCredits: 0 })
    })

    it('cooldown expiré — de nouveau facturable', () => {
      const contact = {
        full_name: 'A',
        last_enrichment_result: 'no_new_data',
        last_enrichment_at: daysAgo(31),
      }
      expect(bulkEnrichmentExclusionReason(contact, NOW)).toBeNull()
    })

    it('déjà pourvu d’une coordonnée prime sur le cooldown — une seule raison à la fois', () => {
      const contact = {
        full_name: 'A',
        email: 'a@b.fr',
        last_enrichment_result: 'no_new_data',
        last_enrichment_at: daysAgo(1),
      }
      expect(bulkEnrichmentExclusionReason(contact, NOW)).toBe('already_has_contact_info')
    })

    it('décompte : la nouvelle raison suit les mêmes règles (jamais de ligne à zéro)', () => {
      const contacts = [
        { id: 'a', full_name: 'A' },
        { id: 'b', full_name: 'B', last_enrichment_result: 'no_new_data', last_enrichment_at: daysAgo(1) },
      ]
      expect(bulkEnrichmentExclusions(contacts, NOW)).toEqual([{ reason: 'on_cooldown', count: 1 }])
    })
  })
})

describe('pas d’auto-priorisation internationale pour une ESN française (§37)', () => {
  it('la France déprioritise, les autres non', () => {
    expect(deprioritisesInternational('FR')).toBe(true)
    expect(deprioritisesInternational('france')).toBe(true)
    expect(deprioritisesInternational('US')).toBe(false)
    expect(deprioritisesInternational(null)).toBe(false)
  })
})
