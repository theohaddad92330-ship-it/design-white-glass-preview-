import { describe, expect, it } from 'vitest'
import type { ChatResponseContext } from './ContextDisclosure'
import { replySourceBasis } from './reply-source-basis'

function base(overrides: Partial<ChatResponseContext> = {}): ChatResponseContext {
  return {
    active: {
      profile: { present: false, name: null },
      account: { present: false, name: null },
      contacts_count: 0,
      plan: { present: false },
      portfolio: { present: false, count: 0 },
      memory: { pinned_facts: 0, has_summary: false },
    },
    sources: [],
    not_consulted: [],
    ...overrides,
  }
}

describe('replySourceBasis — le fondement d’une réponse, en quatre natures', () => {
  it('sans contexte : rien, jamais un pied inventé', () => {
    expect(replySourceBasis(undefined)).toBeNull()
  })

  it('classe les sources par nature : mémoire marché, web récent, espace/connecteurs, inférence', () => {
    const basis = replySourceBasis(
      base({
        sources: [
          { kind: 'market_observation', label: 'a' },
          { kind: 'market_signal', label: 'b' },
          { kind: 'crm', label: 'c' },
          { kind: 'method_rule', label: 'd' },
        ],
      }),
    )
    expect(basis?.foundations).toEqual(['market_memory', 'recent_web', 'workspace', 'inference'])
  })

  it('préfère le reçu de connaissance : seules les couches CONSULTÉES comptent', () => {
    const layer = (status: 'consulted' | 'not_requested' | 'unavailable' | 'forbidden_by_mode') => ({ status })
    const basis = replySourceBasis(
      base({
        knowledge_receipt: {
          workspace: layer('consulted'),
          crm: layer('unavailable'),
          messaging: layer('not_requested'),
          agenda: layer('not_requested'),
          documents: layer('not_requested'),
          account_dossier: layer('not_requested'),
          dataforge: layer('not_requested'),
          market_memory: layer('not_requested'),
          current_public_sources: layer('consulted'),
          bellum_method: layer('not_requested'),
          inference: layer('not_requested'),
        },
      } as Partial<ChatResponseContext>),
    )
    expect(basis?.foundations).toEqual(['recent_web', 'workspace'])
  })

  it('périmètre : le compte ouvert, le portefeuille et les portées des sources', () => {
    const basis = replySourceBasis(
      base({
        active: {
          profile: { present: false, name: null },
          account: { present: true, name: 'Acme' },
          contacts_count: 0,
          plan: { present: false },
          portfolio: { present: true, count: 3, total: 12 },
          memory: { pinned_facts: 0, has_summary: false },
        },
        sources: [{ kind: 'crm', label: 'c', scope: 'secteur banque' }],
      }),
    )
    expect(basis?.scope).toEqual({ account: 'Acme', portfolio: { count: 3, total: 12 }, scopes: ['secteur banque'] })
  })

  /**
   * #3893.1 (recette prod 08/10, W 5b4b10d2f3) — le pied « Périmètre : 40
   * comptes du portefeuille sur 52 » persistait sur une question Sanofi
   * MONO-COMPTE, posée dans une conversation « Tout mon espace » (jamais
   * scopée à un compte — `active.account.present` reste `false`). Signal
   * manquant (lot Y05, nommé « reste ») : « cette réponse-ci concerne CETTE
   * entreprise », distinct d'`active.account` qui ne s'active que pour une
   * conversation SCOPÉE compte.
   *
   * Signal retenu : `get_account_briefing` cite déjà UNE source
   * `account_dossier` par appel (`chat_tools.py::cited_sources`), avec
   * `label` = le nom du compte — jamais un second calcul, la même donnée que
   * le panneau « Voir la source » lit déjà. Une seule étiquette `account_dossier`
   * distincte ⇒ CETTE réponse porte sur UN compte, même sans scope de
   * conversation. `compare_accounts` en cite PLUSIEURS (une par compte
   * comparé) : la condition ne se déclenche jamais sur une comparaison.
   */
  it('#3893.1 — une réponse mono-compte (get_account_briefing) nomme SON compte, même hors conversation scopée', () => {
    const basis = replySourceBasis(
      base({
        active: {
          profile: { present: false, name: null },
          account: { present: false, name: null },
          contacts_count: 0,
          plan: { present: false },
          portfolio: { present: true, count: 40, total: 52 },
          memory: { pinned_facts: 0, has_summary: false },
        },
        sources: [{ kind: 'account_dossier', label: 'Sanofi', as_of: '2026-10-08T00:00:00Z' }],
      }),
    )
    // Le compte de LA RÉPONSE remplace le reste de portefeuille — jamais les deux.
    expect(basis?.scope).toEqual({ account: 'Sanofi', portfolio: null, scopes: [] })
  })

  it('#3893.1 — une comparaison (plusieurs comptes cités) ne dérive PAS un compte unique : le portefeuille reste', () => {
    const basis = replySourceBasis(
      base({
        active: {
          profile: { present: false, name: null },
          account: { present: false, name: null },
          contacts_count: 0,
          plan: { present: false },
          portfolio: { present: true, count: 40, total: 52 },
          memory: { pinned_facts: 0, has_summary: false },
        },
        sources: [
          { kind: 'account_dossier', label: 'Sanofi' },
          { kind: 'account_dossier', label: 'Société Générale' },
        ],
      }),
    )
    expect(basis?.scope).toEqual({ account: null, portfolio: { count: 40, total: 52 }, scopes: [] })
  })

  // #3764 / #3861 (Louis, 11/10) — la complétude n'est PAS dérivée : la ligne « Complétude » n'existe plus.
  it('ne dérive aucune complétude, quelle que soit la situation (non consultées, tour partiel, rien)', () => {
    for (const context of [
      base({ not_consulted: ['HubSpot'] }),
      base({ partial: { reason: 'turn_error' } }),
      base({ not_consulted: [] }),
    ]) {
      const basis = replySourceBasis(context)
      expect(basis).not.toBeNull()
      expect(Object.keys(basis ?? {}).sort()).toEqual(['certainty', 'foundations', 'scope', 'undatedFreshness'])
    }
  })

  it('certitude : le palier le plus BAS porté par les sources, jamais un pourcentage ; absent = null', () => {
    const sources = [
      { kind: 'crm', label: 'a', confidence: 'high' as const },
      { kind: 'crm', label: 'b', confidence: 'low' as const },
    ]
    expect(replySourceBasis(base({ sources }))?.certainty).toBe('low')
    expect(replySourceBasis(base({ sources: [{ kind: 'crm', label: 'a' }] }))?.certainty).toBeNull()
  })

  it('fraîcheur non datée : nommée quand des sources existent sans date', () => {
    expect(replySourceBasis(base({ sources: [{ kind: 'crm', label: 'a' }] }))?.undatedFreshness).toBe(true)
    expect(
      replySourceBasis(base({ sources: [{ kind: 'crm', label: 'a', as_of: '2026-09-01T00:00:00Z' }] }))
        ?.undatedFreshness,
    ).toBe(false)
  })

  it('#3893.4 — une source sans date n’efface pas les dates des autres sources', () => {
    // Une source non datée mêlée à des sources datées ne doit ni annuler le
    // calcul de fraîcheur (`asOf` reste la plus récente des sources datées,
    // reply-provenance.ts:63-88) ni déclencher « Fraîcheur : source non datée »
    // puisqu'au moins un fait de la réponse reste daté.
    const sources = [
      { kind: 'crm', label: 'CRM', as_of: null },
      { kind: 'crm', label: 'Dossier', as_of: '2026-09-01T00:00:00Z' },
    ]
    expect(replySourceBasis(base({ sources }))?.undatedFreshness).toBe(false)
  })

  it('un tour sans outil lu : pas de fondement externe', () => {
    const basis = replySourceBasis(base({ reasoning_trace: { tools_called: [] } }))
    expect(basis?.foundations).toEqual([])
  })
})
