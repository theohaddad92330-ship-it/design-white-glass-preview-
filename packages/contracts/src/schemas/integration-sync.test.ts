import { describe, expect, it } from 'vitest'
import {
  SYNC_RUN_STATUSES,
  SYNC_RUN_TERMINAL_STATUSES,
  SYNC_SUMMARY_DOMAINS,
  groupSyncSummaryByBlock,
  isSyncRunTerminal,
  syncRunStatusSchema,
  type SyncSummaryLine,
} from './integration-sync.js'

/**
 * Ce que ces tests défendent (épopée #2980) : un job vivant (y compris
 * l'historique `running`, jamais retiré) n'est JAMAIS confondu avec un job
 * terminal — c'est exactement la distinction que la garde anti-double-
 * lancement (#2110.81) doit pouvoir faire sans se tromper.
 */
describe('isSyncRunTerminal', () => {
  it('les quatre états terminaux arrêtent un job', () => {
    for (const status of SYNC_RUN_TERMINAL_STATUSES) {
      expect(isSyncRunTerminal(status)).toBe(true)
    }
  })

  it('`running` (historique) et les six phases nommées restent vivants', () => {
    const alive = SYNC_RUN_STATUSES.filter(
      status => !(SYNC_RUN_TERMINAL_STATUSES as readonly string[]).includes(status),
    )
    expect(alive).toEqual([
      'running',
      'pending',
      'reading_sources',
      'matching_accounts',
      'matching_contacts',
      'detecting_events',
      'preparing_summary',
    ])
    for (const status of alive) {
      expect(isSyncRunTerminal(status)).toBe(false)
    }
  })

  it('les 11 valeurs restent toutes acceptées par le schéma (GA-08 : rien ne rétrécit)', () => {
    for (const status of SYNC_RUN_STATUSES) {
      expect(syncRunStatusSchema.parse(status)).toBe(status)
    }
    expect(SYNC_RUN_STATUSES).toHaveLength(11)
  })
})

/**
 * #2110.47 à .53 — la restitution à 5 blocs. Ce que ces tests défendent :
 * chaque domaine du résumé plat tombe dans EXACTEMENT un bloc réel (jamais
 * `advice`, réservé aux recommandations dérivées) ; un bloc sans ligne
 * n'apparaît jamais (« on n'affiche pas ce qu'on n'a pas ») ; le bloc
 * `advice` ne porte QUE des phrases qui reprennent un compte déjà présent
 * ailleurs dans le même résumé, jamais un contenu inventé.
 */
describe('groupSyncSummaryByBlock — la restitution à 5 blocs (#2110.47 à .53)', () => {
  it('range chaque domaine existant dans un bloc réel (jamais `advice`)', () => {
    for (const domain of SYNC_SUMMARY_DOMAINS) {
      const line: SyncSummaryLine = { domain, count: 1, label: { fr: 'x', en: 'x' } }
      const groups = groupSyncSummaryByBlock([line])
      const found = groups.find(g => g.lines.includes(line))
      expect(found).toBeDefined()
      expect(found?.block).not.toBe('advice')
    }
  })

  it('un résumé vide ne produit aucun bloc', () => {
    expect(groupSyncSummaryByBlock([])).toEqual([])
  })

  it('regroupe « retrouvé » (rendez-vous/échanges/pages) et « rapproché » (comptes/contacts) séparément', () => {
    const lines: SyncSummaryLine[] = [
      { domain: 'accounts', count: 3, label: { fr: '3 comptes mis à jour', en: '3 accounts updated' } },
      { domain: 'contacts', count: 5, label: { fr: '5 contacts retrouvés', en: '5 contacts found' } },
      { domain: 'meetings', count: 2, label: { fr: '2 rendez-vous retrouvés', en: '2 meetings found' } },
    ]
    const groups = groupSyncSummaryByBlock(lines)
    expect(groups.map(g => g.block)).toEqual(['found', 'matched'])
    expect(groups.find(g => g.block === 'matched')?.lines).toHaveLength(2)
    expect(groups.find(g => g.block === 'found')?.lines).toHaveLength(1)
  })

  it('« pas compris » ne paraît que si des ambiguïtés existent', () => {
    const withAmbiguities = groupSyncSummaryByBlock([
      {
        domain: 'ambiguities',
        count: 2,
        label: { fr: '2 fiches à confirmer avant de les rapprocher', en: '2 records to confirm before merging them' },
      },
    ])
    expect(withAmbiguities.map(g => g.block)).toContain('unclear')

    const withoutAmbiguities = groupSyncSummaryByBlock([
      { domain: 'accounts', count: 1, label: { fr: '1 compte mis à jour', en: '1 account updated' } },
    ])
    expect(withoutAmbiguities.map(g => g.block)).not.toContain('unclear')
  })

  it('« ce que je conseille » reprend le compte déjà écrit — jamais un contenu inventé', () => {
    const groups = groupSyncSummaryByBlock([
      {
        domain: 'ambiguities',
        count: 2,
        label: { fr: '2 fiches à confirmer avant de les rapprocher', en: '2 records to confirm before merging them' },
      },
      {
        domain: 'meetings_to_prepare',
        count: 1,
        label: { fr: '1 rendez-vous à préparer', en: '1 meeting to prepare' },
      },
    ])
    const advice = groups.find(g => g.block === 'advice')
    expect(advice?.lines).toEqual([
      {
        domain: 'ambiguities',
        count: 2,
        label: { fr: 'Confirmer les 2 fiches en attente avant de les rapprocher.', en: expect.any(String) },
      },
      {
        domain: 'meetings_to_prepare',
        count: 1,
        label: { fr: 'Préparer le rendez-vous à venir.', en: expect.any(String) },
      },
    ])
  })

  it('aucun bloc « conseille » quand rien n’appelle un geste (accounts/contacts/pages seuls)', () => {
    const groups = groupSyncSummaryByBlock([
      { domain: 'accounts', count: 1, label: { fr: '1 compte mis à jour', en: '1 account updated' } },
      { domain: 'pages', count: 4, label: { fr: '4 pages alimentées', en: '4 pages indexed for Laura' } },
    ])
    expect(groups.map(g => g.block)).not.toContain('advice')
  })
})
