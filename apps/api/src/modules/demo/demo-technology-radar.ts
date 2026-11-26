import { resolveRadarTechnology, technologyRadarSchema, type TechnologyRadar } from '@bellum/contracts'

/**
 * #4282.13 (craft rule n°9) — le RADAR PAR TECHNOLOGIE de la salle de
 * démonstration : un radar SAP préparé, les sept blocs remplis, données
 * FICTIVES (« (démo) »), aucun appel réseau. Lu par Découvrir
 * (`POST /ia/discover/technology-radar`) ; Laura en démonstration répond par
 * le moteur préparé du navigateur (`demo-turn.ts`), sur ces MÊMES comptes.
 *
 * Les dates sont exprimées en jours avant aujourd'hui : la salle ne vieillit pas.
 * Validé par le schéma strict du contrat — aucune probabilité, aucune source.
 */
const DAY_MS = 86_400_000

function daysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 10)
}

export const DEMO_RADAR_TECHNOLOGY_CODE = 'SAP'

export function demoTechnologyRadar(technology: string, now: Date = new Date()): TechnologyRadar | null {
  const ref = resolveRadarTechnology(technology)
  if (!ref) return null
  const generatedAt = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z').toISOString()
  if (ref.code !== DEMO_RADAR_TECHNOLOGY_CODE) {
    return technologyRadarSchema.parse({
      technology: ref,
      generatedAt,
      accounts: [],
      historicalNeeds: [],
      prescribers: [],
      footprints: [],
      notEvaluated: ['salle de démonstration : seul le radar SAP y est préparé'],
    })
  }
  return technologyRadarSchema.parse({
    technology: ref,
    generatedAt,
    accounts: [
      {
        accountName: 'Cabinet Talentis (démo)',
        siren: null,
        pocket: 'immediate',
        rank: 1,
        program: null,
        targetIsPublisher: true,
        awardedTender: null,
        missions: [
          {
            title: 'Consultant SAP FI/CO — migration S/4HANA',
            publisher: 'Cabinet Talentis (démo)',
            location: 'Lyon',
            tjmEur: 680,
            publishedAt: daysAgo(now, 3),
            url: 'https://demo.bellum.ai/offres/talentis-sap-fico',
          },
          {
            title: 'Chef de projet SAP SD',
            publisher: 'Cabinet Talentis (démo)',
            location: 'Paris',
            tjmEur: null,
            publishedAt: daysAgo(now, 9),
            url: 'https://demo.bellum.ai/offres/talentis-sap-sd',
          },
        ],
        proofs: [
          {
            kind: 'offer',
            label: 'Consultant SAP FI/CO — migration S/4HANA',
            date: daysAgo(now, 3),
            url: 'https://demo.bellum.ai/offres/talentis-sap-fico',
          },
          {
            kind: 'offer',
            label: 'Chef de projet SAP SD',
            date: daysAgo(now, 9),
            url: 'https://demo.bellum.ai/offres/talentis-sap-sd',
          },
        ],
        profiles: ['Consultant SAP FI/CO — migration S/4HANA', 'Chef de projet SAP SD'],
        toVerify: null,
      },
      {
        accountName: 'Aubrac Aerostructures (démo)',
        siren: null,
        pocket: 'immediate',
        rank: 2,
        program: null,
        targetIsPublisher: false,
        awardedTender: null,
        missions: [
          {
            title: 'Architecte SAP S/4HANA',
            publisher: 'Aubrac Aerostructures (démo)',
            location: 'Toulouse',
            tjmEur: null,
            publishedAt: daysAgo(now, 5),
            url: 'https://demo.bellum.ai/offres/aubrac-architecte-s4',
          },
        ],
        proofs: [
          {
            kind: 'offer',
            label: 'Architecte SAP S/4HANA',
            date: daysAgo(now, 5),
            url: 'https://demo.bellum.ai/offres/aubrac-architecte-s4',
          },
        ],
        profiles: ['Architecte SAP S/4HANA'],
        toVerify: null,
      },
      {
        accountName: 'Cévennes Défense Systèmes (démo)',
        siren: null,
        pocket: 'programs',
        rank: 3,
        program: 'Migration SAP ECC vers S/4HANA (RISE)',
        targetIsPublisher: false,
        awardedTender: null,
        missions: [],
        proofs: [
          {
            kind: 'tender_open',
            label: 'Migration SAP ECC vers S/4HANA (RISE)',
            date: daysAgo(now, 18),
            url: 'https://demo.bellum.ai/marches/cevennes-rise',
          },
        ],
        profiles: [],
        toVerify: null,
      },
      {
        accountName: 'Intégrateur Causses (démo)',
        siren: null,
        pocket: 'rank_2',
        rank: 4,
        program: null,
        targetIsPublisher: false,
        awardedTender: 'Lot 2 — AMOA SAP S/4 (Région Occitanie, démo)',
        missions: [],
        proofs: [
          {
            kind: 'tender_awarded',
            label: 'Lot 2 — AMOA SAP S/4',
            date: daysAgo(now, 120),
            url: 'https://demo.bellum.ai/marches/occitanie-amoa',
          },
        ],
        profiles: [],
        toVerify: null,
      },
    ],
    historicalNeeds: [
      {
        accountName: 'Groupe Aurélys (démo)',
        title: 'Consultant SAP MM',
        status: 'GAGNE',
        date: daysAgo(now, 400),
        tjmEur: 650,
        prescriberRole: 'DSI adjointe',
      },
      {
        accountName: 'Marenval Financement (démo)',
        title: 'Chef de projet S/4HANA Finance',
        status: 'PERDU',
        date: daysAgo(now, 610),
        tjmEur: null,
        prescriberRole: 'Directeur administratif et financier',
      },
      {
        accountName: 'Groupe Aurélys (démo)',
        title: 'Support SAP PP',
        status: 'TERMINE',
        date: daysAgo(now, 900),
        tjmEur: 540,
        prescriberRole: null,
      },
    ],
    prescribers: [
      {
        accountName: 'Groupe Aurélys (démo)',
        name: 'Claire Fontanel (démo)',
        role: 'DSI adjointe',
        freshness: { kind: 'dated', date: daysAgo(now, 60) },
      },
      {
        accountName: 'Marenval Financement (démo)',
        name: 'Hugo Lestrade (démo)',
        role: 'Directeur administratif et financier',
        freshness: { kind: 'to_revalidate', date: daysAgo(now, 610) },
      },
    ],
    footprints: [
      { accountName: 'Groupe Aurélys (démo)', observedProfiles: 14, label: 'profils observés' },
      { accountName: 'Aubrac Aerostructures (démo)', observedProfiles: 6, label: 'profils observés' },
    ],
    notEvaluated: [],
  })
}
