import { describe, expect, it } from 'vitest'
import type { Account, AccountFactsBrief, Contact } from '@bellum/contracts'
import { buildAccountPdfData, pdfContactsCap, PDF_CONTACTS_LIMIT, PDF_SIGNALS_LIMIT } from '../normalize'

const baseAccount: Account = {
  id: '00000000-0000-0000-0000-000000000001',
  user_id: '00000000-0000-0000-0000-000000000002',
  company_name: 'ACME',
  siren: null,
  sector: 'Tech',
  employees: '1000',
  revenue: '100M',
  headquarters: 'Paris',
  website: 'https://acme.test',
  subsidiaries: [],
  it_challenges: [],
  recent_signals: [],
  priority_score: 8,
  priority_justification: null,
  raw_analysis: null,
  status: 'completed',
  error_message: null,
  user_context: null,
  api_cost_euros: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const minimalContact: Contact = {
  id: '00000000-0000-0000-0000-0000000000a1',
  account_id: baseAccount.id,
  user_id: baseAccount.user_id,
  full_name: 'Alice Martin',
  title: 'CTO',
  entity: 'ACME Corp',
  decision_role: 'sponsor',
  priority: 1,
  email: 'alice@acme.test',
  email_verified: false,
  phone: null,
  linkedin_url: null,
  locale: null,
  profile_summary: null,
  why_contact: null,
  email_message: null,
  linkedin_message: null,
  phone_script: null,
  followup_message: null,
  user_status: 'new',
  source: null,
  raw_data: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('buildAccountPdfData', () => {
  it('returns a stable shape when raw_analysis is null', () => {
    const data = buildAccountPdfData(baseAccount, [])

    expect(data.companyName).toBe('ACME')
    expect(data.priorityScore).toBe(8)
    expect(data.subsidiaries).toEqual([])
    expect(data.technologyStack).toEqual([])
    expect(data.itChallenges).toEqual([])
    expect(data.pains).toEqual([])
    expect(data.competitors).toEqual([])
    expect(data.angles).toEqual([])
    expect(data.planWeeks).toEqual([])
    expect(data.strategy).toBeNull()
    expect(data.ouvrir).toBeNull()
    expect(data.evaluation.decision).toBe('GO')
    expect(data.evaluation.score).toBe(8)
  })

  it('falls back to "Compte" when company_name is empty', () => {
    const data = buildAccountPdfData({ ...baseAccount, company_name: '' }, [])
    expect(data.companyName).toBe('Compte')
  })

  it('drops malformed items in lists but keeps valid ones', () => {
    const account: Account = {
      ...baseAccount,
      it_challenges: [
        { title: 'Modernisation SI', severity: 'critical', description: 'Legacy systems' },
        { not_a_title: 'oops' },
        'string instead of object',
        null,
        { title: 'Cybersécurité' },
      ],
    }

    const data = buildAccountPdfData(account, [])

    expect(data.itChallenges).toHaveLength(2)
    expect(data.itChallenges[0]?.title).toBe('Modernisation SI')
    expect(data.itChallenges[0]?.severity).toBe('critical')
    expect(data.itChallenges[1]?.title).toBe('Cybersécurité')
  })

  it('parses technologyStack, pains, recent_signals, competitors, angles', () => {
    const account: Account = {
      ...baseAccount,
      recent_signals: [{ date: '2025-03-01', type: 'projet', signal: 'Lance IA générative' }, { signal: 'Sans date' }],
      raw_analysis: {
        technologyStack: [
          { name: 'IA', usage: 'maintenance', maturity: 'emerging', opportunity_for_esn: 'integration IA' },
          { malformed: true },
        ],
        pains: [{ pain: 'Pannes imprévisibles', urgency: 'haute', business_impact: '300M€/an' }],
        competitors: [{ name: 'e.SNCF Solutions', strengths: 'connaissance métier', weaknesses: 'capacité limitée' }],
        angles: [{ title: 'Accélérateur IA', is_recommended: true }, { description: 'no title — dropped' }],
      },
    }

    const data = buildAccountPdfData(account, [])

    expect(data.technologyStack).toHaveLength(1)
    expect(data.technologyStack[0]?.name).toBe('IA')
    expect(data.pains).toHaveLength(1)
    expect(data.pains[0]?.pain).toBe('Pannes imprévisibles')
    expect(data.recentSignals).toHaveLength(2)
    expect(data.competitors).toHaveLength(1)
    expect(data.angles).toHaveLength(1)
    expect(data.angles[0]?.is_recommended).toBe(true)
  })

  it('parses subsidiaries and programNames as string lists, dropping non-strings', () => {
    const account: Account = {
      ...baseAccount,
      subsidiaries: ['e.SNCF Solutions', 'SNCF Renouvelables', null, 42],
      raw_analysis: {
        programNames: ['MINERVE', 'MONITOR', null, ''],
      },
    }

    const data = buildAccountPdfData(account, [])

    expect(data.subsidiaries).toEqual(['e.SNCF Solutions', 'SNCF Renouvelables'])
    expect(data.programNames).toEqual(['MINERVE', 'MONITOR'])
  })

  describe('evaluation', () => {
    // Real runs nest this under `plan.evaluation` with camelCase keys — see
    // `packages/shared/schemas/__fixtures__/real-run-sg.raw.json`. The PDF used
    // to read only a root-level `evaluation_compte`, which no run ever emits, so
    // every exported PDF silently fell back to the bare priority score.
    it('reads the decision and justification from plan.evaluation', () => {
      const account: Account = {
        ...baseAccount,
        priority_score: 5,
        raw_analysis: { plan: { evaluation: { goNoGo: 'NO-GO', globalScore: 6, justification: 'risk' } } },
      }
      const data = buildAccountPdfData(account, [])
      expect(data.evaluation.decision).toBe('NO-GO')
      expect(data.evaluation.justification).toBe('risk')
    })

    it('still reads the legacy root-level evaluation_compte block', () => {
      const account: Account = {
        ...baseAccount,
        priority_score: 5,
        raw_analysis: { evaluation_compte: { go_no_go: 'NO-GO', justification: 'legacy shape' } },
      }
      const data = buildAccountPdfData(account, [])
      expect(data.evaluation.decision).toBe('NO-GO')
      expect(data.evaluation.justification).toBe('legacy shape')
    })

    // Precedence mirrors the on-screen evaluation tab (`evaluationViewData.ts`):
    // the account's own `priority_score` column wins, and the evaluation block
    // only supplies a score when that column is unset. A PDF that disagreed with
    // the screen would be a bug.
    it('prefers priority_score over the evaluation score, like the screen does', () => {
      const account: Account = {
        ...baseAccount,
        priority_score: 5,
        raw_analysis: { plan: { evaluation: { goNoGo: 'NO-GO', globalScore: 6 } } },
      }
      expect(buildAccountPdfData(account, []).evaluation.score).toBe(5)
    })

    it('falls back to the evaluation score when priority_score is unset', () => {
      const account: Account = {
        ...baseAccount,
        priority_score: null,
        raw_analysis: { plan: { evaluation: { goNoGo: 'GO', globalScore: 6 } } },
      }
      expect(buildAccountPdfData(account, []).evaluation.score).toBe(6)
    })

    it('falls back to GO when score >= 7 and no explicit decision', () => {
      const account: Account = { ...baseAccount, priority_score: 7 }
      const data = buildAccountPdfData(account, [])
      expect(data.evaluation.decision).toBe('GO')
    })

    it('falls back to NO-GO when score < 7 and no explicit decision', () => {
      const account: Account = { ...baseAccount, priority_score: 5 }
      const data = buildAccountPdfData(account, [])
      expect(data.evaluation.decision).toBe('NO-GO')
    })

    it('reads priority_justification.overall when raw_analysis has no justification', () => {
      const account: Account = {
        ...baseAccount,
        priority_justification: '{"overall":"strong fit"}' as unknown as null,
        raw_analysis: { evaluationCompte: {} },
      }
      // priority_justification is typed string|null but the IA service sometimes
      // stores a structured object — we must read .overall in that case.
      const objAccount = { ...account, priority_justification: { overall: 'strong fit' } as unknown as string | null }
      const data = buildAccountPdfData(objAccount, [])
      expect(data.evaluation.justification).toBe('strong fit')
    })
  })

  /*
   * Regression tests for the shape real analyses actually persist. Everything
   * plan-related lives under `raw_analysis.plan`; the PDF used to look only at
   * the root, so exported PDFs came out with no action plan and no strategy on
   * every real account while the on-screen plan tab rendered them fine.
   */
  describe('real persisted shape (raw_analysis.plan)', () => {
    const realShapeAccount: Account = {
      ...baseAccount,
      raw_analysis: {
        plan: {
          actionPlan: {
            strategy: 'Entrée par les filiales',
            justification: 'Panel groupe fermé',
            phases: [
              {
                name: 'IMMEDIAT',
                title: 'Semaine 1 — Amorçage',
                actions: [{ action: 'Contacter le DSI', channel: 'email', contact: 'Hamza' }],
              },
            ],
          },
        },
      },
    }

    it('reads the action plan phases from plan.actionPlan.phases', () => {
      const data = buildAccountPdfData(realShapeAccount, [])
      expect(data.planWeeks).toHaveLength(1)
      expect(data.planWeeks[0]?.name).toBe('IMMEDIAT')
      expect(data.planWeeks[0]?.title).toBe('Semaine 1 — Amorçage')
      expect(data.planWeeks[0]?.actions?.[0]?.action).toBe('Contacter le DSI')
    })

    it('reads the strategy from plan.actionPlan', () => {
      const data = buildAccountPdfData(realShapeAccount, [])
      expect(data.strategy).toEqual({
        type: 'Entrée par les filiales',
        justification: 'Panel groupe fermé',
      })
    })

    // `comment_ouvrir_compte` is a plain string in real runs; the object form
    // with `entry_points` is the richer variant. The string form was dropped.
    it('accepts comment_ouvrir_compte as a plain string', () => {
      const account: Account = {
        ...baseAccount,
        raw_analysis: { comment_ouvrir_compte: 'Passer par la filiale IT, pas par le groupe.' },
      }
      const data = buildAccountPdfData(account, [])
      expect(data.ouvrir).toEqual({ strategy: 'Passer par la filiale IT, pas par le groupe.', entryPoints: [] })
    })

    it('still accepts comment_ouvrir_compte as an object with entry points', () => {
      const account: Account = {
        ...baseAccount,
        raw_analysis: {
          comment_ouvrir_compte: {
            strategy: 'Entrée filiale',
            entry_points: [{ label: 'DSI SGTM', target_profile: 'DSI', justification: 'budget propre' }],
          },
        },
      }
      const data = buildAccountPdfData(account, [])
      expect(data.ouvrir?.strategy).toBe('Entrée filiale')
      expect(data.ouvrir?.entryPoints).toHaveLength(1)
      expect(data.ouvrir?.entryPoints[0]?.label).toBe('DSI SGTM')
    })

    it('reads snake_case program_names and technology_stack (persisted shape)', () => {
      const account: Account = {
        ...baseAccount,
        raw_analysis: {
          program_names: ['MINERVE', 'MONITOR'],
          technology_stack: [{ name: 'SAP', usage: 'ERP' }],
        },
      }
      const data = buildAccountPdfData(account, [])
      expect(data.programNames).toEqual(['MINERVE', 'MONITOR'])
      expect(data.technologyStack).toHaveLength(1)
      expect(data.technologyStack[0]?.name).toBe('SAP')
    })
  })

  it('reads planHebdomadaire.weeks (preferred) and falls back to raw.weeks', () => {
    const account: Account = {
      ...baseAccount,
      raw_analysis: {
        planHebdomadaire: {
          weeks: [{ week: 1, title: 'Découverte', actions: [{ text: 'Appel CTO', responsable: 'Alice' }] }],
        },
      },
    }
    const data = buildAccountPdfData(account, [])
    expect(data.planWeeks).toHaveLength(1)
    expect(data.planWeeks[0]?.title).toBe('Découverte')
    expect(data.planWeeks[0]?.actions?.[0]?.text).toBe('Appel CTO')
  })

  it('exposes only the contact fields the PDF actually renders', () => {
    const data = buildAccountPdfData(baseAccount, [minimalContact])
    expect(data.contacts).toHaveLength(1)
    const c = data.contacts[0]!
    expect(c).toMatchObject({
      id: minimalContact.id,
      full_name: 'Alice Martin',
      title: 'CTO',
      entity: 'ACME Corp',
      decision_role: 'sponsor',
      priority: 1,
      email: 'alice@acme.test',
    })
    // Sensitive/heavy fields stripped from the PDF view.
    expect(c).not.toHaveProperty('raw_data')
    expect(c).not.toHaveProperty('email_message')
  })
})

/**
 * ⚠️ Un verdict ne se conclut pas d'un SILENCE — défaut trouvé le 31/08/2026.
 *
 * Un compte jamais évalué a un score de 0, et le PDF en concluait « NO-GO » :
 * le document qui part chez le client annonçait un refus argumenté là où
 * personne n'avait rien jugé. Indistinguable d'un vrai NO-GO, donc pire qu'une
 * page vide.
 *
 * L'écran, lui, avait déjà la branche (`evaluationViewData.ts` rend
 * « À QUALIFIER » quand le score vaut 0). Deux dérivations du même verdict,
 * dont une seule connaissait le cas.
 */
describe('un compte jamais évalué ne conclut pas', () => {
  it('rend A_QUALIFIER plutôt que NO-GO quand rien n’a été évalué', () => {
    const account: Account = { ...baseAccount, priority_score: null, raw_analysis: {} }
    expect(buildAccountPdfData(account, []).evaluation.decision).toBe('A_QUALIFIER')
  })

  it('rend A_QUALIFIER sur un score à zéro SANS verdict explicite', () => {
    const account: Account = { ...baseAccount, priority_score: 0, raw_analysis: {} }
    expect(buildAccountPdfData(account, []).evaluation.decision).toBe('A_QUALIFIER')
  })

  it('respecte un NO-GO EXPLICITE, même à score nul — là, quelqu’un a jugé', () => {
    const account: Account = {
      ...baseAccount,
      priority_score: 0,
      raw_analysis: { evaluation: { go_no_go: 'NO-GO', justification: 'jugé, et refusé' } },
    }
    expect(buildAccountPdfData(account, []).evaluation.decision).toBe('NO-GO')
  })

  it('ne change RIEN à un compte réellement évalué sous le seuil', () => {
    const account: Account = { ...baseAccount, priority_score: 3, raw_analysis: {} }
    expect(buildAccountPdfData(account, []).evaluation.decision).toBe('NO-GO')
  })
})

/**
 * #4073.1 (13/10/2026) — le dossier PDF reçoit les faits du compte (#4069),
 * datés et typés, JAMAIS la provenance — même lecteur que l'export CSV d'une
 * liste cible (#4073, 12/10) et la fiche de préparation de RDV (#4072.3).
 */
describe('buildAccountPdfData — faits du compte', () => {
  const factsBrief: AccountFactsBrief = {
    asOf: '2026-10-13T08:00:00Z',
    deals: [{ date: '2024-03-01T00:00:00Z', kind: 'deal_lost', label: 'Refonte SI RH' }],
    missions: [{ date: '2023-01-15T00:00:00Z', kind: 'mission', label: 'Audit infra' }],
    recurringNeeds: [{ label: 'Besoin DevOps', occurrences: 2, lastDate: '2026-09-01T00:00:00Z' }],
    exchanges: [{ date: '2026-08-20T00:00:00Z', kind: 'exchange', label: 'Relance — point budget' }],
  }

  it('est absent (`null`) quand aucun brief n’est passé — rien à inventer', () => {
    expect(buildAccountPdfData(baseAccount, []).facts).toBeNull()
  })

  it('porte le brief tel que lu, sans rien recalculer', () => {
    const data = buildAccountPdfData(baseAccount, [], factsBrief)
    expect(data.facts).toEqual(factsBrief)
  })

  it('redescend à `null` quand le brief est vide — une absence ne fait aucune ligne', () => {
    const empty: AccountFactsBrief = {
      asOf: factsBrief.asOf,
      deals: [],
      missions: [],
      recurringNeeds: [],
      exchanges: [],
    }
    expect(buildAccountPdfData(baseAccount, [], empty).facts).toBeNull()
  })
})

describe('buildAccountPdfData — compte à 1 200 contacts (#4073)', () => {
  const roles = ['user', 'blocker', 'influencer', 'economic', 'technical', 'champion', 'procurement'] as const
  const many: Contact[] = Array.from({ length: 1200 }, (_, i) => ({
    ...minimalContact,
    id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    full_name: `Contact ${i}`,
    decision_role: roles[i % roles.length]!,
    priority: (i % 5) + 1,
  }))

  it('plafonne les contacts du PDF et garde le total réel', () => {
    const data = buildAccountPdfData(baseAccount, many)
    expect(data.contacts).toHaveLength(PDF_CONTACTS_LIMIT)
    expect(data.contactsTotal).toBe(1200)
  })

  it('met les décideurs et influenceurs avant les profils métier', () => {
    const data = buildAccountPdfData(baseAccount, many)
    const rank = (r: string | null | undefined) => (r === 'user' || r === 'blocker' ? 1 : 0)
    const ranks = data.contacts.map(c => rank(c.decision_role))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })

  it('ne coupe rien sous le plafond', () => {
    const data = buildAccountPdfData(baseAccount, many.slice(0, 3))
    expect(data.contacts).toHaveLength(3)
    expect(data.contactsTotal).toBe(3)
  })

  // #4292.13 — le PDF annonce son plafond : « 40 contacts sur 1 200 » ; sous le plafond, rien à dire.
  it('nomme le plafond quand le compte le dépasse', () => {
    const data = buildAccountPdfData(baseAccount, many)
    expect(pdfContactsCap(data)).toEqual({ shown: PDF_CONTACTS_LIMIT, total: 1200, hidden: 1200 - PDF_CONTACTS_LIMIT })
  })

  it('ne dit rien sous le plafond ni pile au plafond (jamais « 40 sur 40 »)', () => {
    expect(pdfContactsCap(buildAccountPdfData(baseAccount, many.slice(0, 3)))).toBeNull()
    expect(pdfContactsCap(buildAccountPdfData(baseAccount, many.slice(0, PDF_CONTACTS_LIMIT)))).toBeNull()
    expect(pdfContactsCap(buildAccountPdfData(baseAccount, many.slice(0, PDF_CONTACTS_LIMIT + 1)))).not.toBeNull()
  })

  it('plafonne aussi les signaux récents', () => {
    const signals = Array.from({ length: 200 }, (_, i) => ({ signal: `s${i}` }))
    const data = buildAccountPdfData({ ...baseAccount, recent_signals: signals }, [])
    expect(data.recentSignals).toHaveLength(PDF_SIGNALS_LIMIT)
  })
})
