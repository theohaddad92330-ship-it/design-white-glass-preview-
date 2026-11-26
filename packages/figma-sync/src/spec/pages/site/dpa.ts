import type { PageSpec } from '../../types'
import { buildLegalPage } from './legal-shared'

/**
 * /dpa — accord de traitement des données (sous-traitance RGPD). 7 sections,
 * texte FR extrait du bloc par défaut de
 * `apps/website/src/app/[locale]/dpa/page.tsx`.
 */
export const dpaPage: PageSpec = buildLegalPage({
  slug: 'dpa',
  domain: 'legal',
  route: 'apps/website/src/app/[locale]/dpa/page.tsx',
  title: 'Accord de traitement des données',
  lastUpdated: '25 mai 2026',
  sections: [
    {
      id: 'objet',
      title: 'Objet',
      text: 'Le présent accord de traitement des données (ci-après le « DPA ») complète les conditions générales de vente et les conditions générales d’utilisation, et définit les obligations respectives de la société BELLUM.',
    },
    {
      id: 'traitements',
      title: 'Traitements effectués',
      text: 'Dans le cadre de la fourniture des services BellumAI, le Sous-traitant traite, pour le compte du Responsable du traitement, les catégories de données suivantes : données d’identification des contacts professionnels.',
    },
    {
      id: 'obligations-sous-traitant',
      title: 'Obligations du Sous-traitant',
      text: "Le Sous-traitant s'engage à : ne traiter les données que sur instruction documentée du Responsable du traitement, y compris en ce qui concerne les transferts vers des pays tiers ou à des organisations internationales.",
    },
    {
      id: 'sous-traitants-ulterieurs',
      title: 'Sous-traitants ultérieurs',
      text: "Le Sous-traitant est autorisé de manière générale par le Responsable du traitement à recourir à des sous-traitants ultérieurs pour l'exécution de prestations techniques spécifiques (hébergement, traitement).",
    },
    {
      id: 'notification-violations',
      title: 'Notification des violations',
      text: 'En cas de violation de données à caractère personnel au sens de l’article 4(12) du RGPD, le Sous-traitant s’engage à notifier le Responsable du traitement dans les meilleurs délais.',
    },
    {
      id: 'audits',
      title: 'Audits',
      text: "Le Sous-traitant s'engage à permettre au Responsable du traitement, ou à tout auditeur indépendant mandaté par celui-ci et soumis à une obligation de confidentialité, de procéder à des audits.",
    },
    {
      id: 'duree-fin',
      title: 'Durée et fin du DPA',
      text: "Le présent DPA entre en vigueur à la date de souscription aux services BellumAI et demeure en vigueur pendant toute la durée du contrat. À l'issue du contrat, le Sous-traitant supprime l'ensemble des données.",
    },
  ],
})
