import { describe, expect, it } from 'vitest'
import {
  ACTION_CONFIDENCE_LEVELS,
  ACTION_PLAN_OUTCOMES,
  ACTION_TARGET_KINDS,
  ACTION_NO_GO_REASONS,
  actionExecutionStatusSchema,
  actionMissingData,
  actionNoGoReasons,
  actionOwnerPage,
  actionPlanItemSchema,
  actionTargetSchema,
  blockedByDependency,
  createActionPlanItemSchema,
  createPlanActionSchema,
  createdPlanActionSchema,
  MANUAL_ACTION_WEEK_INDEX,
  myPlanActionSchema,
  NEXT_ACTIONS_MAX,
  prepareContactPlanSchema,
  nextActions,
  outcomesForTargetKind,
  PLAN_ACTION_CHANNELS,
  updateActionPlanItemSchema,
} from './action-plan-items.js'

/**
 * #2123.1-.10 — une action du plan pointe vers un objet canonique EXISTANT.
 *
 * Le Plan d'action était une to-do list flottante : du texte libre avec un
 * responsable, qui ne pointait vers rien (`agent_docs/plan-un-seul-chemin-de-tache.md`).
 * Ce test tient les deux moitiés de la règle : les huit natures d'objet sont
 * NOMMÉES, et une action neuve sans objet est REFUSÉE.
 */
const target = { kind: 'contact', id: '8d2f5a1e-0000-4000-8000-000000000001', label: 'Sophie Marchand (DSI)' }

const item = {
  id: '11111111-0000-4000-8000-000000000001',
  account_id: '22222222-0000-4000-8000-000000000001',
  label: 'Rappeler le DSI',
  week_index: 0,
  step_index: 0,
  done: false,
  due_date: null,
  completed_at: null,
  execution_status: 'todo',
  snoozed_until: null,
  assigned_to: null,
  target,
  reason: 'Le DSI a ouvert deux postes data en trois semaines.',
  contact_id: '33333333-0000-4000-8000-000000000001',
  depends_on_item_id: null,
  provenance: { source: 'human', at: '2026-09-14T09:00:00.000Z' },
  confidence: null,
  cost_credits: null,
  created_at: '2026-09-14T10:00:00.000Z',
  updated_at: '2026-09-14T10:00:00.000Z',
}

describe('#2123.1-.10 — les huit objets canoniques', () => {
  it('nomme les huit natures, dans cet ordre (GA-08 : ajout en FIN, jamais au milieu)', () => {
    expect(ACTION_TARGET_KINDS).toEqual([
      'contact',
      'meeting',
      'crm_task',
      'sequence',
      'project',
      'need',
      'partner',
      'verification',
    ])
  })

  it.each(ACTION_TARGET_KINDS)('accepte une action qui vise un %s existant', kind => {
    expect(actionTargetSchema.parse({ ...target, kind })).toMatchObject({ kind })
  })

  it('REFUSE une nature qui n’est pas l’une des huit', () => {
    expect(actionTargetSchema.safeParse({ ...target, kind: 'todo' }).success).toBe(false)
  })

  it('REFUSE un objet sans identifiant — c’est ce qui fait une tâche flottante', () => {
    expect(actionTargetSchema.safeParse({ ...target, id: '   ' }).success).toBe(false)
  })

  it('REFUSE un objet sans libellé lisible', () => {
    expect(actionTargetSchema.safeParse({ kind: 'contact', id: 'c-1' }).success).toBe(false)
  })

  it('REFUSE une action NEUVE sans objet canonique', () => {
    expect(createActionPlanItemSchema.safeParse({ label: 'Rappeler le DSI' }).success).toBe(false)
    expect(createActionPlanItemSchema.safeParse({ label: 'Rappeler le DSI', target }).success).toBe(true)
  })

  it('#2901 (#2395.4) — le canal est optionnel, même énumération fermée que le composeur manuel', () => {
    expect(createActionPlanItemSchema.safeParse({ label: 'Rappeler le DSI', target, channel: 'phone' }).success).toBe(
      true,
    )
    expect(createActionPlanItemSchema.safeParse({ label: 'Rappeler le DSI', target, channel: 'fax' }).success).toBe(
      false,
    )
  })

  it('LIT une ligne historique sans objet — on archive, on ne supprime pas', () => {
    const legacy = actionPlanItemSchema.parse({ ...item, target: null })
    expect(legacy.target).toBeNull()
  })

  it('lit une ligne qui porte son objet', () => {
    expect(actionPlanItemSchema.parse(item).target).toEqual(target)
  })
})

describe('#2123.21-.33 — les champs d’une action', () => {
  it('porte sa raison, son contact, sa dépendance, sa source, sa confiance et son coût', () => {
    const parsed = actionPlanItemSchema.parse({
      ...item,
      depends_on_item_id: '44444444-0000-4000-8000-000000000001',
      confidence: 'medium',
      cost_credits: 2,
    })
    expect(parsed).toMatchObject({
      reason: 'Le DSI a ouvert deux postes data en trois semaines.',
      contact_id: '33333333-0000-4000-8000-000000000001',
      depends_on_item_id: '44444444-0000-4000-8000-000000000001',
      provenance: { source: 'human', at: '2026-09-14T09:00:00.000Z' },
      confidence: 'medium',
      cost_credits: 2,
    })
  })

  it('nomme trois niveaux de confiance, et rien d’autre', () => {
    expect(ACTION_CONFIDENCE_LEVELS).toEqual(['high', 'medium', 'low'])
    expect(actionPlanItemSchema.safeParse({ ...item, confidence: 'peut-etre' }).success).toBe(false)
  })

  it('une confiance NON MESURÉE est `null` — jamais zéro, jamais « faible »', () => {
    const parsed = actionPlanItemSchema.parse({ ...item, confidence: null })
    expect(parsed.confidence).toBeNull()
    // Le piège que GA-18/GA-19 existent pour empêcher : « non mesuré » rendu
    // comme la plus basse des valeurs mesurées.
    expect(parsed.confidence).not.toBe('low')
  })

  it('un coût NON MESURÉ est `null` — jamais 0, qui voudrait dire gratuit', () => {
    expect(actionPlanItemSchema.parse({ ...item, cost_credits: null }).cost_credits).toBeNull()
    expect(actionPlanItemSchema.parse({ ...item, cost_credits: 0 }).cost_credits).toBe(0)
    expect(actionPlanItemSchema.safeParse({ ...item, cost_credits: -1 }).success).toBe(false)
  })

  it('REFUSE une source inconnue, et REFUSE une source sans sa date', () => {
    expect(actionPlanItemSchema.safeParse({ ...item, provenance: { source: 'devine', at: null } }).success).toBe(false)
    expect(actionPlanItemSchema.safeParse({ ...item, provenance: { source: 'human' } }).success).toBe(false)
  })

  it('la page propriétaire se DÉRIVE de la nature de l’objet — une seule fois, ici (GA-26)', () => {
    expect(actionOwnerPage('contact')).toBe('contacts')
    expect(actionOwnerPage('project')).toBe('projets')
    expect(actionOwnerPage('verification')).toBe('dossier')
    // Les huit natures ont une page : aucune action ne peut être orpheline.
    for (const kind of ACTION_TARGET_KINDS) expect(actionOwnerPage(kind).length).toBeGreaterThan(0)
  })
})

describe('#2123.34-.35 — ce qui s’affiche en tête', () => {
  const at = (id: string, over: Partial<Record<string, unknown>> = {}) =>
    actionPlanItemSchema.parse({ ...item, id: `00000000-0000-4000-8000-00000000000${id}`, ...over })

  it('nomme ce qui MANQUE à une action, plutôt que de la proposer quand même', () => {
    expect(actionMissingData(at('1', { target: null }))).toBe('target')
    expect(actionMissingData(at('2', { contact_id: null }))).toBe('contact')
    expect(actionMissingData(at('3'))).toBeNull()
  })

  it('une action qui vise un projet n’a pas besoin d’un contact', () => {
    const onProject = at('4', { contact_id: null, target: { kind: 'project', id: 'p-1', label: 'Refonte SI' } })
    expect(actionMissingData(onProject)).toBeNull()
  })

  it('n’affiche JAMAIS plus de trois actions en tête, jamais quinze', () => {
    const many = Array.from({ length: 15 }, (_, i) => at(String(i % 9)))
    expect(NEXT_ACTIONS_MAX).toBe(3)
    expect(nextActions(many)).toHaveLength(3)
  })

  it('remonte d’abord ce qui est à vérifier — on ne propose pas un geste qu’on ne peut pas tenir', () => {
    const complete = at('1')
    const incomplete = at('2', { target: null })
    expect(nextActions([complete, complete, complete, incomplete])[0]).toBe(incomplete)
  })

  it('rend une liste vide sur une liste vide — jamais une action inventée pour remplir', () => {
    expect(nextActions([])).toEqual([])
  })
})

describe('#2317.12 — une action marquée obsolète, jamais supprimée', () => {
  it('accepte `obsolete`, cinquième et dernière valeur (GA-08 : ajout en FIN)', () => {
    expect(actionExecutionStatusSchema.options).toEqual(['todo', 'done', 'snoozed', 'prepared', 'obsolete'])
    expect(actionExecutionStatusSchema.parse('obsolete')).toBe('obsolete')
  })

  it('lit une ligne existante marquée obsolète', () => {
    const parsed = actionPlanItemSchema.parse({ ...item, execution_status: 'obsolete' })
    expect(parsed.execution_status).toBe('obsolete')
  })
})

describe('#2317.15 — le NO-GO du plan : non cliquable, non attribuée, ou sans date et résultat attendu', () => {
  it('nomme les trois raisons, dans cet ordre', () => {
    expect(ACTION_NO_GO_REASONS).toEqual(['not_clickable', 'not_assigned', 'no_date_or_outcome'])
  })

  it('sans objet visé, sans responsable, sans date ni résultat attendu — les trois raisons', () => {
    const bare = actionPlanItemSchema.parse({ ...item, target: null })
    expect(actionNoGoReasons(bare)).toEqual(['not_clickable', 'not_assigned', 'no_date_or_outcome'])
  })

  it('un objet visé lève « not_clickable » — les deux autres restent', () => {
    // `item` porte déjà `target` (fixture du haut de fichier) : ni responsable
    // ni date/résultat attendu ne sont posés.
    expect(actionNoGoReasons(item)).toEqual(['not_assigned', 'no_date_or_outcome'])
  })

  it('un responsable SAISI À LA MAIN suffit — pas besoin d’un membre délégué', () => {
    const withOwner = actionPlanItemSchema.parse({ ...item, owner_name: 'Sophie' })
    expect(actionNoGoReasons(withOwner)).toEqual(['no_date_or_outcome'])
  })

  it('une date SEULE suffit, sans résultat attendu', () => {
    const withDate = actionPlanItemSchema.parse({ ...item, owner_name: 'Sophie', due_date: '2026-10-01' })
    expect(actionNoGoReasons(withDate)).toEqual([])
  })

  it('un résultat attendu SEUL suffit, sans date', () => {
    const withOutcome = actionPlanItemSchema.parse({
      ...item,
      assigned_to: '55555555-0000-4000-8000-000000000001',
      expected_outcome: 'Nommer l’owner du projet',
    })
    expect(actionNoGoReasons(withOutcome)).toEqual([])
  })

  it('rend `[]` — pas un booléen nu — quand tout est réuni', () => {
    const complete = actionPlanItemSchema.parse({
      ...item,
      owner_name: 'Sophie',
      due_date: '2026-10-01',
      expected_outcome: 'Nommer l’owner du projet',
    })
    expect(actionNoGoReasons(complete)).toEqual([])
  })
})

describe('#2317.9 — une action conditionnelle n’est pas exécutable avant sa dépendance', () => {
  const at = (id: string, over: Partial<Record<string, unknown>> = {}) =>
    actionPlanItemSchema.parse({ ...item, id: `00000000-0000-4000-8000-00000000000${id}`, ...over })

  it('bloque quand la dépendance n’est pas faite', () => {
    const dependency = at('1', { label: 'Qualifier le besoin' })
    const conditional = at('2', { depends_on_item_id: dependency.id })
    expect(blockedByDependency(conditional, [dependency, conditional])).toEqual({
      id: dependency.id,
      label: 'Qualifier le besoin',
    })
  })

  it('ne bloque plus une fois la dépendance faite', () => {
    const dependency = at('1', { execution_status: 'done' })
    const conditional = at('2', { depends_on_item_id: dependency.id })
    expect(blockedByDependency(conditional, [dependency, conditional])).toBeNull()
  })

  it('ne bloque rien sans dépendance', () => {
    expect(blockedByDependency(at('3'), [])).toBeNull()
  })

  it('une dépendance retirée du plan ne bloque plus — la condition ne peut plus être vérifiée', () => {
    const conditional = at('2', { depends_on_item_id: '99999999-0000-4000-8000-000000000009' })
    expect(blockedByDependency(conditional, [conditional])).toBeNull()
  })
})

/**
 * #2123.46 / #2123.47 — une action du plan est UNE ligne, et une seule.
 *
 * Le formulaire du plan écrivait dans `raw_analysis.user_plan_actions` (le JSON
 * de l'analyse), l'écran Actions lit les lignes d'action, et les actions créées
 * par le copilote vivaient dans une troisième bande : trois stockages pour un
 * seul objet métier, donc trois vérités possibles. La porte de création vit
 * désormais ici, et elle dit ce qu'une action porte à sa naissance.
 */
describe('#2123.46 — la porte de création d’une action du plan', () => {
  const account_id = '22222222-0000-4000-8000-000000000001'

  it('la bande des actions saisies à la main vit à UN seul endroit (GA-26)', () => {
    expect(MANUAL_ACTION_WEEK_INDEX).toBe(1000)
  })

  it('accepte une action saisie à la main SANS objet — le manque est nommé, jamais deviné', () => {
    const parsed = createPlanActionSchema.parse({
      account_id,
      label: 'Relancer le DSI après le comité',
      reason: 'Obtenir un rendez-vous',
      expected_outcome: 'Un rendez-vous fixé',
      target: null,
    })
    expect(parsed.target).toBeNull()
    expect(actionMissingData(actionPlanItemSchema.parse({ ...item, target: null }))).toBe('target')
  })

  // #2871 (#2395.8) — l'objectif est OBLIGATOIRE à la création d'une action du plan.
  it('REFUSE une action sans objectif — absent, vide ou blanc', () => {
    const base = { account_id, label: 'Relancer le DSI', target: null, expected_outcome: 'Un rendez-vous fixé' }
    expect(createPlanActionSchema.safeParse(base).success).toBe(false)
    expect(createPlanActionSchema.safeParse({ ...base, reason: '' }).success).toBe(false)
    expect(createPlanActionSchema.safeParse({ ...base, reason: '   ' }).success).toBe(false)
    expect(createPlanActionSchema.safeParse({ ...base, reason: null }).success).toBe(false)
    expect(
      createPlanActionSchema.safeParse({
        ...base,
        reason: 'Obtenir un rendez-vous',
        expected_outcome: 'Un rendez-vous fixé',
      }).success,
    ).toBe(true)
  })

  // #2395.8 — la création d'un élément de plan exige AUSSI le résultat attendu (pas un verbe seul).
  it('#2395.8 — REFUSE une action sans résultat attendu — absent, vide, blanc ou null', () => {
    const base = { account_id, label: 'Relancer le DSI', target: null, reason: 'Obtenir un rendez-vous' }
    expect(createPlanActionSchema.safeParse(base).success).toBe(false)
    expect(createPlanActionSchema.safeParse({ ...base, expected_outcome: '' }).success).toBe(false)
    expect(createPlanActionSchema.safeParse({ ...base, expected_outcome: '   ' }).success).toBe(false)
    expect(createPlanActionSchema.safeParse({ ...base, expected_outcome: null }).success).toBe(false)
    expect(createPlanActionSchema.safeParse({ ...base, expected_outcome: 'Un rendez-vous fixé' }).success).toBe(true)
  })

  it('porte l’objet visé quand il est CONNU — une fiche contact l’apporte', () => {
    expect(
      createPlanActionSchema.parse({
        account_id,
        label: 'Écrire à Sophie',
        reason: 'Ouvrir la porte',
        expected_outcome: 'Une réponse',
        target,
      }).target,
    ).toEqual(target)
  })

  // #2901 (#2395.4) — le CANAL, quand la personne l'a choisi dans le
  // composer : `seedFromPlan` le pose déjà pour les actions dérivées du plan
  // de Laura, cette porte-ci (le composer manuel) ne le portait pas encore.
  it('accepte un canal choisi dans le composer — absent = null, jamais deviné', () => {
    expect(
      createPlanActionSchema.parse({
        reason: 'Objectif',
        expected_outcome: 'Résultat',
        account_id,
        label: 'Relancer',
        target: null,
      }).channel,
    ).toBeUndefined()
    expect(
      createPlanActionSchema.parse({
        reason: 'Objectif',
        expected_outcome: 'Résultat',
        account_id,
        label: 'Appeler le DSI',
        target: null,
        channel: 'phone',
      }).channel,
    ).toBe('phone')
  })

  it('REFUSE un canal hors de la liste FERMÉE (jamais un canal deviné/inventé)', () => {
    expect(
      createPlanActionSchema.safeParse({
        reason: 'Objectif',
        account_id,
        label: 'Relancer',
        target: null,
        channel: 'sms',
      }).success,
    ).toBe(false)
  })

  it('REFUSE une action sans compte : un plan d’action appartient à un compte', () => {
    expect(createPlanActionSchema.safeParse({ label: 'Relancer', target: null }).success).toBe(false)
  })

  it('REFUSE une action sans geste écrit', () => {
    expect(createPlanActionSchema.safeParse({ account_id, label: '   ', target: null }).success).toBe(false)
  })

  it('garde le responsable SAISI, qui n’est pas une délégation à un membre', () => {
    const parsed = createPlanActionSchema.parse({
      reason: 'Objectif',
      expected_outcome: 'Résultat',
      account_id,
      label: 'Relancer',
      target: null,
      owner_name: 'Sophie',
    })
    expect(parsed.owner_name).toBe('Sophie')
    expect(actionPlanItemSchema.parse({ ...item, owner_name: 'Sophie' })).toMatchObject({
      owner_name: 'Sophie',
      assigned_to: null,
    })
  })

  it('une ligne écrite avant la règle n’a pas de responsable saisi — `null`, pas une chaîne vide', () => {
    expect(actionPlanItemSchema.parse(item).owner_name).toBeNull()
  })

  it('l’action de MON écran Actions porte le compte qu’elle fait avancer', () => {
    const mine = myPlanActionSchema.parse({ ...item, company_name: 'Stelya' })
    expect(mine.company_name).toBe('Stelya')
    expect(mine.execution_status).toBe('todo')
    expect(myPlanActionSchema.parse({ ...item, company_name: null }).company_name).toBeNull()
  })
})

/**
 * #2123.46 — les QUATRE autres écrivains du plan (la veille, la fiche contact,
 * le panneau besoin, l'ajout en masse de contacts) écrivaient encore
 * `raw_analysis.user_plan_actions`. Ils portaient deux champs que la ligne
 * canonique n'avait pas : le résultat attendu et l'indicateur. Les basculer
 * sans ces deux colonnes aurait perdu en silence ce que l'écran montrait.
 */
describe('#2123.46 — le résultat attendu et l’indicateur voyagent avec l’action', () => {
  const account_id = '22222222-0000-4000-8000-000000000001'

  it('la porte de création les accepte', () => {
    const parsed = createPlanActionSchema.parse({
      reason: 'Objectif',
      account_id,
      label: 'Qualifier le signal',
      target: null,
      expected_outcome: 'Obtenir un rendez-vous',
      kpi: 'RDV posé',
    })
    expect(parsed).toMatchObject({ expected_outcome: 'Obtenir un rendez-vous', kpi: 'RDV posé' })
  })

  it('une ligne écrite avant la règle n’en porte pas — `null`, jamais une chaîne vide', () => {
    const parsed = actionPlanItemSchema.parse(item)
    expect(parsed.expected_outcome).toBeNull()
    expect(parsed.kpi).toBeNull()
  })

  it('REFUSE un résultat attendu vide : ce serait un champ rempli de rien', () => {
    expect(
      createPlanActionSchema.safeParse({
        reason: 'Objectif',
        account_id,
        label: 'Relancer',
        target: null,
        expected_outcome: '  ',
      }).success,
    ).toBe(false)
  })

  it('la réponse de création dit si la ligne était DÉJÀ au plan (`added`)', () => {
    const created = createdPlanActionSchema.parse({ ...item, added: false })
    expect(created.added).toBe(false)
    // Sans `added`, un appelant en masse ne saurait plus annoncer « déjà au plan ».
    expect(createdPlanActionSchema.safeParse(item).success).toBe(false)
  })
})

/**
 * #2395.4/#2395.9 (correctif de collecte, 24/09/2026) — le CANAL déjà écrit
 * par le plan de Laura (`bellum_plan.py`), gardé quand il correspond à un
 * canal déjà canonique. C'est ce que `packages/contracts/src/schemas/
 * action.ts` lit pour déterminer le TYPE et parfois l'ATTENDU de l'action
 * canonique sans les deviner.
 */
describe('#2395.4/#2395.9 — le canal déjà connu voyage avec l’action', () => {
  it('nomme les quatre canaux déjà canoniques', () => {
    expect(PLAN_ACTION_CHANNELS).toEqual(['phone', 'email', 'linkedin', 'meeting'])
  })

  it('une ligne écrite avant la règle, ou un item manuel sans canal saisi, reste `null`', () => {
    expect(actionPlanItemSchema.parse(item).channel).toBeNull()
  })

  it('porte le canal connu à la création', () => {
    expect(actionPlanItemSchema.parse({ ...item, channel: 'phone' }).channel).toBe('phone')
  })

  it('REFUSE un canal hors liste', () => {
    expect(actionPlanItemSchema.safeParse({ ...item, channel: 'sms' }).success).toBe(false)
  })
})

/**
 * #2396.1/.2/.11 — le contrat qui empêche un clic générique de MENTIR sur son
 * mode de complétion : `completion_mode` n'est PAS un champ du PATCH client,
 * donc le serveur seul décide `'manual'` (#2396.11 s'appuie sur cette garde).
 */
describe('updateActionPlanItemSchema — #2396.2/.11', () => {
  it('accepte `outcome`', () => {
    const parsed = updateActionPlanItemSchema.parse({ execution_status: 'done', outcome: 'positive' })
    expect(parsed.outcome).toBe('positive')
  })

  it('REFUSE une issue hors liste', () => {
    expect(updateActionPlanItemSchema.safeParse({ outcome: 'enthousiaste' }).success).toBe(false)
  })

  it('STRIPPE `completion_mode` — un client ne peut jamais se déclarer `proof`', () => {
    const parsed = updateActionPlanItemSchema.parse({
      execution_status: 'done',
      outcome: 'positive',
      completion_mode: 'proof',
    } as never)
    expect(parsed).not.toHaveProperty('completion_mode')
  })
})

/**
 * #2715.1 (corrigé 23/09 — revue du coordinateur) — le plan affiche le statut
 * d'ENVOI de l'action. Une PREMIÈRE version confondait `message_sent`
 * (e-mail VÉRIFIÉ) et `plan_action_message_sent`/`plan_action_call_logged`
 * (DÉCLARÉS) sous un seul badge « Succès » — exactement ce que la doctrine
 * interdit : « "Fait" ne porte jamais de preuve d'envoi — un geste déclaratif,
 * jamais confondu avec un envoi vérifié » (CLAUDE.md § Doctrine). Deux
 * valeurs distinctes désormais : `email_sent` (vérifié) et `declared` (un
 * geste déclaratif — LinkedIn, un appel renseigné, ou un `message_sent`
 * historique sans `via` connu : dans le doute, jamais vérifié).
 */
describe('actionPlanItemSchema — send_status (#2715.1)', () => {
  it('`null` par défaut — une ligne historique n’en porte pas', () => {
    const parsed = actionPlanItemSchema.parse(item)
    expect(parsed.send_status).toBeNull()
  })

  it('accepte `email_sent` (e-mail vérifié)', () => {
    const parsed = actionPlanItemSchema.parse({ ...item, send_status: 'email_sent' })
    expect(parsed.send_status).toBe('email_sent')
  })

  it('accepte `declared` (geste déclaratif)', () => {
    const parsed = actionPlanItemSchema.parse({ ...item, send_status: 'declared' })
    expect(parsed.send_status).toBe('declared')
  })

  it('refuse une valeur hors liste — jamais un `success` qui confondrait les deux natures', () => {
    expect(actionPlanItemSchema.safeParse({ ...item, send_status: 'success' }).success).toBe(false)
    expect(actionPlanItemSchema.safeParse({ ...item, send_status: 'verified' }).success).toBe(false)
  })
})

describe('ACTION_PLAN_OUTCOMES — #3265.3 (BEL-SC-236, contrat action)', () => {
  it('les cinq valeurs historiques restent en tête, dans le même ordre (GA-08)', () => {
    expect(ACTION_PLAN_OUTCOMES.slice(0, 5)).toEqual(['positive', 'declined', 'deferred', 'qualified', 'no_response'])
  })

  it('ajoute en fin les quinze issues canoniques du contrat #3265, réutilisant le vocabulaire CALL_OUTCOMES', () => {
    expect(ACTION_PLAN_OUTCOMES).toEqual([
      'positive',
      'declined',
      'deferred',
      'qualified',
      'no_response',
      'information_obtained',
      'connected_qualified',
      'wrong_contact',
      'orientation_given',
      'need_confirmed',
      'need_not_confirmed',
      'callback_scheduled',
      'not_now',
      'refused',
      'no_answer',
      'invalid_contact',
      'left_company',
      'meeting_booked',
      'action_cancelled',
      'other',
      'blocked_by_procurement',
      'blocked_by_margin',
      'technical_error',
      'abandoned',
    ])
  })

  it('#3416.1 (lot C14 30/09) — ajoute en fin les quatre issues manquantes de la recette bêta (blocages achats/marge, erreur technique, abandon)', () => {
    expect(ACTION_PLAN_OUTCOMES.slice(-4)).toEqual([
      'blocked_by_procurement',
      'blocked_by_margin',
      'technical_error',
      'abandoned',
    ])
  })
})

describe('outcomesForTargetKind — #2396.6', () => {
  it('rend la liste complète par défaut', () => {
    expect(outcomesForTargetKind('crm_task')).toEqual(ACTION_PLAN_OUTCOMES)
    expect(outcomesForTargetKind(null)).toEqual(ACTION_PLAN_OUTCOMES)
  })

  it('restreint un rendez-vous à positif/report/aucune réponse', () => {
    expect(outcomesForTargetKind('meeting')).toEqual(['positive', 'deferred', 'no_response'])
  })
})

describe('prepareContactPlanSchema (#4416)', () => {
  const ids = { account_id: '11111111-1111-4111-8111-111111111111', contact_id: '22222222-2222-4222-8222-222222222222' }

  it('accepte un compte et un contact', () => {
    expect(prepareContactPlanSchema.safeParse(ids).success).toBe(true)
    expect(prepareContactPlanSchema.safeParse({ ...ids, locale: 'en' }).success).toBe(true)
  })

  it('refuse un identifiant qui n’est pas un UUID, un contact absent ou une langue inconnue', () => {
    expect(prepareContactPlanSchema.safeParse({ ...ids, contact_id: 'abc' }).success).toBe(false)
    expect(prepareContactPlanSchema.safeParse({ account_id: ids.account_id }).success).toBe(false)
    expect(prepareContactPlanSchema.safeParse({ ...ids, locale: 'de' }).success).toBe(false)
  })
})
