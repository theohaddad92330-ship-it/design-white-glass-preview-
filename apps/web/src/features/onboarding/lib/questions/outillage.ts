import { TOOLING_INTERNAL_NAMES_MAX, TOOLING_PRESENCE_SCALE } from '@bellum/contracts'
import type { SubStep } from './types'
import { choice } from './types'
import { resolveToolingChoices } from './tooling-resolve-choices'

/**
 * Sous-étape `outillage` du stage `company_info` — #2054 (« cartographier la
 * chaîne, pas collectionner les logos »).
 *
 * Les SYSTÈMES de l'ESN : là où vivent les comptes, les profils, les missions,
 * les échanges, les rendez-vous et les fichiers. Les à-côtés (tableurs,
 * recherche de coordonnées, plateformes, pilotage, notes) sont dans la
 * sous-étape `outillage-annexe`, et la qualité de la source de référence dans
 * `outillage-qualite` — onze questions sur un seul écran ne se répondent pas.
 *
 * ⚠️ AUCUNE MARQUE. On nomme la CAPACITÉ (« ton CRM », « ta messagerie ») :
 * l'outil que l'espace a BRANCHÉ se nomme par injection (`connectedClientTools`)
 * et nulle part en dur, et NOS fournisseurs ne se nomment jamais. Doctrine
 * `tool-naming.ts`, gardes GA-44 et `i18n/no-vendor-names.test.ts`.
 *
 * Les six questions partagent {@link TOOLING_PRESENCE_SCALE} : une même échelle
 * répond à « cet outil existe-t-il ? » (#2054.1-.11) et « utilisé par qui ? »
 * (#2054.12). Elle vit dans le contrat (`onboarding/answers-outillage.ts`), pas
 * ici — un réglage vit à un seul endroit (GA-26).
 */
const presence = choice(...TOOLING_PRESENCE_SCALE)

export const outillageStep: SubStep = {
  slug: 'outillage',
  questions: [
    // #2054.1 — le CRM. #2054.19 : une connexion CRM réelle retire « pas cet
    // outil », jamais qui s'en sert (voir `tooling-resolve-choices.ts`).
    {
      key: 'tooling_crm',
      kind: 'single',
      label: 'questions.toolingCrm.label',
      subtitle: 'questions.toolingCrm.subtitle',
      choices: presence,
      resolveChoices: resolveToolingChoices('tooling_crm', presence),
    },
    // #2054.2 — l'ATS.
    {
      key: 'tooling_ats',
      kind: 'single',
      label: 'questions.toolingAts.label',
      subtitle: 'questions.toolingAts.subtitle',
      choices: presence,
      resolveChoices: resolveToolingChoices('tooling_ats', presence),
    },
    // #2054.3 — l'ERP ESN. Aucune connexion ne le confirme (doc
    // `answers-outillage.ts` : `ats` couvre ATS/ERP, rattaché au seul ATS) —
    // pas de `resolveChoices` ici, à dessein.
    {
      key: 'tooling_erp',
      kind: 'single',
      label: 'questions.toolingErp.label',
      subtitle: 'questions.toolingErp.subtitle',
      choices: presence,
    },
    // #2054.4 — la messagerie. Le sous-titre dit ce que la question NE fait
    // pas : elle situe les échanges, elle n'ouvre aucun accès à une boîte. Le
    // CORPS d'un message ne sort ni vers un humain ni vers le modèle (D65), et
    // une boîte mail reste personnelle (D58).
    {
      key: 'tooling_mailbox',
      kind: 'single',
      label: 'questions.toolingMailbox.label',
      subtitle: 'questions.toolingMailbox.subtitle',
      choices: presence,
      resolveChoices: resolveToolingChoices('tooling_mailbox', presence),
    },
    // #2054.5 — l'agenda.
    {
      key: 'tooling_calendar',
      kind: 'single',
      label: 'questions.toolingCalendar.label',
      subtitle: 'questions.toolingCalendar.subtitle',
      choices: presence,
      resolveChoices: resolveToolingChoices('tooling_calendar', presence),
    },
    // #2054.6 — l'espace de fichiers partagés.
    {
      key: 'tooling_drive',
      kind: 'single',
      label: 'questions.toolingDrive.label',
      subtitle: 'questions.toolingDrive.subtitle',
      choices: presence,
      resolveChoices: resolveToolingChoices('tooling_drive', presence),
    },
    // #4971.1 — un CRM, un ATS ou un ERP fait MAISON n'a ni catalogue ni
    // marque : l'échelle ci-dessus dit qu'il existe, ce champ le NOMME
    // (noms libres, bornés par le contrat). Facultatif : passé = inconnu.
    // #4971.2 — aucun `resolveChoices` ni lien à une connexion : un nom saisi
    // n'est jamais « branché ».
    {
      key: 'tooling_internal_names',
      kind: 'tags',
      label: 'questions.toolingInternalNames.label',
      subtitle: 'questions.toolingInternalNames.subtitle',
      placeholder: 'questions.toolingInternalNames.placeholder',
      max: TOOLING_INTERNAL_NAMES_MAX,
      optional: true,
    },
  ],
}
