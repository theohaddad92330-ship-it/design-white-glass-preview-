import type { ExclusionReason, MatchCandidate, MatchNeed } from '@bellum/contracts'
import { evaluateCandidate } from '../consultants/matching/engine'
import { nextBestMoveOptions } from '../consultants/matching/next-best-move'
import { DEMO_NO_MATCH_NEXT_BEST_MOVE_COVERAGE } from './demo-coverage'
import {
  DEMO_CONSULTANTS,
  DEMO_DELIVERY_CARRIER_ACCOUNT,
  DEMO_DELIVERY_CLIENT,
  DEMO_DOSSIERS,
  DEMO_NO_DEFENDABLE_PROFILE_NEED,
} from './demo-dataset'

/**
 * « UN BESOIN SANS PROFIL DÉFENDABLE » — CE QUE LA SALLE EN MONTRE (#2178).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `MatchDrawer.tsx` rend `NoMatchCausesBanner` et `NextBestMoveActions` quand un
 * classement rend `recommended` ET `borderline` VIDES tous les deux. Le docblock
 * de {@link DEMO_NO_DEFENDABLE_PROFILE_NEED} (`demo-dataset.ts`) calcule À LA
 * MAIN pourquoi c'est garanti ; CETTE garde le PROUVE en faisant tourner le
 * moteur RÉEL (`evaluateCandidate`, `nextBestMoveOptions` — jamais recopiés)
 * contre les sept profils du vivier, exactement comme
 * `demo-reverse-prospects-coverage.spec.ts` le fait pour sa propre capacité.
 *
 * ⚠️ ELLE UTILISE LE MEILLEUR CAS DE CHAQUE PROFIL, PAS UNE RECONSTITUTION DE
 * SA DISPONIBILITÉ DÉRIVÉE.
 * `derivedAvailability: 'unknown'` est posé pour LES SEPT profils, même ceux
 * qui portent une mission active ailleurs dans le jeu de données (Yanis
 * Berthier, Salomé Dufour, Antoine Rivière, Inès Kaczmarek) : `axisAvailability`
 * (`axes.ts`) retombe alors sur la disponibilité DÉCLARÉE de la fiche — le cas
 * le plus favorable possible, puisqu'une affectation RÉELLE ne peut que
 * dégrader ce score (occupé, ou libre plus tard que déclaré), jamais l'améliorer.
 * Si le zéro tient dans ce meilleur cas, il tient a fortiori dans le vivier réel
 * de la salle, où ces quatre profils sont partiellement occupés. Même logique
 * pour `consentState: 'valid'` et `onMissionAtClient: false` : le plafond
 * favorable de chaque axe, jamais une valeur qui l'abaisserait.
 *
 * ⚠️ ELLE NE FUIT PAS LE FAUX AMI DE SECTEUR. Le besoin est rattaché à SNCF
 * LOGISTIQUE (« Transport et logistique »), et QUATRE des sept profils
 * déclarent « Transport » parmi leurs secteurs : `axisSector` les crédite à
 * 100/100 via `mentions()`. Cette garde le VÉRIFIE explicitement (au lieu de
 * s'en cacher) et prouve que le zéro tient MALGRÉ ce point, pas parce qu'il
 * aurait été évité.
 */

const NOW = new Date('2026-09-25T09:00:00Z')

/** `remote_preference` de la fiche vivier → vocabulaire du moteur de matching
 *  (même traduction que `readRemote` dans `matching.service.ts`). */
function candidateRemote(preference: string | undefined): 'on_site' | 'hybrid' | 'remote' | null {
  if (preference === 'sur_site') return 'on_site'
  if (preference === 'hybride') return 'hybrid'
  if (preference === 'full_remote') return 'remote'
  return null
}

/**
 * Un `MatchCandidate` au MEILLEUR cas d'un profil du vivier de démonstration.
 *
 * `derivedAvailability: 'unknown'` et `consentState: 'valid'` : voir le
 * docblock ci-dessus — c'est le plafond favorable de chaque profil, jamais une
 * reconstitution de ses affectations réelles.
 */
function bestCaseCandidate(consultant: (typeof DEMO_CONSULTANTS)[number]): MatchCandidate {
  return {
    consultantId: consultant.full_name,
    skills: consultant.stack.map(term => ({
      term,
      label: term,
      level: 'expert',
      source: 'mission' as const,
      proof: null,
    })),
    yearsExperience: consultant.years_experience,
    seniorityBand: consultant.seniority,
    sectors: consultant.sectors,
    environment: consultant.references,
    languages: consultant.languages,
    clearances: consultant.clearances,
    zones: consultant.zones,
    remote: candidateRemote(consultant.remote_preference),
    contractKind: consultant.contract_type,
    dailyRateCents: Math.round(consultant.tjm * 100),
    // Au mieux disponible dès aujourd'hui — voir le docblock.
    freeFrom: NOW.toISOString().slice(0, 10),
    derivedAvailability: 'unknown',
    declaredAvailability: consultant.availability,
    availabilityCheckedAt: NOW.toISOString(),
    consentState: 'valid',
    clientHistoryFlag: null,
    clientHistoryReason: null,
    clientHistoryRecoverable: false,
    clientHistoryAt: null,
    onMissionAtClient: false,
    activeSubmissionsElsewhere: 0,
    preferenceWarnings: [],
  }
}

/**
 * Le `MatchNeed` que `MatchingService.loadNeed` produirait pour
 * {@link DEMO_NO_DEFENDABLE_PROFILE_NEED}, rattaché à SNCF
 * ({@link DEMO_DELIVERY_CLIENT}, le client FICTIF de la salle).
 *
 * ⚠️ `remote: null` — TOUJOURS, quelle que soit la colonne `remote` du besoin :
 * `loadNeed` ne la lit jamais (voir le docblock de la constante). Un test qui
 * écrirait `remote: 'sur_site'` ici prouverait un calcul que le serveur ne fait
 * pas.
 */
function needUnderTest(): MatchNeed {
  const need = DEMO_NO_DEFENDABLE_PROFILE_NEED
  return {
    needId: null,
    role: need.title,
    accountName: DEMO_DELIVERY_CLIENT.account.company_name,
    accountId: null,
    accountSector: DEMO_DELIVERY_CARRIER_ACCOUNT.sector,
    projectSectors: [],
    skills: need.skills.map(skill => ({ term: skill.term, label: skill.term, required: skill.required, level: null })),
    minYears: null,
    seniorityBand: null,
    environment: need.stack,
    languages: need.languages,
    clearances: [],
    location: need.location,
    remote: null,
    startOn: null,
    targetRateCents: need.target_tjm_cents,
    contractKind: need.contract_kind,
  }
}

describe('couverture du besoin sans profil défendable (#2178)', () => {
  it('lit un corpus NON VIDE — une garde qui ne lit rien passe au vert sur du vide', () => {
    expect(DEMO_CONSULTANTS.length).toBeGreaterThanOrEqual(5)
    expect(DEMO_NO_DEFENDABLE_PROFILE_NEED.skills.length).toBeGreaterThan(0)
  })

  it('le besoin pend du client de livraison — un VRAI dossier de la salle (décision Louis 04/10/2026)', () => {
    // Le besoin est un objet de l'ESN de démonstration, rattaché au compte
    // porteur de la livraison ; plus aucun client fictif n'existe dans la salle.
    const realCompanies = new Set(DEMO_DOSSIERS.map(dossier => dossier.account.company_name))
    expect(realCompanies.has(DEMO_DELIVERY_CLIENT.account.company_name)).toBe(true)
  })

  it('AU MOINS un secteur du vivier partage un mot avec le secteur du compte — le faux ami est réel, pas supposé', () => {
    const need = needUnderTest()
    const poolWords = new Set(
      DEMO_CONSULTANTS.flatMap(consultant => consultant.sectors)
        .join(' ')
        .toLowerCase()
        .split(/[^a-zàâäéèêëïîôöùûüç]+/)
        .filter(word => word.length >= 3),
    )
    const needWords = (need.accountSector ?? '').toLowerCase().split(/[^a-zàâäéèêëïîôöùûüç]+/)
    const overlap = needWords.filter(word => poolWords.has(word))
    // SNCF (« Transport ferroviaire interurbain… ») partage « transport » avec le vivier.
    expect(overlap).toContain('transport')
  })

  it('AUCUN des sept profils n’atterrit « recommandé » ni « limites », même au meilleur cas', () => {
    const need = needUnderTest()
    const results = DEMO_CONSULTANTS.map(consultant =>
      evaluateCandidate(need, bestCaseCandidate(consultant), { now: NOW }),
    )

    const offenders = results.filter(result => result.bucket === 'recommended' || result.bucket === 'borderline')
    expect(offenders).toEqual([])

    // Chaque profil évaluable (pas « non évaluable ») porte bien le motif
    // bloquant qui garantit le zéro — la preuve que le zéro tient pour la
    // BONNE raison, pas par accident d'un autre axe.
    for (const result of results) {
      if (result.bucket === 'not_evaluable') continue
      expect(result.bucket).toBe('excluded')
      expect(result.exclusions.map(exclusion => exclusion.reason)).toContain('missing_required_skill')
      expect(result.correspondenceScore).toBeLessThan(60)
    }
  })

  it('au moins un profil est réellement ÉVALUÉ (pas seulement « non évaluable ») — le zéro tient sur un vrai calcul', () => {
    const need = needUnderTest()
    const results = DEMO_CONSULTANTS.map(consultant =>
      evaluateCandidate(need, bestCaseCandidate(consultant), { now: NOW }),
    )
    expect(results.some(result => result.bucket === 'excluded')).toBe(true)
  })

  it('`nextBestMoveOptions` rend un tableau JAMAIS vide sur ce zéro réel', () => {
    const need = needUnderTest()
    const results = DEMO_CONSULTANTS.map(consultant =>
      evaluateCandidate(need, bestCaseCandidate(consultant), { now: NOW }),
    )
    const recommended = results.filter(result => result.bucket === 'recommended')
    const borderline = results.filter(result => result.bucket === 'borderline')
    const notEvaluable = results.filter(result => result.bucket === 'not_evaluable')
    const counts = new Map<ExclusionReason, number>()
    for (const result of results) {
      for (const exclusion of result.exclusions) {
        counts.set(exclusion.reason, (counts.get(exclusion.reason) ?? 0) + 1)
      }
    }

    const options = nextBestMoveOptions({
      recommended,
      borderline,
      exclusionCounts: [...counts.entries()].map(([reason, count]) => ({ reason, count })),
      notEvaluable,
    })

    expect(options).not.toBeNull()
    expect(options!.length).toBeGreaterThan(0)
  })

  it('la capacité est classée dans le registre de couverture, avec une raison qui tient', () => {
    expect(DEMO_NO_MATCH_NEXT_BEST_MOVE_COVERAGE.state).toBe('seede')
    expect(DEMO_NO_MATCH_NEXT_BEST_MOVE_COVERAGE.reason.length).toBeGreaterThan(60)
    expect(DEMO_NO_MATCH_NEXT_BEST_MOVE_COVERAGE.reason).toContain('2178')
  })
})
