import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `interlocuteurs` du stage `target_market` — lot L17 (#2043).
 *
 * #2043.1/.2 (interlocuteurs habituels, décideurs/opérationnels/managers) et
 * #2043.3/.4 (achats/RH/recrutement, DSI/métiers/partenaires) sont déjà là ou
 * déjà résolus via `decision_maker_personas` (Temps 2 + profil progressif) —
 * cette sous-étape ne les repose pas (GA-26). Elle pose ce qui manquait :
 * trois questions sur l'accès RÉEL au compte, au-delà de qui on VISE.
 */
export const interlocuteursStep: SubStep = {
  slug: 'interlocuteurs',
  questions: [
    {
      key: 'real_response_level',
      kind: 'single',
      label: 'questions.realResponseLevel.label',
      subtitle: 'questions.realResponseLevel.subtitle',
      choices: choice(
        'Niveau exécutif (COMEX / CODIR)',
        'Niveau management intermédiaire',
        'Niveau opérationnel',
        'Variable selon le compte',
      ),
    },
    {
      key: 'budget_validator',
      kind: 'single',
      label: 'questions.budgetValidator.label',
      choices: choice(
        'Le décideur rencontré directement',
        'Un niveau direction générale (COMEX)',
        'Les achats, après validation technique',
        'Variable selon le compte ou le montant',
      ),
    },
    {
      key: 'access_orienteur',
      kind: 'single',
      label: 'questions.accessOrienteur.label',
      choices: choice(
        'Un sponsor interne déjà identifié',
        'Le contact opérationnel du moment',
        "Aucun, c'est notre prospection qui identifie l'entrée",
        'Un partenaire ou un intermédiaire',
      ),
    },
  ],
}
