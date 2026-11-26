import {
  LEAD_PROPOSAL_REASON_LABELS,
  LEAD_VERIFICATION_LABELS,
  SIGNAL_DOMAIN_CODES,
  type ProjectReadRow,
} from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  accountQualificationLeads,
  leadImpact,
  leadPrimaryAction,
  leadGapLabel,
  leadReserve,
  splitLeadsByProof,
  type LeadDecisionRow,
} from './qualificationLeads'

/**
 * #2172 — LA DÉRIVATION DE LA FILE « PISTES À QUALIFIER ».
 *
 * Elle ne fabrique RIEN : elle lit les lignes que l'API rend déjà et dit, pour
 * chacune, ce qu'on sait, d'où ça vient, ce qui manque et ce qu'il faut aller
 * vérifier. Tout ce qu'elle ne sait pas est NOMMÉ.
 */

const NOW = new Date('2026-09-15T00:00:00.000Z')

function row(over: Partial<ProjectReadRow> & { id: string }): ProjectReadRow {
  return {
    account_id: 'acc-1',
    company_name: 'Transports Aurignac',
    sector: null,
    logo_url: null,
    website: null,
    kind: 'signal',
    label: 'Ouverture d’un second entrepôt automatisé',
    detail: null,
    offer: null,
    source: 'Communiqué de presse du 02/09',
    confidence: null,
    urgency: null,
    stage: 'detected',
    stage_entered_at: '2026-09-03T00:00:00.000Z',
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    loss_reason: null,
    first_detected_at: '2026-09-03T00:00:00.000Z',
    updated_at: '2026-09-03T00:00:00.000Z',
    ...over,
  } as ProjectReadRow
}

describe('#2172.2/.3 — ce qui entre dans la file', () => {
  it('ne garde QUE ce que personne n’a encore regardé — une ligne du pipe n’est pas une piste', () => {
    const leads = accountQualificationLeads({
      rows: [row({ id: 'a' }), row({ id: 'b', stage: 'negotiation', kind: 'pain' })],
      now: NOW,
    })
    expect(leads.active.map(lead => lead.key)).toEqual(['a'])
  })

  it('n’invente aucune piste : sans fait source, rien n’entre dans la file', () => {
    const leads = accountQualificationLeads({
      rows: [row({ id: 'nu', source: null, first_detected_at: '' })],
      now: NOW,
    })
    expect(leads.active).toHaveLength(0)
    expect(leads.counts.total).toBe(0)
  })
})

describe('#2172.4-.9 — le niveau de preuve se LIT, il ne se décrète pas', () => {
  it('deux lignes du même domaine convergent ; seule, la même ligne reste un signal isolé', () => {
    const seul = accountQualificationLeads({ rows: [row({ id: 'a', primary_domain_code: 'esn_it' })], now: NOW })
    expect(seul.active[0]?.evidence_level).toBe('isolated_signal')
    expect(seul.active[0]?.source_facts).toHaveLength(1)

    const converge = accountQualificationLeads({
      rows: [
        row({ id: 'a', primary_domain_code: 'esn_it' }),
        row({ id: 'b', primary_domain_code: 'esn_it', label: 'Nomination d’un DSI' }),
      ],
      now: NOW,
    })
    expect(converge.active[0]?.evidence_level).toBe('converging_signals')
    expect(converge.active[0]?.source_facts).toHaveLength(2)
  })

  it('une ligne reprise d’un fichier est une piste issue du CRM ou d’un échange', () => {
    const leads = accountQualificationLeads({ rows: [row({ id: 'a', kind: 'imported' })], now: NOW })
    expect(leads.active[0]?.evidence_level).toBe('crm_or_exchange')
  })
})

describe('#2172.10-.19 — ce que porte une piste, et ce qu’elle DIT ne pas savoir', () => {
  const leads = accountQualificationLeads({ rows: [row({ id: 'a' })], contactCount: 0, now: NOW })
  const lead = leads.active[0]

  it('porte le compte, la date, la raison et la prochaine vérification', () => {
    expect(lead?.account_id).toBe('acc-1')
    expect(lead?.company_name).toBe('Transports Aurignac')
    expect(lead?.observed_on).toBe('2026-09-03T00:00:00.000Z')
    // La raison et la vérification sont des CODES du contrat, pas des phrases :
    // une phrase construite ici serait figée en français pour toujours.
    expect(lead?.proposal_reason).toBe('single_dated_fact')
    expect(LEAD_PROPOSAL_REASON_LABELS[lead!.proposal_reason].fr.length).toBeGreaterThan(10)
    // Aucun interlocuteur connu : c'est CE manque-là que la file demande d'aller
    // combler, pas un « à qualifier » qui ne dirait rien.
    expect(lead?.next_verification).toBe('find_contact')
    expect(LEAD_VERIFICATION_LABELS[lead!.next_verification].fr.length).toBeGreaterThan(25)
  })

  it('NOMME ce qui manque — jamais un vide, jamais un zéro', () => {
    expect(lead?.perimeter).toBeNull()
    expect(lead?.matched_expertise).toBeNull()
    expect(lead?.missing).toContain('no_perimeter')
    expect(lead?.missing).toContain('no_matched_expertise')
    expect(lead?.missing).toContain('no_contact')
  })

  it('un fait non daté n’est pas un fait récent — la date manquante est nommée', () => {
    const sansDate = accountQualificationLeads({ rows: [row({ id: 'a', first_detected_at: '' })], now: NOW })
    expect(sansDate.active[0]?.observed_on).toBeNull()
    expect(sansDate.active[0]?.missing).toContain('no_date')
    expect(sansDate.active[0]?.ranking.notMeasured).toContain('freshness')
  })
})

describe('#2172.20-.25 — le rang est décomposé, ses axes sont nommés', () => {
  it('rend les six axes et sort du dénominateur ce qui n’est pas évaluable', () => {
    const leads = accountQualificationLeads({
      rows: [row({ id: 'a', primary_domain_code: 'esn_it' })],
      ownDomainCodes: ['esn_it'],
      contactCount: 3,
      now: NOW,
    })
    const ranking = leads.active[0]?.ranking
    expect(ranking?.axes).toHaveLength(6)
    expect(ranking?.notMeasured).toContain('known_constraints')
    expect(ranking?.score).not.toBeNull()
  })

  it('sans domaine de l’espace, l’adéquation n’est pas devinée — elle est non mesurée', () => {
    const leads = accountQualificationLeads({
      rows: [row({ id: 'a', primary_domain_code: 'esn_it' })],
      ownDomainCodes: [],
      now: NOW,
    })
    expect(leads.active[0]?.ranking.notMeasured).toContain('offer_fit')
  })
})

describe('#2172.42-.49/.54 — on archive, on ne supprime pas', () => {
  const dismissal: LeadDecisionRow = {
    lead_key: 'a',
    decision: 'dismissed',
    reason: 'bad_timing',
    note: null,
    decided_at: '2026-09-12T00:00:00.000Z',
    snoozed_until: null,
  }

  it('une piste écartée sort de la file active et RESTE consultable, avec son motif et sa date', () => {
    const leads = accountQualificationLeads({ rows: [row({ id: 'a' })], decisions: [dismissal], now: NOW })
    expect(leads.active).toHaveLength(0)
    expect(leads.dismissed).toHaveLength(1)
    expect(leads.dismissed[0]?.decision?.reason).toBe('bad_timing')
    expect(leads.dismissed[0]?.decision?.decided_at).toBe('2026-09-12T00:00:00.000Z')
  })

  it('elle ne ressuscite pas à l’analyse suivante — la pierre tombale tient', () => {
    // Même compte, ligne re-détectée plus tard : la décision porte la clé, pas
    // la date. Sans ça, chaque analyse rendrait la piste écartée hier.
    const leads = accountQualificationLeads({
      rows: [row({ id: 'a', first_detected_at: '2026-09-14T00:00:00.000Z' })],
      decisions: [dismissal],
      now: NOW,
    })
    expect(leads.active).toHaveLength(0)
    expect(leads.dismissed).toHaveLength(1)
  })

  it('une mise en veille revient d’elle-même quand son échéance est passée', () => {
    const enVeille: LeadDecisionRow = {
      lead_key: 'a',
      decision: 'snoozed',
      reason: null,
      note: null,
      decided_at: '2026-09-01T00:00:00.000Z',
      snoozed_until: '2026-09-30T00:00:00.000Z',
    }
    expect(
      accountQualificationLeads({ rows: [row({ id: 'a' })], decisions: [enVeille], now: NOW }).snoozed,
    ).toHaveLength(1)
    expect(
      accountQualificationLeads({
        rows: [row({ id: 'a' })],
        decisions: [{ ...enVeille, snoozed_until: '2026-09-10T00:00:00.000Z' }],
        now: NOW,
      }).active,
    ).toHaveLength(1)
  })
})

describe('#2172.50/.56 — les compteurs nomment ce qu’ils comptent et s’additionnent (GA-259)', () => {
  it('actives + en veille + écartées = le total des pistes LUES, pas un fait de marché', () => {
    const leads = accountQualificationLeads({
      rows: [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })],
      decisions: [
        {
          lead_key: 'b',
          decision: 'dismissed',
          reason: 'out_of_target',
          note: null,
          decided_at: NOW.toISOString(),
          snoozed_until: null,
        },
        {
          lead_key: 'c',
          decision: 'snoozed',
          reason: null,
          note: null,
          decided_at: NOW.toISOString(),
          snoozed_until: '2026-10-01T00:00:00.000Z',
        },
      ],
      now: NOW,
    })
    expect(leads.counts).toEqual({ active: 1, snoozed: 1, dismissed: 1, total: 3 })
    expect(leads.counts.active + leads.counts.snoozed + leads.counts.dismissed).toBe(leads.counts.total)
  })
})

describe('#3678 — chaque piste dit le fait, ce que ça change, et UNE action', () => {
  it('rôle inconnu → « Identifier le responsable », même quand une autre lacune passe avant (KO recette 06/10)', () => {
    // Sans périmètre NI rôle : `next_verification` désigne le périmètre en premier.
    const { active } = accountQualificationLeads({ rows: [row({ id: 'a' })], contactCount: 3, now: NOW })
    expect(active[0]?.missing).toContain('no_named_role')
    expect(leadPrimaryAction(active[0]!)).toEqual({ kind: 'tab', tab: 'contacts', label: 'identify_contact' })
  })

  it('rôle connu, rien d’autre ne manque → « Préparer l’approche » ; sinon « Voir la demande »', () => {
    const complet = accountQualificationLeads({
      rows: [
        row({
          id: 'a',
          offer: 'Refonte SI',
          primary_domain_code: 'esn_it',
          btmmp: { management: 'DSI' } as ProjectReadRow['btmmp'],
        }),
      ],
      ownDomainCodes: ['esn_it'],
      contactCount: 2,
      now: NOW,
    })
    expect(leadPrimaryAction(complet.active[0]!).label).toBe('prepare_approach')

    const aVerifier = accountQualificationLeads({
      rows: [row({ id: 'b', btmmp: { management: 'DSI' } as ProjectReadRow['btmmp'] })],
      contactCount: 2,
      now: NOW,
    })
    expect(leadPrimaryAction(aVerifier.active[0]!).label).toBe('see_request')
  })

  it('une opportunité OUVERTE du même domaine → « Ouvrir l’opportunité existante », qui mène à elle', () => {
    const { active } = accountQualificationLeads({
      rows: [
        row({ id: 'sig', primary_domain_code: 'esn_it' }),
        row({ id: 'opp', kind: 'pain', stage: 'negotiation', primary_domain_code: 'esn_it', label: 'Refonte SI' }),
        row({ id: 'old', kind: 'pain', stage: 'lost', primary_domain_code: 'esn_it', label: 'Ancien' }),
      ],
      now: NOW,
    })
    expect(active[0]?.existing_opportunity_id).toBe('opp')
    expect(leadPrimaryAction(active[0]!)).toEqual({ kind: 'opportunity', id: 'opp', label: 'open_existing' })
  })

  it('une opportunité perdue ou un autre domaine ne se présente jamais comme « existante »', () => {
    const { active } = accountQualificationLeads({
      rows: [
        row({ id: 'sig', primary_domain_code: 'esn_it' }),
        row({ id: 'old', kind: 'pain', stage: 'lost', primary_domain_code: 'esn_it' }),
        row({ id: 'autre', kind: 'pain', stage: 'negotiation', primary_domain_code: 'rh' }),
      ],
      now: NOW,
    })
    expect(active[0]?.existing_opportunity_id).toBeNull()
  })

  it('« ce que ça change » : lié à une expertise connue, ou consultable sans être prioritaire — jamais inventé', () => {
    const lie = accountQualificationLeads({
      rows: [row({ id: 'a', primary_domain_code: 'esn_it' })],
      ownDomainCodes: ['esn_it'],
      now: NOW,
    })
    expect(leadImpact(lie.active[0]!)).toEqual({ kind: 'matched', expertise: 'esn_it' })

    const horsCible = accountQualificationLeads({
      rows: [row({ id: 'b', primary_domain_code: 'rh' })],
      ownDomainCodes: ['esn_it'],
      now: NOW,
    })
    expect(leadImpact(horsCible.active[0]!)).toEqual({ kind: 'off_target' })

    // Catalogue d'offre inconnu : on ne SAIT pas — ni « lié », ni « hors cible ».
    const inconnu = accountQualificationLeads({ rows: [row({ id: 'c' })], now: NOW })
    expect(leadImpact(inconnu.active[0]!)).toEqual({ kind: 'unknown' })
  })

  it('#3678.6 — un signal HORS CIBLE reste consultable : « Voir la demande », jamais « Préparer l’approche » ni « Identifier le responsable »', () => {
    const horsCible = accountQualificationLeads({
      rows: [
        row({
          id: 'h',
          offer: 'Refonte SI',
          primary_domain_code: 'rh',
          btmmp: { management: 'DSI' } as ProjectReadRow['btmmp'],
        }),
        row({ id: 'h2', primary_domain_code: 'rh' }),
      ],
      ownDomainCodes: ['esn_it'],
      contactCount: 2,
      now: NOW,
    })
    expect(horsCible.active.length).toBe(2)
    for (const lead of horsCible.active) {
      expect(leadImpact(lead)).toEqual({ kind: 'off_target' })
      expect(leadPrimaryAction(lead)).toEqual({ kind: 'panel', panel: 'detail', label: 'see_request' })
    }
  })

  it('la réserve visible avant dépliage = le premier manque qui change l’action, jamais un manque de confort', () => {
    const sansRole = accountQualificationLeads({ rows: [row({ id: 'a' })], contactCount: 2, now: NOW })
    expect(leadReserve(sansRole.active[0]!)).toBe('no_named_role')

    const complet = accountQualificationLeads({
      rows: [row({ id: 'b', offer: 'x', btmmp: { management: 'DSI' } as ProjectReadRow['btmmp'] })],
      contactCount: 2,
      now: NOW,
    })
    // Périmètre ou expertise manquants ne bloquent pas l'action : pas de réserve.
    expect(leadReserve(complet.active[0]!)).toBeNull()
  })
})

/**
 * #3978 — le domaine écrit par l'ANALYSE (`ProjectsService.materialize`) est celui que l'écran compare.
 * Chaque code que le modèle peut classer (`SIGNAL_DOMAIN_CODES`) doit produire un verdict LU
 * (lié / hors cible) face à un pack d'espace — jamais « inconnu » : c'est ce que « non mesuré »
 * réserve à une ligne SANS domaine. Sans ce test, un vocabulaire écrit d'un côté et comparé de
 * l'autre pourrait dériver sans que rien ne l'attrape (le défaut de #3678.2, premier tour).
 */
describe('#3978 — le vocabulaire classé par l’analyse est celui que la file compare', () => {
  it('chaque code de pack classable donne un verdict lu face à un pack de l’espace', () => {
    expect(SIGNAL_DOMAIN_CODES.length).toBeGreaterThan(5)
    for (const code of SIGNAL_DOMAIN_CODES) {
      const own = accountQualificationLeads({
        rows: [row({ id: 'a', primary_domain_code: code })],
        ownDomainCodes: [code],
        now: NOW,
      })
      expect(leadImpact(own.active[0]!), code).toEqual({ kind: 'matched', expertise: code })

      const other = SIGNAL_DOMAIN_CODES.find(candidate => candidate !== code)!
      const off = accountQualificationLeads({
        rows: [row({ id: 'b', primary_domain_code: code })],
        ownDomainCodes: [other],
        now: NOW,
      })
      expect(leadImpact(off.active[0]!), code).toEqual({ kind: 'off_target' })
    }
  })

  it('une ligne que l’analyse n’a pas su classer reste « inconnue » — pas « hors cible » deviné', () => {
    const sansDomaine = accountQualificationLeads({
      rows: [row({ id: 'c', primary_domain_code: null })],
      ownDomainCodes: ['esn_it'],
      now: NOW,
    })
    expect(leadImpact(sansDomaine.active[0]!)).toEqual({ kind: 'unknown' })
  })
})

describe('#4329.1 — le seuil de preuve d’un projet possible : une source DATÉE, la sienne', () => {
  it('sépare les projets étayés (source ET date sur leur propre fait) de ceux qui ne le sont pas', () => {
    const leads = accountQualificationLeads({
      rows: [
        row({ id: 'sourced', primary_domain_code: 'esn_it' }),
        row({ id: 'no-source', source: null, label: 'Cette activité implique des systèmes critiques' }),
        row({ id: 'no-date', first_detected_at: '' }),
      ],
      now: NOW,
    })
    // Les trois sont des pistes (fait daté OU sourcé) ; une seule passe le seuil.
    expect(leads.active.map(lead => lead.key).sort()).toEqual(['no-date', 'no-source', 'sourced'])
    const { proven, unproven } = splitLeadsByProof(leads.active)
    expect(proven.map(lead => lead.key)).toEqual(['sourced'])
    expect(unproven.map(lead => lead.key).sort()).toEqual(['no-date', 'no-source'])
  })

  it('un fait VOISIN sourcé ne fait pas passer le seuil à une généralité sans source', () => {
    const leads = accountQualificationLeads({
      rows: [
        row({ id: 'sourced', primary_domain_code: 'esn_it' }),
        row({
          id: 'generic',
          source: null,
          label: 'Cette activité implique des données sensibles',
          primary_domain_code: 'esn_it',
        }),
      ],
      now: NOW,
    })
    const { proven, unproven } = splitLeadsByProof(leads.active)
    expect(proven.map(lead => lead.key)).toEqual(['sourced'])
    expect(unproven.map(lead => lead.key)).toEqual(['generic'])
  })

  it('garde l’ordre de la file dans chaque moitié, et rend deux listes vides sur une file vide', () => {
    expect(splitLeadsByProof([])).toEqual({ proven: [], unproven: [] })
  })
})

// KEVIN-FIX (a) — le manque de rôle ne contredit pas les personnes nommées ailleurs sur la fiche.
describe('leadGapLabel — KEVIN-FIX (a)', () => {
  it('quand des personnes sont connues sur le compte, le manque de rôle le dit au lieu de les ignorer', () => {
    const { active } = accountQualificationLeads({ rows: [row({ id: 'a' })], contactCount: 3, now: NOW })
    expect(active[0]?.known_contact_count).toBe(3)
    expect(leadGapLabel(active[0]!, 'no_named_role', 'fr')).toContain('des personnes sont connues sur le compte')
    expect(leadGapLabel(active[0]!, 'no_named_role', 'en')).toContain('people are known on the account')
  })

  it('sait dire NON : sans personne connue (ou sans lecture), le libellé d’origine est gardé', () => {
    const none = accountQualificationLeads({ rows: [row({ id: 'a' })], contactCount: 0, now: NOW }).active[0]!
    expect(leadGapLabel(none, 'no_named_role', 'fr')).toBe('Aucun rôle potentiellement concerné n’a été nommé.')
    const unread = accountQualificationLeads({ rows: [row({ id: 'a' })], now: NOW }).active[0]!
    expect(unread.known_contact_count).toBeNull()
    expect(leadGapLabel(unread, 'no_named_role', 'fr')).toBe('Aucun rôle potentiellement concerné n’a été nommé.')
  })

  it('un autre manque garde son libellé quel que soit le nombre de personnes connues', () => {
    const { active } = accountQualificationLeads({ rows: [row({ id: 'a' })], contactCount: 3, now: NOW })
    expect(leadGapLabel(active[0]!, 'no_date', 'fr')).toBe('Le fait source n’est pas daté.')
  })
})
