import { describe, expect, it } from 'vitest'
import { formatAsOf, replyProvenance } from './reply-provenance'
import type { ChatResponseContext } from './ContextDisclosure'

const base = {
  active: {
    profile: { present: true, name: null },
    account: { present: true, name: 'LATÉCOÈRE', as_of: null },
    contacts_count: 0,
    plan: { present: false },
    portfolio: { present: false, count: 0 },
    memory: { pinned_facts: 0, has_summary: false },
  },
  sources: [],
  not_consulted: [],
} as unknown as ChatResponseContext

describe('replyProvenance', () => {
  it('sans contexte, tout est null — jamais un zéro', () => {
    // « 0 donnée manquante » affirme que Laura a tout consulté. L'absence de la
    // liste dit seulement qu'on ne sait pas. Les deux se ressemblent à l'écran.
    expect(replyProvenance(undefined)).toEqual({ asOf: null, sourceCount: null, missingCount: null })
  })

  it('une liste vide EST une mesure — 0 source, 0 manque', () => {
    const p = replyProvenance(base)
    expect(p.sourceCount).toBe(0)
    expect(p.missingCount).toBe(0)
    expect(p.asOf).toBeNull()
  })

  it('retient la date du fait le PLUS RÉCENT cité, jamais antérieure aux signaux affichés (#3725)', () => {
    const context = {
      ...base,
      active: { ...base.active, account: { ...base.active.account, as_of: '2026-09-11T00:00:00Z' } },
      sources: [
        { kind: 'account_dossier', label: 'Dossier', as_of: '2026-09-11T00:00:00Z' },
        { kind: 'market_signal', label: 'Signal A', as_of: '2026-09-21T00:00:00Z' },
        { kind: 'market_signal', label: 'Signal B', as_of: '2026-10-01T00:00:00Z' },
      ],
    } as unknown as ChatResponseContext
    // Recette prod 05/10 : « Source du 11 septembre » sous des signaux du 21/09
    // au 01/10. Le pied ne date jamais la réponse avant ce qu'elle cite.
    expect(replyProvenance(context).asOf).toBe('2026-10-01T00:00:00.000Z')
  })

  it('une date illisible est IGNORÉE et ne fait pas tomber le calcul', () => {
    const context = {
      ...base,
      sources: [
        { kind: 'crm', label: 'CRM', as_of: 'bientôt' },
        { kind: 'crm', label: 'CRM', as_of: '2026-05-02T00:00:00Z' },
      ],
    } as unknown as ChatResponseContext
    expect(replyProvenance(context).asOf).toBe('2026-05-02T00:00:00.000Z')
  })

  it('aucune date exploitable ⇒ null, et surtout pas aujourd’hui', () => {
    const context = { ...base, sources: [{ kind: 'crm', label: 'CRM', as_of: null }] } as unknown as ChatResponseContext
    expect(replyProvenance(context).asOf).toBeNull()
  })

  it('compte les manques', () => {
    const context = { ...base, not_consulted: ['CRM', 'agenda'] } as unknown as ChatResponseContext
    expect(replyProvenance(context).missingCount).toBe(2)
  })

  /**
   * #1599 — « aucune date de corpus visible ». Une observation de mémoire
   * marché porte une date de PÉRIODE (le corpus qu'elle agrège), pas une date
   * de fraîcheur : si elle devenait la plus ANCIENNE, l'ancien calcul
   * l'annoncerait comme LA date de la réponse — exactement ce que l'issue
   * interdit quand la réponse combine aussi une source actuelle.
   */
  it('une observation de mémoire marché ne devient JAMAIS la date affichée', () => {
    const context = {
      ...base,
      sources: [
        { kind: 'market_observation', label: 'Mémoire marché Bellum', as_of: '2024-01-01T00:00:00Z' },
        { kind: 'crm', label: 'CRM', as_of: '2026-08-25T00:00:00Z' },
      ],
    } as unknown as ChatResponseContext
    // Sans l'exclusion, ce test lirait 2024-01-01 — la date la plus ancienne.
    expect(replyProvenance(context).asOf).toBe('2026-08-25T00:00:00.000Z')
  })

  it('quand SEULE une observation de mémoire marché est datée, la date reste absente', () => {
    const context = {
      ...base,
      sources: [{ kind: 'market_observation', label: 'Mémoire marché Bellum', as_of: '2024-01-01T00:00:00Z' }],
    } as unknown as ChatResponseContext
    expect(replyProvenance(context).asOf).toBeNull()
  })
})

describe('formatAsOf', () => {
  it('rend une date lisible dans la langue', () => {
    expect(formatAsOf('2026-03-12T00:00:00Z', 'fr')).toContain('mars')
    expect(formatAsOf('2026-03-12T00:00:00Z', 'en')).toContain('March')
  })

  it('sait dire NON — une valeur absente ou illisible ne fabrique pas de date', () => {
    expect(formatAsOf(null, 'fr')).toBeNull()
    expect(formatAsOf('pas une date', 'fr')).toBeNull()
  })
})

describe('replyProvenance — un tour sans outil ne porte pas de pied de sources (#3562.1)', () => {
  const withSources = {
    ...base,
    active: { ...base.active, account: { ...base.active.account, as_of: '2026-09-18T00:00:00Z' } },
    sources: [
      { kind: 'knowledge_doc', label: 'Playbook', as_of: '2026-09-18T00:00:00Z' },
      { kind: 'knowledge_doc', label: 'Guide', as_of: '2026-09-20T00:00:00Z' },
    ],
  } as unknown as ChatResponseContext

  it('aucun outil appelé : ni date ni compte — le pied ne contredit pas « aucun résultat d’outil »', () => {
    const context = { ...withSources, reasoning_trace: { tools_called: [] } } as unknown as ChatResponseContext
    const p = replyProvenance(context)
    expect(p.asOf).toBeNull()
    expect(p.sourceCount).toBeNull()
  })

  it('un outil a répondu : le pied reste', () => {
    const context = {
      ...withSources,
      reasoning_trace: { tools_called: ['get_account_briefing'] },
    } as unknown as ChatResponseContext
    const p = replyProvenance(context)
    expect(p.asOf).not.toBeNull()
    expect(p.sourceCount).toBe(2)
  })

  it('trace absente (réponse d’avant ce champ) : inchangé, jamais deviné', () => {
    expect(replyProvenance(withSources).sourceCount).toBe(2)
  })

  it('#4059 — un besoin collé (compile_need seul) n’affiche la date d’aucune autre donnée', () => {
    const context = {
      ...base,
      active: { ...base.active, account: { ...base.active.account, as_of: '2026-09-29T00:00:00Z' } },
      reasoning_trace: { tools_called: ['compile_need'] },
    } as unknown as ChatResponseContext
    expect(replyProvenance(context).asOf).toBeNull()
  })

  it('#4059 — la date du dossier reste affichée quand un outil de lecture a tourné avec', () => {
    const context = {
      ...base,
      active: { ...base.active, account: { ...base.active.account, as_of: '2026-09-29T00:00:00Z' } },
      reasoning_trace: { tools_called: ['compile_need', 'get_account'] },
    } as unknown as ChatResponseContext
    expect(replyProvenance(context).asOf).toBe('2026-09-29T00:00:00.000Z')
  })

  it('#2887.10 (r40) — le plan d’actions (calculé maintenant sur le portefeuille) n’hérite pas de la date du dossier d’un compte', () => {
    const context = {
      ...base,
      active: { ...base.active, account: { ...base.active.account, as_of: '2026-09-07T00:00:00Z' } },
      reasoning_trace: { tools_called: ['get_action_plan'] },
    } as unknown as ChatResponseContext
    expect(replyProvenance(context).asOf).toBeNull()
  })

  it('#2887.10 (r40) — mais une lecture de dossier à côté du plan garde sa date', () => {
    const context = {
      ...base,
      active: { ...base.active, account: { ...base.active.account, as_of: '2026-09-07T00:00:00Z' } },
      reasoning_trace: { tools_called: ['get_action_plan', 'get_account_briefing'] },
    } as unknown as ChatResponseContext
    expect(replyProvenance(context).asOf).toBe('2026-09-07T00:00:00.000Z')
  })

  it('G.4 (recette 19/10) — un résumé de mails (lecture en direct) n’hérite pas de la date « 11 septembre » du dossier', () => {
    for (const tool of ['search_mailbox', 'read_mail_thread', 'list_agenda', 'find_free_slots', 'prepare_day_brief']) {
      const context = {
        ...base,
        active: { ...base.active, account: { ...base.active.account, as_of: '2026-09-11T00:00:00Z' } },
        reasoning_trace: { tools_called: ['search_mailbox', tool] },
      } as unknown as ChatResponseContext
      expect(replyProvenance(context).asOf, tool).toBeNull()
    }
  })

  it('G.4 — …et sait dire non : une lecture de dossier à côté de la messagerie garde sa date', () => {
    const context = {
      ...base,
      active: { ...base.active, account: { ...base.active.account, as_of: '2026-09-11T00:00:00Z' } },
      reasoning_trace: { tools_called: ['search_mailbox', 'get_account_briefing'] },
    } as unknown as ChatResponseContext
    expect(replyProvenance(context).asOf).toBe('2026-09-11T00:00:00.000Z')
  })
})
