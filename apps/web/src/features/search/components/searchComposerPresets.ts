import { type AnalysisContext, type AnalysisContextPreset } from '@bellum/contracts'
import { Briefcase, Pencil, RotateCcw, Star, Swords, TrendingUp, UserCheck, type LucideIcon } from 'lucide-react'
import type { TFunction } from 'i18next'
import { ANALYSIS_CONTEXT_PRESET_LABEL_KEYS } from '../lib/analysisContextPresentation'

type SelectOption = { value: string; label: string }

type StructuredFieldDef = {
  key: string
  label: string
  placeholder?: string
  type?: 'text' | 'textarea' | 'date' | 'select'
  options?: SelectOption[]
}

type PresetDef = {
  key: AnalysisContextPreset
  label: string
  description: string
  icon: LucideIcon
  fields: StructuredFieldDef[]
}

export function getPresets(t: TFunction<'search'>): PresetDef[] {
  return [
    {
      key: 'push-offer',
      label: t(ANALYSIS_CONTEXT_PRESET_LABEL_KEYS['push-offer']),
      description: t('presets.pushOffer.description'),
      icon: Briefcase,
      fields: [
        {
          key: 'offer',
          label: t('presets.pushOffer.fields.offer.label'),
          placeholder: t('presets.pushOffer.fields.offer.placeholder'),
        },
        {
          key: 'pricing',
          label: t('presets.pushOffer.fields.pricing.label'),
          placeholder: t('presets.pushOffer.fields.pricing.placeholder'),
        },
        {
          key: 'differentiation',
          label: t('presets.pushOffer.fields.differentiation.label'),
          type: 'textarea',
        },
        { key: 'idealMission', label: t('presets.pushOffer.fields.idealMission.label'), type: 'textarea' },
      ],
    },
    {
      key: 'known-account',
      label: t(ANALYSIS_CONTEXT_PRESET_LABEL_KEYS['known-account']),
      description: t('presets.knownAccount.description'),
      icon: UserCheck,
      fields: [
        {
          key: 'commercialStatus',
          label: t('presets.knownAccount.fields.commercialStatus.label'),
          type: 'select',
          options: [
            { value: 'active', label: t('presets.knownAccount.fields.commercialStatus.options.active') },
            { value: 'former', label: t('presets.knownAccount.fields.commercialStatus.options.former') },
            {
              value: 'engaged-prospect',
              label: t('presets.knownAccount.fields.commercialStatus.options.engagedProspect'),
            },
          ],
        },
        {
          key: 'lastInteraction',
          label: t('presets.knownAccount.fields.lastInteraction.label'),
          type: 'textarea',
        },
        {
          key: 'openOpportunity',
          label: t('presets.knownAccount.fields.openOpportunity.label'),
          type: 'textarea',
        },
        { key: 'revenueOrPipeline', label: t('presets.knownAccount.fields.revenueOrPipeline.label') },
      ],
    },
    {
      key: 'incumbent',
      label: t(ANALYSIS_CONTEXT_PRESET_LABEL_KEYS.incumbent),
      description: t('presets.incumbent.description'),
      icon: Swords,
      fields: [
        { key: 'incumbentName', label: t('presets.incumbent.fields.incumbentName.label') },
        { key: 'incumbentScope', label: t('presets.incumbent.fields.incumbentScope.label'), type: 'textarea' },
        {
          key: 'contractEndDate',
          label: t('presets.incumbent.fields.contractEndDate.label'),
          placeholder: t('presets.dateFormatPlaceholder'),
        },
        { key: 'weakness', label: t('presets.incumbent.fields.weakness.label'), type: 'textarea' },
      ],
    },
    {
      key: 'signal',
      label: t(ANALYSIS_CONTEXT_PRESET_LABEL_KEYS.signal),
      description: t('presets.signal.description'),
      icon: TrendingUp,
      fields: [
        {
          key: 'signalType',
          label: t('presets.signal.fields.signalType.label'),
          type: 'select',
          options: [
            { value: 'recruitment', label: t('presets.signal.fields.signalType.options.recruitment') },
            { value: 'tender', label: t('presets.signal.fields.signalType.options.tender') },
            { value: 'fundraise', label: t('presets.signal.fields.signalType.options.fundraise') },
            { value: 'appointment', label: t('presets.signal.fields.signalType.options.appointment') },
            {
              value: 'merger-acquisition',
              label: t('presets.signal.fields.signalType.options.mergerAcquisition'),
            },
            { value: 'other', label: t('presets.signal.fields.signalType.options.other') },
          ],
        },
        {
          key: 'source',
          label: t('presets.signal.fields.source.label'),
          placeholder: t('presets.signal.fields.source.placeholder'),
        },
        {
          key: 'signalDate',
          label: t('presets.signal.fields.signalDate.label'),
          placeholder: t('presets.dateFormatPlaceholder'),
        },
        { key: 'implication', label: t('presets.signal.fields.implication.label'), type: 'textarea' },
      ],
    },
    {
      key: 'strategic',
      label: t(ANALYSIS_CONTEXT_PRESET_LABEL_KEYS.strategic),
      description: t('presets.strategic.description'),
      icon: Star,
      fields: [
        {
          key: 'prioritizationReason',
          label: t('presets.strategic.fields.prioritizationReason.label'),
          type: 'textarea',
        },
        { key: 'targetDecisionMaker', label: t('presets.strategic.fields.targetDecisionMaker.label') },
        {
          key: 'potentialVolume',
          label: t('presets.strategic.fields.potentialVolume.label'),
          placeholder: t('presets.strategic.fields.potentialVolume.placeholder'),
        },
        { key: 'closingHorizon', label: t('presets.strategic.fields.closingHorizon.label') },
        { key: 'similarReference', label: t('presets.strategic.fields.similarReference.label') },
      ],
    },
    {
      key: 'retry',
      label: t(ANALYSIS_CONTEXT_PRESET_LABEL_KEYS.retry),
      description: t('presets.retry.description'),
      icon: RotateCcw,
      fields: [
        {
          key: 'missingFromPrevious',
          label: t('presets.retry.fields.missingFromPrevious.label'),
          type: 'textarea',
        },
        { key: 'newAngle', label: t('presets.retry.fields.newAngle.label'), type: 'textarea' },
        { key: 'hypothesis', label: t('presets.retry.fields.hypothesis.label'), type: 'textarea' },
      ],
    },
    {
      key: 'free',
      label: t(ANALYSIS_CONTEXT_PRESET_LABEL_KEYS.free),
      description: t('presets.free.description'),
      icon: Pencil,
      fields: [],
    },
  ]
}

export function getPresetDef(t: TFunction<'search'>, preset: AnalysisContextPreset): PresetDef {
  const presets = getPresets(t)
  return presets.find(p => p.key === preset) ?? presets[presets.length - 1]!
}

export function emptyContext(preset: AnalysisContextPreset): AnalysisContext {
  if (preset === 'free') return { preset: 'free', notes: '' }
  return { preset } as AnalysisContext
}
