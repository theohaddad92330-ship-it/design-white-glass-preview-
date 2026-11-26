import type { AccountSize, EsnArchetype, SellingPosture } from '@bellum/contracts'
import { i18n } from '@/i18n'

// Résolus à l'appel (pas à l'import) pour suivre la langue courante.
// i18n keys: profile:context.archetype.soloHunter | boutiqueExpert | midMarketChallenger | scaleUp | enterprisePlayer
export function getEsnArchetypeLabels(): Record<EsnArchetype, string> {
  return {
    soloHunter: i18n.t('profile:context.archetype.soloHunter'),
    boutiqueExpert: i18n.t('profile:context.archetype.boutiqueExpert'),
    midMarketChallenger: i18n.t('profile:context.archetype.midMarketChallenger'),
    scaleUp: i18n.t('profile:context.archetype.scaleUp'),
    enterprisePlayer: i18n.t('profile:context.archetype.enterprisePlayer'),
  }
}

// i18n keys: profile:context.posture.expertiseRare | volumeFlexible | strategicConsulting | nearshoreCompetitive | nicheVerticals
export function getSellingPostureLabels(): Record<SellingPosture, string> {
  return {
    expertiseRare: i18n.t('profile:context.posture.expertiseRare'),
    volumeFlexible: i18n.t('profile:context.posture.volumeFlexible'),
    strategicConsulting: i18n.t('profile:context.posture.strategicConsulting'),
    nearshoreCompetitive: i18n.t('profile:context.posture.nearshoreCompetitive'),
    nicheVerticals: i18n.t('profile:context.posture.nicheVerticals'),
  }
}

// #2162.21 — le libellé du PÉRIMÈTRE (idealAccountProfile.size) affiché
// discrètement sur `ComposerPersonalizationBar`. i18n keys:
// profile:context.accountSize.pme | eti | grandCompte | all
export function getAccountSizeLabels(): Record<AccountSize, string> {
  return {
    pme: i18n.t('profile:context.accountSize.pme'),
    eti: i18n.t('profile:context.accountSize.eti'),
    grandCompte: i18n.t('profile:context.accountSize.grandCompte'),
    all: i18n.t('profile:context.accountSize.all'),
  }
}
