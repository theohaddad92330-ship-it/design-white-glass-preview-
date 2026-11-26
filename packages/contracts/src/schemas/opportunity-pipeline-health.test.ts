import { describe, expect, it } from 'vitest'
import {
  mostAdvancedNeedStatusSql,
  needsAwaitingFeedbackSql,
  NEEDS_AWAITING_FEEDBACK_STATUSES,
  opportunityStageDetail,
  pipelineHealth,
  PIPE_PRIORITY_AXES,
  PIPE_PRIORITY_DECISIONS,
  type PipelineHealthRow,
} from './opportunity-pipeline-health.js'

/**
 * #2324.40/43/44/46/47/48 — LE DIAGNOSTIC DE PIPE, SANS PROBABILITÉ.
 *
 * Le chantier CHAT-3 (compilateur d'opportunité) mesure le 18/09/2026 que le
 * pipe n'a AUCUN diagnostic dédié : `get_pipeline` (chat_tools.py) ne rend que
 * des SOMMES par étape, et rien ne répond à « qu'est-ce qui mérite du temps »,
 * « qu'est-ce qui devrait être clôturé », « quel besoin n'a aucun profil ».
 *
 * Ce module ÉTEND l'ontologie existante (`opportunityFreshness`, `LIVE_STAGES`)
 * au lieu d'en refaire une : aucune pondération, aucun score de conversion,
 * seulement des RAISONS NOMMÉES (`PipelineHealthReason`) — jamais une
 * probabilité de signature (doctrine « refusé six fois »).
 *
 * Le NO-GO de #2324.48 est vérifié en dernier : un signal de recrutement
 * (`kind: 'signal'`) sans porteur NI prochaine action ne doit JAMAIS apparaître
 * comme une opportunité active — il est exclu et le compte l'exclusion, jamais
 * silencieusement.
 */

function row(over: Partial<PipelineHealthRow> = {}): PipelineHealthRow {
  return {
    id: 'opp-1',
    stage: 'qualified',
    kind: 'pain',
    owner_id: 'user-1',
    has_next_action: true,
    stage_entered_at: '2026-09-15',
    needs_total: 0,
    needs_without_profile: 0,
    needs_awaiting_feedback: 0,
    ...over,
  }
}

const NOW = new Date('2026-09-22T10:00:00Z')

describe('pipelineHealth — #2324.41/45 : ne recalcule pas ce qui existe déjà', () => {
  it('une opportunité fraîche avec action et besoins couverts ne remonte nulle part', () => {
    const health = pipelineHealth([row()], NOW)
    expect(health.needsAttention).toHaveLength(0)
    expect(health.recommendedToClose).toHaveLength(0)
  })
})

describe('pipelineHealth — #2324.40 : qui mérite du temps, avec ses raisons NOMMÉES', () => {
  it('une opportunité SANS prochaine action porte la raison without_next_action', () => {
    const health = pipelineHealth([row({ has_next_action: false })], NOW)
    expect(health.needsAttention).toHaveLength(1)
    expect(health.needsAttention[0]?.reasons).toContain('without_next_action')
  })

  it('has_next_action non mesuré (undefined) ne déclenche PAS la raison — non mesuré ≠ mesuré à zéro (GA-18/19)', () => {
    const health = pipelineHealth([row({ has_next_action: undefined })], NOW)
    expect(health.needsAttention).toHaveLength(0)
  })

  it('une opportunité qui vieillit (31-180j) porte la raison ageing', () => {
    const health = pipelineHealth([row({ stage_entered_at: '2026-08-01' })], NOW)
    expect(health.needsAttention[0]?.reasons).toContain('ageing')
    expect(health.needsAttention[0]?.freshness).toBe('ageing')
  })

  it('une opportunité au-delà de 180j est stale, jamais ageing', () => {
    const health = pipelineHealth([row({ stage_entered_at: '2025-12-01' })], NOW)
    expect(health.needsAttention[0]?.reasons).toContain('stale')
  })

  it('un besoin sans profil (#2324.43) ajoute la raison need_without_profile', () => {
    const health = pipelineHealth([row({ needs_total: 1, needs_without_profile: 1 })], NOW)
    expect(health.needsAttention[0]?.reasons).toEqual(['need_without_profile'])
  })

  it('un profil soumis sans retour (#2324.44) ajoute profile_awaiting_feedback', () => {
    const health = pipelineHealth([row({ needs_total: 1, needs_awaiting_feedback: 1 })], NOW)
    expect(health.needsAttention[0]?.reasons).toEqual(['profile_awaiting_feedback'])
  })

  it('une opportunité CLOSE (won/lost/dormant) ne remonte jamais, même sans action', () => {
    const health = pipelineHealth([row({ stage: 'won', has_next_action: false })], NOW)
    expect(health.needsAttention).toHaveLength(0)
  })

  it("l'intake (detected/potential) est hors périmètre — ce n'est pas encore une opportunité travaillée", () => {
    const health = pipelineHealth([row({ stage: 'detected', has_next_action: false })], NOW)
    expect(health.needsAttention).toHaveLength(0)
  })

  it('aucun champ "score" ou "probability" ne figure sur un item — un score ne se glisse jamais nu (doctrine)', () => {
    const health = pipelineHealth([row({ has_next_action: false })], NOW)
    const item = health.needsAttention[0] as unknown as Record<string, unknown>
    expect(item).not.toHaveProperty('score')
    expect(item).not.toHaveProperty('probability')
  })
})

describe('pipelineHealth — #2324.46 : lesquelles DEVRAIENT être clôturées (une recommandation, jamais un geste automatique)', () => {
  it('stale + sans prochaine action est recommandée à la clôture', () => {
    const health = pipelineHealth([row({ stage_entered_at: '2025-01-01', has_next_action: false })], NOW)
    expect(health.recommendedToClose).toHaveLength(1)
    expect(health.recommendedToClose[0]?.id).toBe('opp-1')
  })

  it('stale MAIS avec une prochaine action vivante ne se recommande pas — une clôture ne se déduit pas du seul âge', () => {
    const health = pipelineHealth([row({ stage_entered_at: '2025-01-01', has_next_action: true })], NOW)
    expect(health.recommendedToClose).toHaveLength(0)
  })

  it('recommendedToClose est un SOUS-ENSEMBLE de needsAttention, jamais une liste à part', () => {
    const health = pipelineHealth([row({ stage_entered_at: '2025-01-01', has_next_action: false })], NOW)
    const ids = health.needsAttention.map(item => item.id)
    expect(ids).toContain(health.recommendedToClose[0]?.id)
  })
})

describe('pipelineHealth — #2324.48 : NO-GO, un signal sans porteur ni action reste un signal', () => {
  it('un signal SANS owner ni prochaine action est exclu, jamais listé comme opportunité active', () => {
    const health = pipelineHealth(
      [row({ kind: 'signal', owner_id: null, has_next_action: false, stage_entered_at: '2025-01-01' })],
      NOW,
    )
    expect(health.needsAttention).toHaveLength(0)
    expect(health.recommendedToClose).toHaveLength(0)
  })

  it("l'exclusion se COMPTE, elle ne disparaît pas en silence", () => {
    const health = pipelineHealth(
      [row({ kind: 'signal', owner_id: null, has_next_action: false, stage_entered_at: '2025-01-01' })],
      NOW,
    )
    expect(health.excludedUnapprovedSignals).toBe(1)
  })

  it('un signal QUI A un owner ET une prochaine action franchit le no-go — il a été adopté par un humain', () => {
    const health = pipelineHealth(
      [row({ kind: 'signal', owner_id: 'user-1', has_next_action: false, stage_entered_at: '2025-01-01' })],
      NOW,
    )
    // owner seul ne suffit pas : il faut les DEUX (owner ET next action) pour
    // sortir de l'exclusion — sinon la porte s'ouvrirait à un signal juste
    // affecté, jamais réellement pris en main.
    expect(health.excludedUnapprovedSignals).toBe(1)
  })

  it('un signal avec owner ET prochaine action est traité comme une opportunité normale', () => {
    const health = pipelineHealth(
      [row({ kind: 'signal', owner_id: 'user-1', has_next_action: false, stage_entered_at: '2025-01-01' })],
      NOW,
    )
    const adopted = pipelineHealth(
      [row({ kind: 'signal', owner_id: 'user-1', has_next_action: true, stage_entered_at: '2025-01-01' })],
      NOW,
    )
    expect(health.excludedUnapprovedSignals).toBe(1)
    expect(adopted.excludedUnapprovedSignals).toBe(0)
    expect(adopted.needsAttention).toHaveLength(1)
  })
})

describe('opportunityStageDetail — #2324.20/21/23 : un AFFINAGE, jamais une sixième étape', () => {
  it("hors de confirmed/profiles_submitted, aucun affinage n'a de sens", () => {
    expect(opportunityStageDetail('qualified', 'matching')).toBeNull()
    expect(opportunityStageDetail('negotiation', 'client_review')).toBeNull()
  })

  it('#2324.20 — un besoin encore à qualifier ou en cours de recherche se lit « profils recherchés »', () => {
    for (const status of ['to_qualify', 'qualified', 'to_match', 'matching']) {
      expect(opportunityStageDetail('confirmed', status)).toBe('profiles_wanted')
      expect(opportunityStageDetail('profiles_submitted', status)).toBe('profiles_wanted')
    }
  })

  it('#2324.21 — une shortlist prête se lit « profils préparés »', () => {
    expect(opportunityStageDetail('confirmed', 'shortlist_ready')).toBe('profiles_prepared')
  })

  it('#2324.23 — un besoin en revue côté client se lit « entretien »', () => {
    expect(opportunityStageDetail('profiles_submitted', 'client_review')).toBe('interview')
  })

  /**
   * #2942 — `client_review` n'est plus le seul statut de besoin qui lit
   * « entretien » : le statut STOCKÉ `interview` (#2152.9) est plus précis que
   * `client_review`, mais dit toujours la même chose du point de vue de
   * l'opportunité — le client a le profil, il l'évalue. Sans cette ligne, un
   * besoin avancé jusqu'à « entretien » perdrait l'affinage qu'il avait déjà
   * sous `client_review`, ce qui se lirait comme une régression.
   */
  it('#2942 — le statut de besoin `interview` se lit aussi « entretien »', () => {
    expect(opportunityStageDetail('profiles_submitted', 'interview')).toBe('interview')
    expect(opportunityStageDetail('confirmed', 'interview')).toBe('interview')
  })

  it("aucun besoin rattaché (statut absent) : pas d'affinage deviné", () => {
    expect(opportunityStageDetail('confirmed', null)).toBeNull()
    expect(opportunityStageDetail('confirmed', undefined)).toBeNull()
  })

  it('un statut de besoin hors vocabulaire connu ne produit rien plutôt que de deviner', () => {
    expect(opportunityStageDetail('confirmed', 'won')).toBeNull()
  })
})

describe('pipelineHealth — stageDetail voyage sur chaque item (#2324.20/21/23)', () => {
  it("porte l'affinage dérivé du statut de besoin le plus avancé, sans le recalculer autrement", () => {
    const health = pipelineHealth(
      [row({ stage: 'confirmed', has_next_action: false, most_advanced_need_status: 'matching' })],
      NOW,
    )
    expect(health.needsAttention[0]?.stageDetail).toBe('profiles_wanted')
  })

  it('reste null sur une étape qui ne le porte pas — jamais une valeur devinée', () => {
    const health = pipelineHealth([row({ has_next_action: false })], NOW)
    expect(health.needsAttention[0]?.stageDetail).toBeNull()
  })
})

/**
 * GA-62 — le prédicat SQL « profil sans retour » (#2324.44) vit ici, jamais
 * recopié à la main dans `project-pipeline.service.ts`. Il ne redéfinit PAS
 * « besoin ouvert » (`needStillOpenSql`) : c'est un sous-ensemble métier plus
 * étroit — les deux statuts qu'un besoin traverse une fois un profil déjà
 * soumis au client.
 */
describe('needsAwaitingFeedbackSql — #2324.44 : le sous-ensemble « profil déjà soumis »', () => {
  it('nomme exactement submitted et client_review, rien de plus', () => {
    expect(NEEDS_AWAITING_FEEDBACK_STATUSES).toEqual(['submitted', 'client_review'])
  })

  it('produit un IN (...) sur la colonne donnée', () => {
    expect(needsAwaitingFeedbackSql('n.status')).toBe(`n.status IN ('submitted', 'client_review')`)
  })

  it('refuse une expression de colonne invalide — même garde que needStillOpenSql', () => {
    expect(() => needsAwaitingFeedbackSql("n.status'; DROP TABLE x --")).toThrow()
  })
})

/**
 * #2170.3 (tranché sans Louis) — `mostAdvancedNeedStatusSql` À UN SEUL
 * ENDROIT (GA-26). `project-pipeline.service.ts` en portait une copie à la
 * main ; `projects.service.ts` en a désormais besoin pour afficher
 * `opportunityStageDetail` sur CHAQUE carte du Kanban (#2949), pas seulement
 * dans le diagnostic agrégé.
 */
describe('mostAdvancedNeedStatusSql — #2170.3 : la même sous-requête, écrite une fois', () => {
  it('nomme les sept statuts, dans l’ordre que `opportunityStageDetail` attend', () => {
    const sql = mostAdvancedNeedStatusSql('o.id')
    expect(sql).toContain('n.project_id = o.id')
    expect(sql).toContain('n.archived_at IS NULL')
    for (const status of [
      'to_qualify',
      'qualified',
      'to_match',
      'matching',
      'shortlist_ready',
      'submitted',
      'client_review',
    ]) {
      expect(sql).toContain(`'${status}'`)
    }
  })

  it('refuse une expression de colonne invalide — même garde que needsAwaitingFeedbackSql', () => {
    expect(() => mostAdvancedNeedStatusSql("o.id'; DROP TABLE x --")).toThrow()
  })
})

/**
 * #2325 — LA PRIORISATION DU PIPE : « QUELLES AFFAIRES MÉRITENT MON TEMPS ».
 *
 * `priorityDeals`/`dealsToWatch` ÉTENDENT `pipelineHealth` (#2324) : mêmes
 * candidats que `needsAttention`, jamais une deuxième lecture du pipe.
 */
describe('pipelineHealth — #2325.15/.16 : au plus cinq prioritaires, au plus trois à fermer/veille', () => {
  it('borne priorityDeals à cinq même avec sept candidats', () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      row({ id: `opp-${i}`, has_next_action: false, stage_entered_at: '2025-01-01' }),
    )
    const health = pipelineHealth(rows, NOW)
    expect(health.needsAttention).toHaveLength(7)
    expect(health.priorityDeals).toHaveLength(5)
  })

  it('borne dealsToWatch à trois même avec cinq stale-sans-action', () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      row({ id: `opp-${i}`, has_next_action: false, stage_entered_at: '2025-01-01' }),
    )
    const health = pipelineHealth(rows, NOW)
    expect(health.recommendedToClose).toHaveLength(5)
    expect(health.dealsToWatch).toHaveLength(3)
  })

  it('dealsToWatch reste un sous-ensemble de priorityDeals-candidats — mêmes raisons stale+sans action', () => {
    const health = pipelineHealth([row({ id: 'opp-1', has_next_action: false, stage_entered_at: '2025-01-01' })], NOW)
    expect(health.dealsToWatch[0]?.id).toBe('opp-1')
  })
})

describe('pipelineHealth — #2325.2/.3/.4 : jamais le seul montant, la seule date, ou le seul stage', () => {
  it('deux affaires du MÊME stage, avec des raisons différentes, ne sont pas classées à égalité', () => {
    const health = pipelineHealth(
      [
        row({ id: 'opp-plain', stage: 'qualified', has_next_action: false }),
        row({
          id: 'opp-loaded',
          stage: 'qualified',
          has_next_action: false,
          needs_total: 1,
          needs_without_profile: 1,
        }),
      ],
      NOW,
    )
    // Le stage est IDENTIQUE sur les deux — s'il pesait dans le score, les
    // deux premières places seraient interchangeables. `opp-loaded` porte une
    // raison de plus (need_without_profile) : il passe devant.
    expect(health.priorityDeals[0]?.id).toBe('opp-loaded')
  })

  it("deux affaires 'stale' avec un écart de date énorme (200j vs 400j) restent à égalité de score — la date BRUTE n'entre jamais dans le calcul, seul le palier de fraîcheur compte", () => {
    const health = pipelineHealth(
      [
        row({ id: 'opp-b', stage_entered_at: '2025-08-01', has_next_action: false }), // ~400+ j : stale
        row({ id: 'opp-a', stage_entered_at: '2026-01-01', has_next_action: false }), // ~260 j : stale
      ],
      NOW,
    )
    // Même score (stale + 1 raison des deux côtés) : le tie-break déterministe
    // (id croissant) décide, jamais la date brute.
    expect(health.priorityDeals.map(d => d.id)).toEqual(['opp-a', 'opp-b'])
  })

  it('PipelineHealthItem ne porte ni montant ni date de création — rien à lire pour un score qui les lirait', () => {
    const health = pipelineHealth([row({ has_next_action: false })], NOW)
    const item = health.needsAttention[0] as unknown as Record<string, unknown>
    expect(item).not.toHaveProperty('amount')
    expect(item).not.toHaveProperty('amountCents')
    expect(item).not.toHaveProperty('createdAt')
  })
})

describe('pipelineHealth — #2325.6-.10/.12/.14 : les axes, nommés qu’ils soient mesurés ou pas', () => {
  it('rend TOUS les axes déclarés sur chaque affaire prioritaire, jamais un sous-ensemble', () => {
    const health = pipelineHealth([row({ has_next_action: false })], NOW)
    const axes = health.priorityDeals[0]?.axes
    expect(axes && Object.keys(axes).sort()).toEqual([...PIPE_PRIORITY_AXES].sort())
  })

  it('réalité du besoin / accès / capacité à répondre / économie : NON mesurés — jamais devinés', () => {
    const health = pipelineHealth([row({ has_next_action: false })], NOW)
    const axes = health.priorityDeals[0]?.axes
    expect(axes?.needReality).toEqual({ measured: false })
    expect(axes?.access).toEqual({ measured: false })
    expect(axes?.capacityToRespond).toEqual({ measured: false })
    expect(axes?.economics).toEqual({ measured: false })
  })

  it('timing est mesuré depuis la fraîcheur déjà calculée (#2324.41), jamais recalculé', () => {
    const health = pipelineHealth([row({ has_next_action: false, stage_entered_at: '2025-01-01' })], NOW)
    expect(health.priorityDeals[0]?.axes.timing).toEqual({ measured: true, label: 'stale' })
  })

  it("décision attendue est mesurée quand l'affinage de stage existe, absente sinon — jamais devinée", () => {
    const withDetail = pipelineHealth(
      [row({ stage: 'confirmed', has_next_action: false, most_advanced_need_status: 'shortlist_ready' })],
      NOW,
    )
    expect(withDetail.priorityDeals[0]?.axes.decisionAwaited).toEqual({ measured: true, label: 'profiles_prepared' })

    const withoutDetail = pipelineHealth([row({ has_next_action: false })], NOW)
    expect(withoutDetail.priorityDeals[0]?.axes.decisionAwaited).toEqual({ measured: false })
  })

  it('risque réutilise les raisons DÉJÀ nommées par #2324 — jamais une deuxième liste', () => {
    const health = pipelineHealth([row({ has_next_action: false, needs_total: 1, needs_without_profile: 1 })], NOW)
    expect(health.priorityDeals[0]?.axes.risk).toEqual({
      measured: true,
      label: 'without_next_action, need_without_profile',
    })
  })
})

/**
 * #2325.11 — AXE VIEILLISSEMENT.
 *
 * Distinct de `timing` dans son INTENTION (« depuis quand ça traîne » plutôt
 * que « y a-t-il urgence »), mais ce pipeline ne porte qu'UNE SEULE date par
 * opportunité (`stage_entered_at`, déjà le proxy du dernier fait ET du temps
 * dans le stage — voir le commentaire de {@link PipelineHealthRow}). Tant
 * qu'un second horodatage n'existe pas (deadline déclarée, dernier fait
 * distinct de l'entrée en stage), les deux axes partagent la même valeur
 * mesurée : GA-26 interdit un second calcul qui ferait semblant de lire autre
 * chose que ce qui est réellement là.
 */
describe('pipelineHealth — #2325.11 : axe VIEILLISSEMENT — même source que timing, clé séparée', () => {
  it('mesuré depuis la même fraîcheur que timing (aucun recalcul), sous sa propre clé', () => {
    const health = pipelineHealth([row({ has_next_action: false, stage_entered_at: '2025-01-01' })], NOW)
    const axes = health.priorityDeals[0]?.axes
    expect(axes?.ageing).toEqual({ measured: true, label: 'stale' })
    expect(axes?.ageing).toEqual(axes?.timing)
  })

  it('une opportunité fraîche mesure aussi ageing — "pas encore vieillissante" est une lecture, pas une absence', () => {
    const health = pipelineHealth([row({ has_next_action: false, stage_entered_at: NOW.toISOString() })], NOW)
    expect(health.priorityDeals[0]?.axes.ageing).toEqual({ measured: true, label: 'fresh' })
  })

  it('une opportunité qui vieillit (ageing, 31-180j) porte le même label sur les deux axes', () => {
    const health = pipelineHealth([row({ has_next_action: false, stage_entered_at: '2026-08-01' })], NOW)
    expect(health.priorityDeals[0]?.axes.ageing).toEqual({ measured: true, label: 'ageing' })
  })
})

/**
 * #2325.13 — AXE CONFIANCE.
 *
 * Agrège les `EVIDENCE_GAPS` déjà nommés par `projectEvidence`
 * (opportunity-ontology.ts) — calculés par l'APPELANT SQL
 * (project-pipeline.service.ts), JAMAIS recalculés ici (GA-26). `undefined`
 * = l'appelant n'a pas fourni cette lecture pour cette ligne : non mesuré,
 * jamais deviné (GA-18/19). Un tableau VIDE est un signal POSITIF mesuré
 * (aucun manque connu) — distinct du cas non mesuré, jamais confondu avec un
 * pourcentage de complétude.
 */
describe('pipelineHealth — #2325.13 : axe CONFIANCE — agrège evidence_gaps, sans le recalculer', () => {
  it('absent (appelant ne fournit pas evidence_gaps) → non mesuré, jamais deviné', () => {
    const health = pipelineHealth([row({ has_next_action: false })], NOW)
    expect(health.priorityDeals[0]?.axes.confidence).toEqual({ measured: false })
  })

  it('un tableau vide de manques est mesuré et positif — pas une absence', () => {
    const health = pipelineHealth([row({ has_next_action: false, evidence_gaps: [] })], NOW)
    expect(health.priorityDeals[0]?.axes.confidence).toEqual({ measured: true, label: 'complete' })
  })

  it('les manques nommés voyagent tels quels, jamais un pourcentage ni une probabilité', () => {
    const health = pipelineHealth(
      [row({ has_next_action: false, evidence_gaps: ['no_decision_maker', 'no_next_action'] })],
      NOW,
    )
    expect(health.priorityDeals[0]?.axes.confidence).toEqual({
      measured: true,
      label: 'no_decision_maker, no_next_action',
    })
  })
})

describe('pipelineHealth — #2325.17-.19 : une décision, un owner, une date par dossier', () => {
  it('porte le owner déjà connu sur la ligne — jamais assigné ici', () => {
    const health = pipelineHealth([row({ has_next_action: false, owner_id: 'user-42' })], NOW)
    expect(health.priorityDeals[0]?.owner).toBe('user-42')
  })

  it('owner absent reste `null` — jamais un owner deviné', () => {
    const health = pipelineHealth([row({ has_next_action: false, owner_id: null })], NOW)
    expect(health.priorityDeals[0]?.owner).toBeNull()
  })

  it('recommendedBy est une date ISO dérivée de la fraîcheur, jamais une échéance mesurée inventée', () => {
    const health = pipelineHealth([row({ has_next_action: false, stage_entered_at: '2025-01-01' })], NOW)
    // stale → relance recommandée sous 1 jour.
    expect(health.priorityDeals[0]?.recommendedBy).toBe('2026-09-23')
  })
})

describe('pipelineHealth — #2325.20-.26 : six décisions nommées, jamais "relancer"', () => {
  it('stale + sans action → décider de fermer', () => {
    const health = pipelineHealth([row({ has_next_action: false, stage_entered_at: '2025-01-01' })], NOW)
    expect(health.priorityDeals[0]?.decision).toBe('decide_to_close')
  })

  it("l'étape « entretien » → fixer l'entretien", () => {
    const health = pipelineHealth(
      [row({ stage: 'profiles_submitted', has_next_action: false, most_advanced_need_status: 'client_review' })],
      NOW,
    )
    expect(health.priorityDeals[0]?.decision).toBe('schedule_interview')
  })

  it('« profils préparés » → obtenir le retour shortlist', () => {
    const health = pipelineHealth(
      [row({ stage: 'confirmed', has_next_action: false, most_advanced_need_status: 'shortlist_ready' })],
      NOW,
    )
    expect(health.priorityDeals[0]?.decision).toBe('get_shortlist_feedback')
  })

  it('« profils recherchés » → confirmer le must-have', () => {
    const health = pipelineHealth(
      [row({ stage: 'confirmed', has_next_action: false, most_advanced_need_status: 'qualified' })],
      NOW,
    )
    expect(health.priorityDeals[0]?.decision).toBe('confirm_must_have')
  })

  it('un besoin sans profil, sans autre affinage → sécuriser le consultant', () => {
    const health = pipelineHealth(
      [row({ has_next_action: true, needs_total: 1, needs_without_profile: 1, stage_entered_at: '2026-09-20' })],
      NOW,
    )
    expect(health.priorityDeals[0]?.decision).toBe('secure_consultant')
  })

  it('rien de plus précis à dire → valider le budget, jamais une relance générique', () => {
    const health = pipelineHealth([row({ has_next_action: false, stage_entered_at: '2026-09-10' })], NOW)
    expect(health.priorityDeals[0]?.decision).toBe('validate_budget')
  })

  it('la liste des décisions ne contient jamais "relancer" — un enum fermé, pas une liste ouverte', () => {
    expect(PIPE_PRIORITY_DECISIONS).not.toContain('relaunch')
    expect(PIPE_PRIORITY_DECISIONS).not.toContain('follow_up')
    expect(PIPE_PRIORITY_DECISIONS).toHaveLength(6)
  })
})

describe('pipelineHealth — #2325.1 : répond à « quelles affaires méritent mon temps »', () => {
  it('un pipe vide ne propose aucune affaire prioritaire — jamais une réponse inventée', () => {
    const health = pipelineHealth([], NOW)
    expect(health.priorityDeals).toHaveLength(0)
    expect(health.dealsToWatch).toHaveLength(0)
  })
})

/**
 * #2325.37-.46 — LA RECETTE GATE DE L'ISSUE, NOMMÉE LIGNE PAR LIGNE.
 *
 * L'issue #2325 liste neuf pipes de recette (riche, vide, cinq identiques,
 * grosse affaire faible, petite affaire chaude, absence de profil, consultant
 * concurrent, longue inactivité, équipe multi-owner) plus un NO-GO. Ce bloc
 * les NOMME un par un plutôt que de renvoyer aux tests génériques ci-dessus :
 * une régression sur UN scénario précis casse un test qui porte son nom, pas
 * un test générique qu'il faudrait relire pour comprendre ce qu'il couvrait.
 *
 * #2325.43 (consultant concurrent) N'EST PAS ici : la collision de staffing
 * est une lecture SÉPARÉE (`detectStaffingCollisions`, `staffing-collision.ts`),
 * jamais une deuxième dérivation dans ce module pur. Son scénario de recette
 * NOMMÉ vit dans `project-pipeline.service.spec.ts` — « #2325.43 — consultant
 * concurrent » —, la seule couche qui voit les DEUX lectures (`pipelineHealth`
 * et `detectStaffingCollisions`) réunies sur le même appel `health()`.
 */
describe('pipelineHealth — #2325.37-.46 : recette gate', () => {
  it('#2325.37 — pipe riche : plusieurs raisons distinctes cohabitent, chacune nommée sur sa ligne', () => {
    const health = pipelineHealth(
      [
        row({ id: 'opp-ageing', stage_entered_at: '2026-08-01' }),
        row({ id: 'opp-no-action', has_next_action: false }),
        row({ id: 'opp-no-profile', needs_total: 1, needs_without_profile: 1 }),
        row({ id: 'opp-awaiting', needs_total: 1, needs_awaiting_feedback: 1 }),
        row({ id: 'opp-stale-close', stage_entered_at: '2025-01-01', has_next_action: false }),
        row({ id: 'opp-clean' }), // fraîche, sans raison : hors needsAttention.
      ],
      NOW,
    )
    expect(health.needsAttention).toHaveLength(5)
    expect(health.priorityDeals).toHaveLength(5)
    expect(health.recommendedToClose.map(i => i.id)).toEqual(['opp-stale-close'])
  })

  it('#2325.38 — pipe vide : aucune affaire, jamais une réponse inventée', () => {
    const health = pipelineHealth([], NOW)
    expect(health.needsAttention).toHaveLength(0)
    expect(health.priorityDeals).toHaveLength(0)
    expect(health.dealsToWatch).toHaveLength(0)
  })

  it('#2325.39 — cinq affaires identiques : toutes retenues, un ordre déterministe (id), jamais un tirage arbitraire', () => {
    const rows = Array.from({ length: 5 }, (_, i) => row({ id: `opp-${i}`, has_next_action: false }))
    const health = pipelineHealth(rows, NOW)
    expect(health.priorityDeals).toHaveLength(5)
    expect(health.priorityDeals.map(d => d.id)).toEqual(['opp-0', 'opp-1', 'opp-2', 'opp-3', 'opp-4'])
  })

  it("#2325.40 — grosse affaire théorique mais faible : fraîche et sans raison, elle ne remonte JAMAIS, quel que soit un montant qu'on tenterait de lui accoler", () => {
    const bigButWeak = { ...row({ id: 'opp-big' }), amount_cents: 900_000_00 } as unknown as PipelineHealthRow
    const health = pipelineHealth([bigButWeak], NOW)
    expect(health.needsAttention).toHaveLength(0)
    expect(health.priorityDeals).toHaveLength(0)
  })

  it('#2325.41 — petite affaire mais chaude : chargée de raisons, elle prend la tête devant une affaire propre', () => {
    const smallButHot = row({ id: 'opp-small', has_next_action: false, needs_total: 1, needs_without_profile: 1 })
    const health = pipelineHealth([row({ id: 'opp-clean' }), smallButHot], NOW)
    expect(health.priorityDeals[0]?.id).toBe('opp-small')
  })

  it('#2325.42 — absence de profil : la raison est nommée et la décision devient « sécuriser le consultant »', () => {
    const health = pipelineHealth([row({ id: 'opp-1', needs_total: 1, needs_without_profile: 1 })], NOW)
    expect(health.priorityDeals[0]?.decision).toBe('secure_consultant')
    expect(health.priorityDeals[0]?.axes.risk).toEqual({ measured: true, label: 'need_without_profile' })
  })

  it('#2325.44 — longue inactivité : stale, recommandée à la clôture sans prochaine action', () => {
    const health = pipelineHealth([row({ id: 'opp-1', stage_entered_at: '2025-01-01', has_next_action: false })], NOW)
    expect(health.priorityDeals[0]?.axes.timing).toEqual({ measured: true, label: 'stale' })
    expect(health.recommendedToClose.map(i => i.id)).toEqual(['opp-1'])
  })

  it('#2325.45 — équipe multi-owner : chaque affaire garde SON propre owner, jamais un owner unique recopié', () => {
    const health = pipelineHealth(
      [
        row({ id: 'opp-a', has_next_action: false, owner_id: 'user-a' }),
        row({ id: 'opp-b', has_next_action: false, owner_id: 'user-b', needs_total: 1, needs_without_profile: 1 }),
        row({ id: 'opp-c', has_next_action: false, owner_id: null }),
      ],
      NOW,
    )
    const owners = new Map(health.priorityDeals.map(d => [d.id, d.owner]))
    expect(owners.get('opp-a')).toBe('user-a')
    expect(owners.get('opp-b')).toBe('user-b')
    expect(owners.get('opp-c')).toBeNull()
  })

  it('#2325.46 — NO-GO : jamais première sur le seul montant théorique — un montant accolé à la ligne ne pèse dans AUCUN classement', () => {
    const theoreticallyBig = {
      ...row({ id: 'opp-big', has_next_action: true }),
      amount_cents: 900_000_00,
    } as unknown as PipelineHealthRow
    const modest = row({ id: 'opp-modest', has_next_action: false })
    const health = pipelineHealth([theoreticallyBig, modest], NOW)
    // `opp-big` est FRAÎCHE et sans raison : le montant théorique ne la fait
    // même pas entrer dans needsAttention, a fortiori en tête de classement.
    expect(health.priorityDeals.map(d => d.id)).toEqual(['opp-modest'])
  })
})
