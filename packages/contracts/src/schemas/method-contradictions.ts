import { z } from 'zod'
import { PLAN_ACTION_CHANNELS } from './action-plan-items.js'

/**
 * #3382 — la hiérarchie explicite entre les sources méthodologiques, et le
 * REGISTRE DES CONTRADICTIONS qui en découle.
 *
 * Le produit a plusieurs générations de textes, de scripts et d'instructions qui
 * peuvent se contredire. Jusqu'ici, c'était la proximité de quelques mots qui
 * décidait SILENCIEUSEMENT laquelle gagnait. Ce module nomme les six niveaux de
 * source (du plus au moins prioritaire) et enregistre, pour chaque contradiction
 * trouvée dans le dépôt, UNE décision par canal et par condition — jamais
 * laissée au modèle.
 *
 * Il ne remplace pas `METHOD_CORPUS_V1` (`./method-corpus.ts`, le corpus de
 * RÈGLES versionné, GA-26) : celui-ci porte les règles, ce registre porte les
 * CONFLITS entre deux sources qui disent des choses incompatibles. Chaque entrée
 * cite des sources qui EXISTENT dans le dépôt — aucune contradiction inventée
 * pour remplir le registre.
 */

/** Du plus prioritaire au moins prioritaire : l'index EST le rang. */
export const METHOD_SOURCE_TIERS = [
  'invariant',
  'doctrine',
  'approved_script',
  'workspace_method',
  'historical_example',
  'experimental_or_obsolete',
] as const
const methodSourceTierSchema = z.enum(METHOD_SOURCE_TIERS)

const METHOD_SOURCE_STATUSES = ['canonical', 'complementary', 'client_specific', 'historical', 'superseded'] as const

const methodContradictionSourceSchema = z.object({
  /** Fichier:ligne ou document daté — une source qu'on peut ouvrir. */
  ref: z.string().min(1),
  tier: methodSourceTierSchema,
  status: z.enum(METHOD_SOURCE_STATUSES),
  statement: z.string().min(1),
})

const methodContradictionDecisionSchema = z.object({
  /** `[]` = tous les canaux. */
  channels: z.array(z.enum(PLAN_ACTION_CHANNELS)).readonly(),
  /** Quand la décision vaut (`null` = toujours). */
  condition: z.string().min(1).nullable(),
  winner_ref: z.string().min(1),
  decision: z.string().min(1),
})

export const methodContradictionSchema = z
  .object({
    contradiction_id: z.string().min(1),
    title: z.string().min(1),
    version: z.string().min(1),
    decided_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    origin: z.string().min(1),
    sources: z.array(methodContradictionSourceSchema).min(2),
    decisions: z.array(methodContradictionDecisionSchema).min(1),
  })
  .superRefine((entry, ctx) => {
    const byRef = new Map(entry.sources.map(source => [source.ref, source]))
    entry.decisions.forEach((decision, index) => {
      const winner = byRef.get(decision.winner_ref)
      if (!winner) {
        ctx.addIssue({ code: 'custom', path: ['decisions', index, 'winner_ref'], message: 'Gagnant hors sources.' })
        return
      }
      if (winner.status === 'superseded' || winner.status === 'historical') {
        ctx.addIssue({
          code: 'custom',
          path: ['decisions', index, 'winner_ref'],
          message: 'Une source remplacée ou historique ne peut pas gagner.',
        })
      }
    })
    // Deux décisions de même condition dont les canaux se croisent : le modèle
    // devrait choisir — c'est exactement ce que le registre interdit.
    for (let i = 0; i < entry.decisions.length; i++) {
      for (let j = i + 1; j < entry.decisions.length; j++) {
        const a = entry.decisions[i]!
        const b = entry.decisions[j]!
        const overlap =
          a.channels.length === 0 || b.channels.length === 0 || a.channels.some(c => b.channels.includes(c))
        if (a.condition === b.condition && overlap) {
          ctx.addIssue({ code: 'custom', path: ['decisions', j], message: 'Décisions qui se recouvrent.' })
        }
      }
    }
  })
export type MethodContradiction = z.infer<typeof methodContradictionSchema>

const LOI_DE_2026_08_02 = 'agent_docs/addendum-final-2026-08-02.md:86'

export const METHOD_CONTRADICTIONS: readonly MethodContradiction[] = [
  {
    contradiction_id: 'ouverture_j_espere_que_vous_allez_bien',
    title: '« J’espère que vous allez bien » en ouverture',
    version: '1.0.0',
    decided_at: '2026-09-30',
    origin: 'Recette #3382 ; instance trouvée dans apps/ia/app/prompts/bellum_outreach.py:122',
    sources: [
      {
        ref: 'apps/ia/app/prompts/bellum_outreach.py:122 (consigne de sortie, avant correction)',
        tier: 'historical_example',
        status: 'superseded',
        statement: 'La consigne de sortie demandait de commencer par « J’espère que vous allez bien ».',
      },
      {
        ref: `${LOI_DE_2026_08_02} + apps/ia/app/prompts/bellum_outreach.py:42`,
        tier: 'doctrine',
        status: 'canonical',
        statement:
          '« J’espère que vous allez bien » est conditionné à un historique réel : sur un premier contact, il signale l’envoi de masse.',
      },
    ],
    decisions: [
      {
        channels: [],
        condition: 'premier contact sans historique',
        winner_ref: `${LOI_DE_2026_08_02} + apps/ia/app/prompts/bellum_outreach.py:42`,
        decision:
          'Jamais en ouverture d’un premier contact : on commence par le pourquoi de ce message, adressé à cette personne.',
      },
      {
        channels: [],
        condition: 'historique réel avec la personne',
        winner_ref: `${LOI_DE_2026_08_02} + apps/ia/app/prompts/bellum_outreach.py:42`,
        decision: 'Permis, seulement parce qu’un historique réel avec cette personne existe et peut être cité.',
      },
    ],
  },
  {
    contradiction_id: 'script_appel_referencement_affirme',
    title: '« Nous sommes référencés » affirmé dans le script d’appel',
    version: '1.0.0',
    decided_at: '2026-09-30',
    origin: 'Recette #3382 ; script d’appel variante A (#3442)',
    sources: [
      {
        ref: 'apps/ia/app/knowledge/content_library.py:105 (corps du script, « Nous sommes {{référencés}} »)',
        tier: 'approved_script',
        status: 'complementary',
        statement: 'Le script affirme le référencement en ouverture.',
      },
      {
        ref: 'apps/ia/app/knowledge/content_library.py:109-113 (conditions du même script) + CLAUDE.md « JAMAIS de données fictives »',
        tier: 'invariant',
        status: 'canonical',
        statement: 'Le référencement doit être réel ; aucun référencement ne peut être suggéré sans preuve.',
      },
    ],
    decisions: [
      {
        channels: ['phone'],
        condition: 'référencement prouvé',
        winner_ref:
          'apps/ia/app/knowledge/content_library.py:109-113 (conditions du même script) + CLAUDE.md « JAMAIS de données fictives »',
        decision: 'La phrase peut être dite, avec le nom du référencement réel.',
      },
      {
        channels: ['phone'],
        condition: 'référencement non prouvé',
        winner_ref:
          'apps/ia/app/knowledge/content_library.py:109-113 (conditions du même script) + CLAUDE.md « JAMAIS de données fictives »',
        decision: 'La phrase est retirée : aucun référencement n’est suggéré ni affirmé sans preuve.',
      },
    ],
  },
  {
    contradiction_id: 'clause_aucune_demarche_commerciale',
    title: '« Ma démarche n’est pas commerciale » dans le script d’appel',
    version: '1.0.0',
    decided_at: '2026-09-30',
    origin: 'Recette #3382 ; script d’appel variante A (#3442) contre l’addendum du 02/08',
    sources: [
      {
        ref: 'apps/ia/app/knowledge/content_library.py:105 (« Ma démarche n’est pas commerciale »)',
        tier: 'approved_script',
        status: 'superseded',
        statement: 'Le script annonce que la démarche n’est pas commerciale.',
      },
      {
        ref: 'agent_docs/addendum-final-2026-08-02.md:87',
        tier: 'doctrine',
        status: 'canonical',
        statement: 'La clause « aucune démarche commerciale » est supprimée des trois prompts.',
      },
    ],
    decisions: [
      {
        channels: [],
        condition: null,
        winner_ref: 'agent_docs/addendum-final-2026-08-02.md:87',
        decision: 'La clause n’est jamais écrite ni dite : la démarche est commerciale et se présente comme telle.',
      },
    ],
  },
].map(entry => methodContradictionSchema.parse(entry))

/**
 * La décision qui s’applique à CE canal et à CETTE condition — ou `null`.
 * Jamais une décision « la plus proche » : une condition inconnue n’est pas
 * réglée ici, et l’appelant le dit au lieu de laisser le modèle trancher.
 */
export function resolveMethodContradiction(
  contradictionId: string,
  situation: { readonly channel: (typeof PLAN_ACTION_CHANNELS)[number]; readonly condition: string | null },
): MethodContradiction['decisions'][number] | null {
  const entry = METHOD_CONTRADICTIONS.find(candidate => candidate.contradiction_id === contradictionId)
  if (!entry) return null
  return (
    entry.decisions.find(
      decision =>
        decision.condition === situation.condition &&
        (decision.channels.length === 0 || decision.channels.includes(situation.channel)),
    ) ?? null
  )
}
