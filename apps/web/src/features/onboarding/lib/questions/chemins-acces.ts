import { ENTRY_CHANNEL_VALUES } from '@bellum/contracts'
import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `chemins-acces` du stage `target_market` — lot L17 (#2044).
 *
 * Les treize « voies » de l'issue et leurs résultats/coût-en-temps pointent
 * sur {@link ENTRY_CHANNEL_VALUES} (#2048, lot L19) — pas de second catalogue
 * (GA-26). Cette sous-étape pose ce que #2048 ne couvre pas : dépendance,
 * prérequis, limite atteinte, par canal.
 */
export const cheminsAccesStep: SubStep = {
  slug: 'chemins-acces',
  questions: [
    {
      key: 'entry_channels_dependency',
      kind: 'multi',
      label: 'questions.entryChannelsDependency.label',
      subtitle: 'questions.entryChannelsDependency.subtitle',
      choices: choice(...ENTRY_CHANNEL_VALUES),
    },
    {
      key: 'entry_channels_prerequisites',
      kind: 'tags',
      label: 'questions.entryChannelsPrerequisites.label',
      subtitle: 'questions.entryChannelsPrerequisites.subtitle',
      placeholder: 'questions.entryChannelsPrerequisites.placeholder',
    },
    {
      key: 'entry_channels_saturation',
      kind: 'multi',
      label: 'questions.entryChannelsSaturation.label',
      subtitle: 'questions.entryChannelsSaturation.subtitle',
      choices: choice(...ENTRY_CHANNEL_VALUES),
    },
  ],
}
