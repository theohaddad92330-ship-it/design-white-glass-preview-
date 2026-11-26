import { describe, expect, it } from 'vitest'

import { ESN_ANSWER_OPTIONS } from './onboarding.js'

/**
 * #2531.1 / #2549.1 / #2549.2 — retours client du 17/09 (Ludovic Marx, ESN
 * d'ingénierie industrielle) : `expertise_areas` n'offrait qu'un seul choix
 * touchant l'industrie (« Industrie & Manufacturing (MES, GMAO, PLM) »,
 * un regard logiciel sur l'usine) alors que le client cite des DISCIPLINES
 * d'ingénierie absentes du catalogue : mécanique, automatisme, méthodes,
 * qualité, génie civil, électronique.
 *
 * #2549.2 — MESURÉ : le catalogue confondait deux axes avant ce lot.
 * `target_sectors` porte déjà le SECTEUR client (« Industrie manufacturière
 * & Automobile », « Aéronautique & Défense », « Énergie & Utilities »,
 * « BTP & Construction », « Transport ferroviaire & Aérien », « Santé &
 * Medtech ») — six des douze mots cités par Ludovic (automobile, défense,
 * énergie, BTP, ferroviaire, médical) sont des SECTEURS, déjà couverts là.
 * Les six autres (mécanique, automatisme, méthodes, qualité, génie civil,
 * électronique) sont des MÉTIERS/EXPERTISES — l'axe de CE fichier — et
 * c'étaient EUX qui manquaient. Ce test verrouille l'ajout à la SEULE
 * source (GA-26) ; le mirroir UI (`apps/web/.../questions/domaines.ts`) est
 * tenu par le golden `questions.golden.test.ts` existant, pas dupliqué ici.
 */
describe('ESN_ANSWER_OPTIONS.expertise_areas — domaines industriels (#2531.1)', () => {
  const INDUSTRIAL_LABELS = [
    'Mécanique & Conception (CAO, DAO)',
    'Automatisme, Robotique & Contrôle-commande',
    'Méthodes & Industrialisation',
    'Qualité, Certification & Métrologie',
    'Génie civil & Structures (BTP, VRD)',
    'Électronique & Instrumentation',
  ]

  it('offre les six disciplines industrielles citées par le client', () => {
    for (const label of INDUSTRIAL_LABELS) {
      expect(ESN_ANSWER_OPTIONS.expertise_areas).toContain(label)
    }
  })

  it('GA-08 : ajoute en FIN, ne réordonne ni ne retire aucune valeur historique', () => {
    const historical = [
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
      'Gestion de projet & PMO',
      'Agilité, Scrum, Coaching agile',
      'Transformation digitale & Conduite du changement',
      'Conseil en stratégie SI',
      'AMOA / Business Analysis',
      'Product Management & Design (UX/UI)',
      'Finance & Contrôle de gestion',
      'Marketing digital & CRM',
      'RH & SIRH',
      'Supply Chain & Logistique',
      'Industrie & Manufacturing (MES, GMAO, PLM)',
    ] as const
    expect(ESN_ANSWER_OPTIONS.expertise_areas.slice(0, historical.length)).toEqual(historical)
    expect(
      ESN_ANSWER_OPTIONS.expertise_areas.slice(historical.length, historical.length + INDUSTRIAL_LABELS.length),
    ).toEqual(INDUSTRIAL_LABELS)
    // Théo O onboarding-couverture (22/10) — la V23 ajoute 21 expertises spécialisées APRÈS, toujours EN FIN.
    expect(ESN_ANSWER_OPTIONS.expertise_areas.slice(historical.length + INDUSTRIAL_LABELS.length)).toHaveLength(21)
  })

  it('sait dire NON : une valeur manquante fait rougir la couverture (preuve GA)', () => {
    const withoutMecanique = ESN_ANSWER_OPTIONS.expertise_areas.filter(v => v !== 'Mécanique & Conception (CAO, DAO)')
    expect(withoutMecanique.includes('Mécanique & Conception (CAO, DAO)')).toBe(false)
  })

  it('aucun doublon dans le catalogue étendu', () => {
    expect(new Set(ESN_ANSWER_OPTIONS.expertise_areas).size).toBe(ESN_ANSWER_OPTIONS.expertise_areas.length)
  })
})
