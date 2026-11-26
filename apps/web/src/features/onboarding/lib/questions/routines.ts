import { DOSSIER_CONTINUITY_BREAKS, DOSSIER_CONTINUITY_PRACTICES } from '@bellum/contracts'
import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `routines` du stage `company_info` — lot L19 (#2051).
 *
 * LA CONTINUITÉ DES DOSSIERS : ce qui fait qu'un compte ne retombe pas à zéro
 * entre deux personnes ou deux semaines. Le questionnaire savait ce que l'ESN
 * vend et à qui ; il ne savait rien de ce qui SURVIT à l'absence de celui qui
 * suivait le dossier — et c'est là que le travail déjà fait se perd.
 *
 * ⚠️ Ce n'est PAS `sales_routine` (profil progressif) sous un autre nom : cette
 * question-là décrit le rythme PERSONNEL du vendeur (« appels quotidiens »,
 * « contenu LinkedIn »), une habitude qui part avec lui. Ici on demande ce qui
 * tient SANS lui : une trace écrite, une prochaine action datée, un backlog que
 * quelqu'un d'autre peut reprendre. Deux questions différentes, deux réponses
 * différentes — les fondre rendrait impossible de distinguer « Sarah appelle
 * tous les jours » de « le dossier survit à l'absence de Sarah ».
 *
 * Les deux listes viennent de `@bellum/contracts`, jamais recopiées ici : la
 * rupture nommée par la personne est la même chaîne que celle qu'un jour une
 * routine citera (#2051.16), et deux listes divergentes casseraient ce lien.
 */
export const routinesStep: SubStep = {
  slug: 'routines',
  questions: [
    {
      // #2051.1 à #2051.9 — l'inventaire de ce qui tient aujourd'hui. Aucun
      // plafond : une ESN structurée peut tenir les neuf, et tronquer la
      // sélection à six se lirait « il lui en manque trois ».
      key: 'dossier_continuity_practices',
      kind: 'multi',
      label: 'questions.dossierContinuityPractices.label',
      subtitle: 'questions.dossierContinuityPractices.subtitle',
      choices: choice(...DOSSIER_CONTINUITY_PRACTICES),
    },
    {
      // #2051.10 à #2051.15 — les six ruptures, NOMMÉES et jamais chiffrées :
      // localiser l'endroit où ça décroche est utile, lui coller un pourcentage
      // inventé ne l'est pas (doctrine « aucune probabilité affichée »).
      key: 'dossier_continuity_breaks',
      kind: 'multi',
      label: 'questions.dossierContinuityBreaks.label',
      subtitle: 'questions.dossierContinuityBreaks.subtitle',
      choices: choice(...DOSSIER_CONTINUITY_BREAKS),
    },
  ],
}
