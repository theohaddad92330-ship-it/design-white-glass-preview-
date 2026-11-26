import { TEMPS2_ANSWER_OPTIONS } from '@bellum/contracts'
import type { Question } from '@/features/onboarding/lib/questions'

/**
 * Temps 2 — le complément de profil, posé APRÈS la première analyse terminée.
 *
 * Pourquoi après : à froid, un commercial bâcle « quel est votre TJM moyen ? ».
 * Une fois qu'il a VU un dossier, la même question a un sens — il sait ce que
 * Bellum en fera. Le Temps 1 (11 questions à l'inscription) ne bouge pas.
 *
 * Deux règles tenues ici :
 *  1. **Chaque question dit ce qu'elle améliore** (`impact`) — on ne demande
 *     jamais un effort sans contrepartie visible ;
 *  2. **Chaque réponse est lue quelque part.** Les 5 clés atterrissent dans
 *     `profile_data` (`esnAnswersToProfileData`) et sont imprimées dans les
 *     prompts Claude — voir `TEMPS2_ANSWER_KEYS` côté contracts pour la liste
 *     exacte des consommateurs. Une question sans consommateur ne serait pas
 *     ici : c'est le motif « capturé ≠ consommé » que ce produit a déjà
 *     fabriqué cinq fois.
 *
 * Comme en Temps 1, les `value` sont persistées verbatim (colonnes
 * `esn_profiles`, pattern-matchées en français par les prompts) : elles ne sont
 * JAMAIS traduites. Seuls `label`/`subtitle`/`impact` sont des clés i18n.
 */

/** A Temps-2 question + the one-liner telling the rep what it improves. */
type ComplementQuestion = Question & { impact: string }

const choices = (values: readonly string[]) => values.map(value => ({ value }))

export const COMPLEMENT_QUESTIONS: ComplementQuestion[] = [
  {
    key: 'decision_maker_personas',
    kind: 'multi',
    label: 'complement.questions.personas.label',
    subtitle: 'complement.questions.personas.subtitle',
    impact: 'complement.questions.personas.impact',
    allowOther: true,
    choices: choices(TEMPS2_ANSWER_OPTIONS.decision_maker_personas),
  },
  {
    key: 'avg_sales_cycle',
    kind: 'single',
    label: 'complement.questions.salesCycle.label',
    subtitle: 'complement.questions.salesCycle.subtitle',
    impact: 'complement.questions.salesCycle.impact',
    choices: choices(TEMPS2_ANSWER_OPTIONS.avg_sales_cycle),
  },
  {
    key: 'avg_tjm',
    kind: 'single',
    label: 'complement.questions.avgTjm.label',
    subtitle: 'complement.questions.avgTjm.subtitle',
    impact: 'complement.questions.avgTjm.impact',
    // Machine-ish values (« 550-700 », sans symbole) : les prompts rendent
    // « TJM moyen : {avgTJM} EUR ». L'affichage passe donc par `labelKey`.
    choices: TEMPS2_ANSWER_OPTIONS.avg_tjm.map(value => ({
      value,
      labelKey: `complement.questions.avgTjm.options.${value}`,
    })),
    // #2548.2 (#2027.1) — `allowUnknown` n'est PAS posé ici : Temps 2 se
    // rend via `ProfileQuestionnaireDialog.tsx`, qui appelle `QuestionField`
    // directement sans passer par `SubStepQuestions.tsx` — le seul endroit
    // qui affiche `UnknownAnswerChoices`. Poser le flag sans son lecteur
    // serait une métadonnée morte (« capturé ≠ consommé », doctrine de ce
    // fichier). Câbler Temps 2 sur le mécanisme #2027 est HORS de ce lot :
    // voir le registre #2548.
    // allowUnknown: true,
  },
  {
    key: 'client_references',
    kind: 'tags',
    label: 'complement.questions.references.label',
    subtitle: 'complement.questions.references.subtitle',
    impact: 'complement.questions.references.impact',
    placeholder: 'complement.questions.references.placeholder',
  },
  {
    key: 'no_go_sectors',
    kind: 'multi',
    label: 'complement.questions.noGoSectors.label',
    subtitle: 'complement.questions.noGoSectors.subtitle',
    impact: 'complement.questions.noGoSectors.impact',
    allowOther: true,
    choices: choices(TEMPS2_ANSWER_OPTIONS.no_go_sectors),
  },
]
