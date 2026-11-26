import { EXCLUSION_REASONS, EXCLUSION_SEVERITY, type ExclusionReason } from '@bellum/contracts'
import type { MatchCandidate, MatchNeed } from '@bellum/contracts'
import { evaluateCandidate } from './engine'
import { prefilter, PREFILTER_ABOVE } from './prefilter'

/**
 * Les ONZE motifs d'exclusion, un par un — et ce qui arrive quand on ne peut
 * PAS trancher.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La liste est FERMÉE et la source la qualifie de conformité, pas de confort :
 * « Aucun profil n'est écarté sans code de motif. C'est une exigence de
 * conformité, pas une préférence UX. » (PDF 4 §4.1). Deux des onze sont des
 * OBLIGATIONS et non du confort — `consent_expired` (on ne propose pas un profil
 * dont le consentement a expiré) et `previously_rejected_by_client` (on ne
 * represente pas quelqu'un que le client a déjà refusé).
 *
 * `match.test.ts` vérifiait déjà que la liste fait onze et que chacun porte une
 * nature. Ce qu'il ne pouvait pas vérifier, c'est que chaque motif est
 * réellement POSÉ par quelqu'un : un code déclaré au contrat et jamais posé sur
 * un résultat est le défaut n°1 de ce dépôt — du code juste, testé, que personne
 * n'appelle. Cinq des onze n'avaient aucun test qui les produise
 * (`unavailable_at_start`, `out_of_zone`, `already_on_mission_at_client`,
 * `contract_mismatch`, `rate_out_of_range`) : ils étaient VRAIS par lecture, pas
 * par mesure.
 *
 * Le dernier bloc est celui qui compte le plus : un motif ne se pose PAS quand
 * la donnée qui permettrait de trancher n'existe pas. Un axe non évaluable sort
 * du dénominateur ; il ne devient ni un « oui » silencieux, ni un « non ».
 */

const NOW = new Date('2026-09-01T09:00:00Z')

const NEED: MatchNeed = {
  needId: '11111111-1111-4111-8111-111111111111',
  role: 'Data Engineer',
  accountName: 'EDF DSI',
  accountSector: 'énergie',
  projectSectors: [],
  skills: [
    { term: 'spark', label: 'Spark', required: true, level: 'confirmé' },
    { term: 'python', label: 'Python', required: true, level: null },
  ],
  minYears: 5,
  seniorityBand: 'senior',
  environment: ['airflow'],
  languages: [],
  clearances: [],
  location: 'Paris',
  remote: null,
  startOn: '2026-09-15',
  targetRateCents: 62000,
  contractKind: 'regie',
}

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    consultantId: '22222222-2222-4222-8222-222222222222',
    skills: [
      { term: 'spark', label: 'Spark', level: 'expert', source: 'mission', proof: 'mission Orange, 18 mois' },
      { term: 'python', label: 'Python', level: 'confirme', source: 'mission', proof: 'mission Orange' },
    ],
    yearsExperience: 7,
    seniorityBand: 'senior',
    sectors: ['énergie'],
    environment: ['airflow'],
    languages: [],
    clearances: [],
    zones: ['Paris'],
    remote: 'on_site',
    contractKind: 'freelance',
    dailyRateCents: 60000,
    freeFrom: '2026-09-01',
    derivedAvailability: 'available',
    declaredAvailability: 'immediate',
    availabilityCheckedAt: '2026-08-25T09:00:00Z',
    consentState: 'valid',
    clientHistoryFlag: null,
    clientHistoryReason: null,
    clientHistoryAt: null,
    clientHistoryRecoverable: false,
    onMissionAtClient: false,
    activeSubmissionsElsewhere: 0,
    preferenceWarnings: [],
    ...overrides,
  }
}

function reasonsFor(need: MatchNeed, who: MatchCandidate): ExclusionReason[] {
  return evaluateCandidate(need, who, { now: NOW }).exclusions.map(exclusion => exclusion.reason)
}

/**
 * Un cas par motif — la situation MINIMALE qui doit le produire.
 *
 * Le tableau sert deux fois : une fois pour dire que chaque motif est posé, une
 * seconde pour prouver qu'aucun motif de la liste fermée n'est resté sans
 * producteur. Le second usage est le seul qui attrape un douzième code ajouté au
 * contrat sans le code qui le pose.
 */
const CASES: { reason: ExclusionReason; why: string; need: MatchNeed; who: MatchCandidate }[] = [
  {
    reason: 'no_skills_recorded',
    why: 'aucune compétence saisie — on ne sait rien, ce n’est pas « il ne convient pas »',
    need: NEED,
    who: candidate({ skills: [] }),
  },
  {
    reason: 'consent_expired',
    why: 'RGPD — on ne propose pas un profil dont le consentement a expiré',
    need: NEED,
    who: candidate({ consentState: 'expired' }),
  },
  {
    reason: 'missing_required_skill',
    why: 'une compétence marquée obligatoire n’est ni prouvée ni déclarée',
    need: NEED,
    who: candidate({
      skills: [{ term: 'cobol', label: 'COBOL', level: 'expert', source: 'mission', proof: 'x' }],
    }),
  },
  {
    reason: 'unavailable_at_start',
    why: 'libre le 1er décembre pour un démarrage le 15 septembre',
    need: NEED,
    who: candidate({ freeFrom: '2026-12-01', derivedAvailability: 'busy' }),
  },
  {
    reason: 'out_of_zone',
    why: 'zones DÉCLARÉES hors du lieu demandé, sans distanciel accepté',
    need: NEED,
    who: candidate({ zones: ['Lyon'], remote: 'on_site' }),
  },
  {
    reason: 'language_mismatch',
    why: 'deux crans d’écart empêchent de travailler ; un cran se dit seulement',
    need: { ...NEED, languages: [{ code: 'en', level: 'c1' }] },
    who: candidate({ languages: [{ code: 'en', level: 'a1' }] }),
  },
  {
    reason: 'clearance_missing',
    why: 'une habilitation exigée que le profil ne détient pas',
    need: { ...NEED, clearances: ['secret défense'] },
    who: candidate({ clearances: [] }),
  },
  {
    reason: 'contract_mismatch',
    why: 'un besoin de recrutement ne se sert pas d’un indépendant',
    need: { ...NEED, contractKind: 'recrutement' },
    who: candidate({ contractKind: 'freelance' }),
  },
  {
    reason: 'rate_out_of_range',
    why: 'un TJM à +45 % de la cible sort de la fourchette',
    need: NEED,
    who: candidate({ dailyRateCents: 90000 }),
  },
  {
    reason: 'previously_rejected_by_client',
    why: 'on ne represente pas quelqu’un que le client a déjà refusé',
    need: NEED,
    who: candidate({ clientHistoryFlag: 'rejected', clientHistoryReason: 'trop cher' }),
  },
  {
    reason: 'already_on_mission_at_client',
    why: 'le débauchage interne chez son propre client',
    need: NEED,
    who: candidate({ onMissionAtClient: true }),
  },
]

describe('les onze motifs d’exclusion sont réellement POSÉS', () => {
  it('lit vraiment quelque chose — onze motifs au contrat, onze cas au banc', () => {
    // Une garde qui parcourt une liste vide passe au vert sans rien vérifier.
    expect(EXCLUSION_REASONS.length).toBe(11)
    expect(CASES.length).toBe(EXCLUSION_REASONS.length)
    expect(reasonsFor(NEED, candidate())).toEqual([])
  })

  for (const scenario of CASES) {
    it(`pose « ${scenario.reason} » — ${scenario.why}`, () => {
      const result = evaluateCandidate(scenario.need, scenario.who, { now: NOW })
      const exclusion = result.exclusions.find(item => item.reason === scenario.reason)
      expect(exclusion).toBeDefined()
      // La NATURE vient du contrat et n'est jamais recopiée : `blocking` écarte,
      // `warning` laisse le recruteur trancher, `not_evaluable` ne dit pas non.
      expect(exclusion?.severity).toBe(EXCLUSION_SEVERITY[scenario.reason])
      // « Un motif sans explication n'explique rien » : le recruteur doit pouvoir
      // corriger la donnée, et le candidat apprendre pourquoi.
      expect((exclusion?.detail ?? '').trim().length).toBeGreaterThan(0)
    })
  }

  it('aucun motif de la liste FERMÉE n’est resté sans producteur', () => {
    // Le sens qui attrape le défaut n°1 du dépôt : un code déclaré au contrat que
    // personne ne pose. Un douzième motif ajouté sans son calcul échoue ICI.
    const produced = new Set<string>()
    for (const scenario of CASES) for (const reason of reasonsFor(scenario.need, scenario.who)) produced.add(reason)
    expect([...EXCLUSION_REASONS].filter(reason => !produced.has(reason))).toEqual([])
  })

  it('le pré-filtrage pose lui aussi un code — jamais un écart silencieux', () => {
    // Le seul autre chemin qui écarte quelqu'un. Il coupe AVANT les treize axes,
    // pour une raison de performance : la performance ne justifie pas de perdre
    // le motif.
    const vivier = Array.from({ length: PREFILTER_ABOVE + 3 }, (_, index) =>
      candidate({ consultantId: id(index + 1), consentState: 'expired' }),
    )
    const dropped = prefilter(NEED, vivier).dropped
    expect(dropped.length).toBe(vivier.length)
    for (const verdict of dropped) {
      expect(EXCLUSION_REASONS).toContain(verdict.reason)
      expect(verdict.detail.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('ce qui n’a pas pu être évalué est NOMMÉ, pas tranché', () => {
  it('le besoin ne dit pas OÙ : l’axe est non évaluable, aucun « out_of_zone »', () => {
    // Sans adresse de mission, « hors zone » n'est pas une conclusion — c'est une
    // question qu'on ne peut pas poser. L'axe sort du dénominateur ; le profil
    // n'est ni écarté, ni silencieusement gardé comme « dans la zone ».
    const result = evaluateCandidate({ ...NEED, location: null }, candidate({ zones: ['Lyon'] }), { now: NOW })
    expect(result.axes.find(axis => axis.axis === 'location')?.score).toBeNull()
    expect(result.exclusions.map(item => item.reason)).not.toContain('out_of_zone')
  })

  it('le besoin ne dit pas OÙ mais impose le site : toujours non évaluable', () => {
    // Le mode de présence ne remplace pas le lieu. La version précédente laissait
    // passer ce cas et rendait 0, donc un `out_of_zone` BLOQUANT dont la phrase
    // affichée était « zones déclarées hors «  » » — un motif de conformité posé
    // sur un guillemet vide.
    const need = { ...NEED, location: null, remote: 'on_site' as const }
    const result = evaluateCandidate(need, candidate({ zones: ['Lyon'], remote: 'on_site' }), { now: NOW })
    expect(result.axes.find(axis => axis.axis === 'location')?.score).toBeNull()
    expect(result.exclusions.map(item => item.reason)).not.toContain('out_of_zone')
  })

  it('le profil ne déclare AUCUNE zone : non évaluable, même s’il veut du sur-site', () => {
    // « Sur site » dit comment il veut travailler, jamais où il est. L'écarter
    // pour `out_of_zone` ferait mesurer au score la complétude de NOTRE fiche,
    // pas l'adéquation de la personne — et sur un motif que la source qualifie de
    // conformité.
    const result = evaluateCandidate(NEED, candidate({ zones: [], remote: 'on_site' }), { now: NOW })
    expect(result.axes.find(axis => axis.axis === 'location')?.score).toBeNull()
    expect(result.exclusions.map(item => item.reason)).not.toContain('out_of_zone')
    expect(result.bucket).not.toBe('excluded')
  })

  it('le besoin ne fixe ni TJM ni cadre : ni « rate_out_of_range » ni « contract_mismatch »', () => {
    const need = { ...NEED, targetRateCents: null, contractKind: null }
    const result = evaluateCandidate(need, candidate({ dailyRateCents: null }), { now: NOW })
    expect(result.axes.find(axis => axis.axis === 'rate')?.score).toBeNull()
    expect(result.axes.find(axis => axis.axis === 'contract_status')?.score).toBeNull()
    const reasons = result.exclusions.map(item => item.reason)
    expect(reasons).not.toContain('rate_out_of_range')
    expect(reasons).not.toContain('contract_mismatch')
  })

  it('le besoin ne demande aucune langue : aucun « language_mismatch »', () => {
    const result = evaluateCandidate(NEED, candidate({ languages: [] }), { now: NOW })
    expect(result.axes.find(axis => axis.axis === 'language')?.score).toBeNull()
    expect(result.exclusions.map(item => item.reason)).not.toContain('language_mismatch')
  })

  it('une disponibilité inconnue range en « non évaluables », jamais en « écartés »', () => {
    // « On ne confond jamais "je ne sais pas" avec "non". » C'est la règle que la
    // source appelle la plus importante du module.
    const result = evaluateCandidate(
      NEED,
      candidate({ derivedAvailability: 'unknown', declaredAvailability: 'inconnu', freeFrom: null }),
      { now: NOW },
    )
    expect(result.axes.find(axis => axis.axis === 'availability')?.score).toBeNull()
    expect(result.bucket).toBe('not_evaluable')
    expect(result.exclusions.map(item => item.reason)).not.toContain('unavailable_at_start')
  })
})

function id(n: number): string {
  return `3333333${n % 10}-3333-4333-8333-33333333333${n % 10}`.slice(0, 36)
}
