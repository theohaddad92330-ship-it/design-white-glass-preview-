import type { SubStep } from './types'
import { choice } from './types'

/** Sous-étape `domaines` du stage `offer_expertise`. */
export const domainesStep: SubStep = {
  slug: 'domaines',
  questions: [
    {
      key: 'expertise_areas',
      kind: 'multi-grouped',
      label: 'questions.expertiseAreas.label',
      subtitle: 'questions.expertiseAreas.subtitle',
      allowOther: true,
      groups: [
        {
          label: 'groups.expertiseAreas.itTech',
          choices: choice(
            'Cloud & Infrastructure (AWS, Azure, GCP, Hosting)',
            'Data & Intelligence Artificielle',
            'Cybersécurité & Conformité',
            'DevOps, SRE & Automatisation',
            'Développement applicatif (Web, Mobile, API)',
            'SAP & ERP (S/4HANA, Oracle, Sage)',
            'Réseau & Télécom',
            'Testing & Assurance qualité',
            'Architecture SI & Urbanisation',
            'IoT & Systèmes embarqués',
          ),
        },
        {
          label: 'groups.expertiseAreas.metiersConseil',
          choices: choice(
            'Gestion de projet & PMO',
            'Agilité, Scrum, Coaching agile',
            'Transformation digitale & Conduite du changement',
            'Conseil en stratégie SI',
            'AMOA / Business Analysis',
            'Product Management & Design (UX/UI)',
          ),
        },
        {
          label: 'groups.expertiseAreas.fonctionsSupport',
          choices: choice(
            'Finance & Contrôle de gestion',
            'Marketing digital & CRM',
            'RH & SIRH',
            'Supply Chain & Logistique',
            'Industrie & Manufacturing (MES, GMAO, PLM)',
          ),
        },
        // #2531.1 — retour client du 17/09 (Ludovic Marx, ESN d'ingénierie
        // industrielle) : groupe ajouté EN FIN, mêmes valeurs et même ordre
        // que `ESN_ANSWER_OPTIONS.expertise_areas` (@bellum/contracts),
        // verrouillé par `questions.golden.test.ts`.
        {
          label: 'groups.expertiseAreas.industrieIngenierie',
          choices: choice(
            'Mécanique & Conception (CAO, DAO)',
            'Automatisme, Robotique & Contrôle-commande',
            'Méthodes & Industrialisation',
            'Qualité, Certification & Métrologie',
            'Génie civil & Structures (BTP, VRD)',
            'Électronique & Instrumentation',
          ),
        },
        {
          label: 'groups.expertiseAreas.specialises',
          choices: choice(
            'Achats / Procurement / Category management',
            'Finance de marché / Risques / Conformité',
            'Actuariat / Assurance métier',
            'Comptabilité / Consolidation / FP&A',
            'RH / Recrutement / Formation',
            'Marketing / Communication / Création',
            'Commerce / RevOps / Relation client',
            'Ingénierie systèmes / MBSE / Sûreté',
            'Énergie / Nucléaire / Utilities',
            'Maintenance / Fiabilité / MRO',
            'Chimie / Procédés / Oil & Gas',
            'Électrique / Électronique / Hardware',
            'Santé / Clinique / Affaires réglementaires',
            'Pharma / GMP / Validation / CMC',
            'Agroalimentaire / Agronomie',
            'ESG / RSE / Décarbonation',
            'Juridique / Fiscalité / Gouvernance',
            'Immobilier / Facilities / Workplace',
            'Sûreté / Sécurité physique / Gestion de crise',
            'Audiovisuel / Production / Broadcast',
            'Hôtellerie / Tourisme / Revenue management',
          ),
        },
      ],
    },
  ],
}
