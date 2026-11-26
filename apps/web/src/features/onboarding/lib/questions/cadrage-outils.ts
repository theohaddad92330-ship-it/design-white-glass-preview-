import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `cadrage-outils` du stage `company_info` — Théo O onboarding-couverture (22/10/2026) : « Précisions de cadrage » de la V23
 * (tools, data_sources, workflow_pain). Toutes FACULTATIVES (`optional`) et portent les quatre états d'incertitude (`allowUnknown`) : une déclaration ne
 * connecte aucun outil, ne vaut pas autorisation d'envoi et n'invente rien à la place de la personne.
 */
export const cadrageOutilsStep: SubStep = {
  slug: 'cadrage-outils',
  questions: [
    {
      key: 'tools',
      kind: 'multi',
      label: 'questions.tools.label',
      subtitle: 'questions.tools.subtitle',
      choices: choice(
        'Aucun outil pour le moment',
        'Tableur',
        'CRM',
        'Outil de gestion d’activité et de facturation',
        'Outil de suivi des candidats',
        'Messagerie professionnelle',
        'Agenda partagé',
        'Espace de documents partagé',
        'Outil de prise de notes',
        'Outil de prospection sur les réseaux professionnels',
        'Plateforme de mise en relation avec des freelances',
        'Outil de notes de réunion',
        'Outil d’enrichissement',
        'Outil comptable',
      ),
      allowOther: true,
      optional: true,
      allowUnknown: true,
    },
    {
      key: 'data_sources',
      kind: 'multi',
      label: 'questions.dataSources.label',
      subtitle: 'questions.dataSources.subtitle',
      choices: choice(
        'Portefeuille de comptes',
        'Contacts et échanges',
        'CV et dossiers de compétences',
        'Besoins et appels d’offres',
        'Références et cas clients',
        'Missions et relevés d’activité',
        'Factures et règlements',
        'Documents d’offre',
        'Aucune donnée pour le moment',
      ),
      allowOther: true,
      optional: true,
      allowUnknown: true,
    },
    {
      key: 'workflow_pain',
      kind: 'text',
      label: 'questions.workflowPain.label',
      subtitle: 'questions.workflowPain.subtitle',
      optional: true,
      allowUnknown: true,
    },
  ],
}
