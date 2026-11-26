import { z } from 'zod'

/**
 * Typed payload of the Researcher agent (Phase 1) — TypeScript mirror of
 * `apps/ia/app/models/research_data.py` (which extends `ResearchOutput`).
 *
 * Convention: every key is camelCase and English. Permissive on purpose
 * (`.passthrough()`) — the Pappers overlay merges typed fields (legalForm,
 * headquartersDisplay, cities, financialsHistory, …) and an `_apiMetrics`
 * sidecar on top of the LLM output that this schema doesn't enumerate.
 *
 * ⚠️ Wire-format drift: the Python prompts still emit four legacy keys
 * (`concrete_activity`, `it_implications_for_esn`, `organigrammeLogic`,
 * `commentOuvrirCompte`). They flow through `.passthrough()` today so
 * payloads still parse, but TS consumers must use the legacy keys (cast
 * through `Record<string, unknown>`) until the prompts and Pydantic aliases
 * are aligned with this schema in a follow-up ticket.
 */

const _passThroughString = z.string().optional()
const _passThroughArray = z.array(z.unknown()).optional()

export const researchDataSchema = z
  .object({
    // Facts
    businessDescription: _passThroughString,
    sector: _passThroughString,
    employees: _passThroughString,
    revenue: z.union([z.string(), z.number()]).optional(),
    headquarters: _passThroughString,
    website: _passThroughString,
    isPublic: z.boolean().optional(),
    subsidiaries: _passThroughArray,
    entitiesExhaustive: _passThroughArray,
    sitesFrance: _passThroughArray,
    programNames: _passThroughArray,
    technologyStack: _passThroughArray,
    regulations: _passThroughArray,
    concreteActivity: _passThroughString,
    itImplicationsForEsn: _passThroughString,
    priorityScore: z.number().optional(),
    priorityJustification: _passThroughString,
    // Signals
    budgetSignals: _passThroughArray,
    recentSignals: _passThroughArray,
    competitors: _passThroughArray,
    esnSynergies: _passThroughArray,
    peopleMentioned: _passThroughArray,
    orgChartLogic: _passThroughString,
    // Strategy
    itChallenges: _passThroughArray,
    pains: _passThroughArray,
    angles: _passThroughArray,
    accountOpeningStrategy: _passThroughString,
    powerQuestions: _passThroughArray,
    objections: _passThroughArray,
    // Pappers overlay (subset — full set merged via passthrough)
    siren: _passThroughString,
    // Country pack overlay (non-FR runs only): the resolved national registry
    // identifier + its country (CIK US / corp id CA / UID CH / BCE BE / RCS LU).
    // Absent on FR runs — the pack is a strict no-op for the French default.
    registryId: _passThroughString,
    registryCountry: _passThroughString,
  })
  .passthrough()

export type ResearchData = z.infer<typeof researchDataSchema>
