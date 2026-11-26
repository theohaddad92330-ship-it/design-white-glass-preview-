import type { SubStep } from './types'

/**
 * Sous-étape `question-ouverte` du stage `goals` — #2060 (« QUESTIONNAIRE —
 * CE QUE BELLUMAI DOIT ABSOLUMENT SAVOIR — P0 »).
 *
 * AJOUTÉE EN FIN du dernier stage (#2060.1 : « Terminer par la question
 * ouverte », libellé exact de l'issue) : le parcours Temps-1 se ferme sur un
 * texte libre, jamais sur un choix fermé.
 *
 * Les huit amorces (#2060.2 → .8) vivent dans le `subtitle` — de l'aide, pas
 * des `suggestions` cliquables : cliquer une suggestion en ferait la réponse
 * VERBATIM (`Question` — types.ts, #2088.20), alors que ces huit mots sont
 * des PISTES, pas des réponses à choisir.
 *
 * #2060.9 (« Laura reformule, l'utilisateur valide avant enregistrement »)
 * et #2060.10 (jamais transformé en plusieurs faits certains) sont portés
 * par le contrat (`answers-complement-libre.ts`) et sa garde
 * (`apps/api/src/architecture/uncovered-activity-note-stays-opaque.spec.ts`)
 * — cette sous-étape ne fait QUE poser la question, comme `frein_attempted`
 * pose la sienne : le clic sur « Continuer » EST la confirmation (#2020.14,
 * même règle).
 */
export const questionOuverteStep: SubStep = {
  slug: 'question-ouverte',
  questions: [
    {
      key: 'uncovered_activity_note',
      kind: 'text',
      label: 'questions.uncoveredActivityNote.label',
      subtitle: 'questions.uncoveredActivityNote.subtitle',
      placeholder: 'questions.uncoveredActivityNote.placeholder',
      // #2059.7 (même mécanisme) — jamais un blocage : passer cette question
      // n'invente rien à sa place.
      optional: true,
    },
  ],
}
