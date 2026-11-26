import type { ActionPlanItem } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { planItem } from './planItem.fixture'
import { buildPlanItemFacts, verificationFirst } from './planItemFactsData'

/**
 * #2123.1-.10, .21-.33, .35 — ce qu'une action du plan DIT d'elle-même.
 *
 * Constat de recette du 15/09 (prod, THALES) : les neuf champs existaient au
 * contrat et dans l'API, et aucun écran ne les lisait — `depends_on_item_id`
 * n'avait aucun lecteur. Ce module est la lecture ; ses tests fixent ce qu'elle
 * rend quand la donnée MANQUE, parce que c'est là que « non mesuré » devient
 * « 0 » ou « faible » si personne ne le tient.
 */
describe('buildPlanItemFacts', () => {
  it('#2123.30 / .31 — non mesuré n’est ni « faible » ni « gratuit »', () => {
    const facts = buildPlanItemFacts(planItem(), [])
    expect(facts.confidence).toBeNull()
    expect(facts.costCredits).toBeNull()
    expect(facts.provenance).toBeNull()
    // `0` est une AUTRE affirmation : gratuit. Elle ne se confond pas avec null.
    expect(buildPlanItemFacts(planItem({ cost_credits: 0 }), []).costCredits).toBe(0)
  })

  // #2396.1 — RÉFUTÉ en prod (23/09) : `completion_mode` était persisté
  // (`ActionPlanItemsService`, `CadenceService.completeOpenItemsByProof`) mais
  // AUCUN composant web ne le lisait — une action cochée ne montrait jamais
  // COMMENT elle l'avait été. `null` reste `null` sur une ligne non faite (les
  // 4 modes ne se posent qu'à l'entrée dans « fait »).
  it('#2396.1 — le mode de complétion voyage tel quel, jamais deviné', () => {
    expect(buildPlanItemFacts(planItem(), []).completionMode).toBeNull()
    expect(
      buildPlanItemFacts(planItem({ execution_status: 'done', completion_mode: 'manual' }), []).completionMode,
    ).toBe('manual')
    expect(
      buildPlanItemFacts(planItem({ execution_status: 'done', completion_mode: 'proof' }), []).completionMode,
    ).toBe('proof')
  })

  it('#2153.57 — le résultat, distinct de l’attendu (`expected_outcome`/`kpi`)', () => {
    expect(buildPlanItemFacts(planItem(), []).result).toBeNull()
    expect(buildPlanItemFacts(planItem({ result: 'Le DSI a validé le budget' }), []).result).toBe(
      'Le DSI a validé le budget',
    )
  })

  it('#2123.1 / .33 — l’objet visé mène à la page qui en est propriétaire', () => {
    const linkOf = (kind: NonNullable<ActionPlanItem['target']>['kind'], id = 'x1') =>
      buildPlanItemFacts(planItem({ target: { kind, id, label: 'Objet' } }), []).target
    expect(linkOf('contact', 'c1')).toEqual({
      kind: 'contact',
      label: 'Objet',
      ownerPage: 'contacts',
      link: { to: '/contacts/$id', id: 'c1' },
    })
    expect(linkOf('need', 'n1')?.link).toEqual({ to: '/projects/needs/$needId', id: 'n1' })
    expect(linkOf('project')?.link).toEqual({ to: '/projects' })
    expect(linkOf('sequence')?.link).toEqual({ to: '/actions/sequences' })
    expect(linkOf('partner')?.link).toEqual({ to: '/accounts/partners' })
    expect(linkOf('crm_task')?.link).toEqual({ to: '/actions' })
    // Aucune page à ouvrir : l'agenda n'a pas de route, la vérification vit
    // dans CE dossier. On nomme la page, on n'invente pas de lien.
    expect(linkOf('meeting')).toMatchObject({ ownerPage: 'agenda', link: null })
    expect(linkOf('verification')).toMatchObject({ ownerPage: 'dossier', link: null })
    expect(buildPlanItemFacts(planItem(), []).target).toBeNull()
  })

  it('#2123.28 — la dépendance se lit par le libellé de l’action à faire AVANT', () => {
    const before = planItem({ id: 'i1', label: 'Qualifier le périmètre' })
    const after = planItem({ id: 'i2', depends_on_item_id: 'i1' })
    expect(buildPlanItemFacts(after, [before, after]).dependency).toEqual({ label: 'Qualifier le périmètre' })
    // Une action retirée du plan : la dépendance existe, son libellé non.
    expect(buildPlanItemFacts(planItem({ depends_on_item_id: 'gone' }), [after]).dependency).toEqual({ label: null })
    expect(buildPlanItemFacts(planItem(), [before]).dependency).toBeNull()
  })

  it('#2123.24 — le contact lié porte son nom quand l’objet visé est ce contact', () => {
    const target = { kind: 'contact' as const, id: 'c1', label: 'Marc Dubois' }
    expect(buildPlanItemFacts(planItem({ target, contact_id: 'c1' }), []).contact).toEqual({
      id: 'c1',
      label: 'Marc Dubois',
    })
    const project = { kind: 'project' as const, id: 'p1', label: 'Refonte SI RH' }
    expect(buildPlanItemFacts(planItem({ target: project, contact_id: 'c9' }), []).contact).toEqual({
      id: 'c9',
      label: null,
    })
  })

  it('#2123.35 — ce qui manque est NOMMÉ par la règle du contrat, jamais redérivé', () => {
    expect(buildPlanItemFacts(planItem(), []).missing).toBe('target')
    const target = { kind: 'contact' as const, id: 'c1', label: 'Marc Dubois' }
    expect(buildPlanItemFacts(planItem({ target }), []).missing).toBe('contact')
    expect(buildPlanItemFacts(planItem({ target, contact_id: 'c1' }), []).missing).toBeNull()
  })

  it('#2317.15 — le NO-GO du plan voyage sur les facts, jamais redérivé', () => {
    expect(buildPlanItemFacts(planItem(), []).noGoReasons).toEqual([
      'not_clickable',
      'not_assigned',
      'no_date_or_outcome',
    ])
    const target = { kind: 'contact' as const, id: 'c1', label: 'Marc Dubois' }
    expect(
      buildPlanItemFacts(planItem({ target, owner_name: 'Sophie', due_date: '2026-10-01' }), []).noGoReasons,
    ).toEqual([])
  })
})

describe('#2123.35 — verificationFirst', () => {
  const ready = planItem({ id: 'ready', target: { kind: 'project', id: 'p1', label: 'Refonte' } })
  const toVerify = planItem({ id: 'verify' })
  const toVerifyToo = planItem({ id: 'verify-2' })

  it('met ce qu’il faut vérifier en tête, sans réordonner le reste', () => {
    const rows = [
      { name: 'ready', item: ready },
      { name: 'verify', item: toVerify },
      { name: 'local', item: undefined },
      { name: 'verify-2', item: toVerifyToo },
    ]
    expect(verificationFirst(rows, row => row.item).map(row => row.name)).toEqual([
      'verify',
      'verify-2',
      'ready',
      'local',
    ])
  })

  it('ne touche pas un plan dont rien ne manque — il sait dire NON', () => {
    const rows = [{ item: ready }, { item: { ...ready, id: 'ready-2' } }]
    expect(verificationFirst(rows, row => row.item)).toEqual(rows)
  })
})
