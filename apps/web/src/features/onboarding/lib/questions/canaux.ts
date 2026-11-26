import { ENTRY_CHANNEL_VALUES, ENTRY_CHANNELS_USED_VALUES } from '@bellum/contracts'
import type { SubStep } from './types'

/**
 * Sous-étape `canaux` du stage `target_market` — lot L19 (#2048).
 *
 * Cinq questions, un seul objet : **les portes par lesquelles une affaire
 * entre**. C'est volontairement plus qu'une ou deux questions, et c'est ce qui
 * répond à la demande « une structure PAR CANAL, pas un tableau plat »
 * (#2048.12) : les quatre portent le MÊME catalogue, si bien que l'écran se lit
 * comme une petite matrice — utilisé / mesuré / a produit / coûte du temps —
 * sans qu'il faille inventer un rendu de tableau que le questionnaire ne sait
 * pas afficher.
 *
 * Les trois règles qui commandent les libellés :
 *  - #2048.21 — ce qu'on ne mesure pas est NOMMÉ « non mesuré », jamais compté
 *    zéro. La deuxième question existe entièrement pour ça ;
 *  - #2048.20 — la visibilité (le temps que coûte un canal) et la conversion
 *    (les démarrages qu'il a produits) sont deux questions, jamais une ;
 *  - GA-26 — les valeurs viennent du contrat (`ENTRY_CHANNEL_VALUES`), jamais
 *    recopiées ici : quatre copies auraient divergé au premier canal ajouté,
 *    et la garde `questions.golden.test.ts` compare la liste au contrat.
 *
 * Aucune des onze valeurs ne nomme un éditeur : un réseau social professionnel
 * se désigne par sa capacité (doctrine de nommage, GA-44).
 */
const channels = ENTRY_CHANNEL_VALUES.map(value => ({ value }))

export const canauxStep: SubStep = {
  slug: 'canaux',
  questions: [
    {
      // #2048.1/.5/.7/.8/.9/.10/.11/.12 — utilisé ou non, canal par canal.
      key: 'entry_channels_used',
      kind: 'multi',
      label: 'questions.entryChannelsUsed.label',
      subtitle: 'questions.entryChannelsUsed.subtitle',
      // Théo O onboarding-couverture — trois valeurs de plus que les autres questions de canaux (V23).
      choices: ENTRY_CHANNELS_USED_VALUES.map(value => ({ value })),
      allowOther: true,
    },
    {
      // #2048.13 — la PÉRIODE sur laquelle portent les chiffres, canal par
      // canal. Un volume sans fenêtre de temps est un ordre de grandeur, pas
      // une mesure : « vingt appels » ne dit rien tant qu'on ignore si c'est
      // par semaine ou par trimestre.
      key: 'entry_channels_period',
      kind: 'multi',
      label: 'questions.entryChannelsPeriod.label',
      subtitle: 'questions.entryChannelsPeriod.subtitle',
      choices: channels,
    },
    {
      // #2048.14 → #2048.18 / #2048.21 — le troisième seau se remplit ICI :
      // ce qui n'est pas coché reste « non mesuré », et l'audit le dit avec ce
      // mot plutôt que d'écrire un zéro qui serait faux.
      key: 'entry_channels_measured',
      kind: 'multi',
      label: 'questions.entryChannelsMeasured.label',
      subtitle: 'questions.entryChannelsMeasured.subtitle',
      choices: channels,
    },
    {
      // #2048.18 / #2048.20 — la conversion OBSERVÉE, jamais calculée : on note
      // ce qui s'est produit, on ne prédit aucune chance.
      key: 'entry_channels_last_starts',
      kind: 'multi',
      label: 'questions.entryChannelsLastStarts.label',
      subtitle: 'questions.entryChannelsLastStarts.subtitle',
      choices: channels,
    },
    {
      // #2048.19 / #2048.20 — le temps réel, l'autre moitié du couple
      // visibilité / conversion.
      key: 'entry_channels_time_split',
      kind: 'multi',
      label: 'questions.entryChannelsTimeSplit.label',
      subtitle: 'questions.entryChannelsTimeSplit.subtitle',
      choices: channels,
    },
  ],
}
