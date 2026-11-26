import type { HistoricalNeedsBlock } from '@bellum/contracts'

/**
 * #4760 (craft rule n°9) — `raw_analysis.historical_needs`, SEMÉ en démo : le dossier NOMME des besoins passés avec leur
 * date réelle (un besoin de plus de 180 jours y figure), et un besoin non daté reste non daté. Aucune probabilité.
 *
 * Posé sur UN compte analysé (Renault), pas dans le tableau `job_offers` du dossier SNCF : trois lots y ont déjà
 * collé leurs semis. Données fictives de démonstration, jamais présentées comme une collecte réelle.
 */
const DEMO_HISTORICAL_NEEDS_BY_COMPANY: Readonly<Record<string, HistoricalNeedsBlock>> = {
  Renault: {
    total: 10,
    items: [
      // Lot 768 — un besoin « data » : l'Historique propose une personne à contacter (titre « Data Analytics »)
      // et la recherche « data » le trouve. Fictif, comme le reste du semis.
      { label: 'Responsable data analytics — reporting Power BI du réseau', date: '2025-09-12', source: 'job_offer' },
      // Lot 771 — une offre avec son lien « Voir l'offre », ses compétences et son TJM (fictifs, example.com).
      {
        label: 'Architecte cloud AWS — plateforme de données usine H/F',
        date: '2025-11-18',
        source: 'job_offer',
        url: 'https://example.com/offres/architecte-cloud-aws',
        technologies: ['AWS', 'Terraform', 'Kubernetes'],
        tjm_eur: 650,
      },
      { label: 'Chef de projet migration SAP S/4HANA', date: '2025-04-07', source: 'job_offer' },
      { label: 'Programme de modernisation du SI logistique annoncé', date: null, source: 'signal' },
      // Lot 773 — l'Historique se lit d'un coup d'œil : le MÊME fait lu dans deux phrases (même mois, mêmes noms propres)
      // ne fait qu'UNE ligne « ×2 sources » ; un troisième besoin du même mois, différent, reste sa propre ligne.
      {
        label: 'Renault annonce un partenariat avec Nvidia pour le jumeau numérique de l’usine de Flins',
        date: '2025-06-10',
        source: 'signal',
      },
      {
        label: 'Partenariat Nvidia pour le jumeau numérique de Flins : déploiement prévu en 2026',
        date: '2025-06-24',
        source: 'signal',
      },
      {
        label: 'Refonte du portail de services après-vente des concessionnaires',
        date: '2025-06-18',
        source: 'signal',
      },
      // Lot 775 (Louis 02/11/2026) — trois MISSIONS OBSERVÉES sur le marché chez le compte, FICTIVES et sans identité :
      // un statut, un métier, des dates, une ESN, des compétences, un TJM. La mémoire marché réelle n'est jamais
      // semée (elle est partagée entre ESN concurrentes) : la démo les porte dans le dossier du compte.
      {
        label: 'Un freelance Data Engineer',
        date: '2024-06',
        source: 'market_path',
        location: 'Boulogne-Billancourt',
        technologies: ['Python', 'Kafka', 'Spark'],
        tjm_eur: 620,
      },
      {
        label: 'Un consultant en ESN Architecte cloud',
        date: '2024-12',
        source: 'market_path',
        location: 'Flins-sur-Seine',
        technologies: ['AWS', 'Terraform'],
        tjm_eur: 700,
      },
      { label: 'Un salarié Chef de projet SAP', date: '2023-09', source: 'market_path', technologies: ['SAP S/4HANA'] },
    ],
  },
}

export function demoHistoricalNeedsOf(companyName: string): HistoricalNeedsBlock | null {
  return DEMO_HISTORICAL_NEEDS_BY_COMPANY[companyName] ?? null
}
