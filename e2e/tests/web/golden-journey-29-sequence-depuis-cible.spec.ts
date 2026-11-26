import { expect, test } from '@playwright/test'
import { json, mockSession } from './x41-socle'

/**
 * #2208.60 (golden journey 29, #2958.60) — CRÉER UNE SÉQUENCE DEPUIS UNE CIBLE.
 *
 * Dans « Mes cibles », la carte d'une liste porte le geste « Créer une séquence
 * depuis la liste … ». Il lit l'audience de CETTE liste (`POST
 * /outreach/audience/preview`, source `target_list`), ouvre la fenêtre de
 * séquence habituelle avec les contacts que le serveur juge éligibles, et NOMME
 * ceux qui sortent de l'audience avec leur raison. Rien n'est armé par le
 * geste : la séquence ne naît qu'au clic « Créer la séquence ».
 */

const LIST_ID = '2d0a1b2c-0029-4a11-9c33-220860000029'
const STAMP = '2026-10-04T09:00:00.000Z'

const list = {
  id: LIST_ID,
  name: 'Banques régionales — T4',
  objective: 'Décrocher 3 rendez-vous DSI',
  type: 'contacts',
  owner_user_id: null,
  team: null,
  visibility: 'workspace',
  source: 'manual',
  source_query: null,
  status: 'in_progress',
  counts: { measured: true, total: 2, ready_to_work: 0, to_review: 2 },
  next_action: null,
  sequence_id: null,
  prospecting_session_id: null,
  created_by: 'u1',
  created_at: STAMP,
  updated_at: STAMP,
  items: ['Claire Dubois', 'Paul Durand'].map((label, index) => ({
    id: `item-${index}`,
    target_list_id: LIST_ID,
    kind: 'contact',
    ref_id: `0000000${index + 1}-0000-4000-8000-00000000000${index + 1}`,
    label,
    sublabel: 'Banque Alpha',
    selection_reason: null,
    priority: null,
    owner_user_id: null,
    work_status: 'to_review',
    provenance: 'manual',
    refreshed_at: null,
    removed_at: null,
    removal_reason: null,
    next_action: null,
    notes: null,
    created_at: STAMP,
    updated_at: STAMP,
  })),
}

const eligible = {
  contact_id: '00000001-0000-4000-8000-000000000001',
  full_name: 'Claire Dubois',
  title: 'DSI',
  account_id: null,
  account_name: 'Banque Alpha',
  assigned_to: null,
  email: 'claire@alpha.test',
  sequence_scope: 'mono_contact',
  duplicate_suspected: false,
  identity_unverified: false,
  owned_by_other: false,
  already_contacted: false,
}

const audience = {
  eligible: [eligible],
  excluded: [
    { contact_id: '00000002-0000-4000-8000-000000000002', full_name: 'Paul Durand', reason: 'already_in_sequence' },
  ],
  duplicates: [],
  collisions: [],
  preview: {
    total: 2,
    eligible: 1,
    missing_coordinates: 0,
    unverified_identity: 0,
    already_in_sequence: 1,
    already_contacted: 0,
    duplicates: 0,
    other_owner: 0,
    excluded_accounts: 0,
    left_contacts: 0,
    team_collisions: 0,
    frequency_capped: 0,
    personal_contacts: 0,
  },
}

test.describe('#2208.60 — golden journey : créer une séquence depuis une cible', () => {
  test('la liste est la source : audience lue côté serveur, exclus nommés, rien d’armé avant le clic', async ({
    page,
  }) => {
    await mockSession(page, { features: ['outreach', 'accounts', 'talent_pool'], tag: '29' })
    const previews: unknown[] = []
    const created: unknown[] = []
    await page.route(/\/target-lists(\?|$)/, route =>
      route.request().resourceType() === 'document' ? route.fallback() : json(route, { lists: [list] }),
    )
    await page.route('**/outreach/audience/preview', route => {
      previews.push(route.request().postDataJSON())
      return json(route, audience)
    })
    await page.route(/\/contacts(\?|$)/, route =>
      route.request().resourceType() === 'document'
        ? route.fallback()
        : json(route, { data: [], pagination: { total: 0, offset: 0, limit: 50, hasMore: false } }),
    )
    await page.route(/\/outreach\/sequences(\?|$)/, route => {
      if (route.request().resourceType() === 'document') return route.fallback()
      if (route.request().method() === 'POST') {
        created.push(route.request().postDataJSON())
        return json(route, { id: 'seq-29' })
      }
      return json(route, [])
    })

    // #4088.8 — les listes cibles vivent sur Comptes, lentille « Listes ».
    await page.goto('/accounts?lens=lists')
    await page
      .getByRole('button', { name: 'Vue cartes' })
      .click({ timeout: 30_000 })
      .catch(() => undefined)
    await page.getByRole('button', { name: 'Créer une séquence depuis la liste Banques régionales — T4' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Claire Dubois', { timeout: 30_000 })
    expect(previews).toEqual([{ source: { kind: 'target_list', target_list_id: LIST_ID }, filters: {} }])
    // Rien n'est armé par le geste lui-même.
    expect(created).toEqual([])
    // Celui qui sort de l'audience est NOMMÉ avec sa raison, jamais tu.
    await expect(page.getByText('Déjà dans une séquence active')).toBeVisible()
  })
})
