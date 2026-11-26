import type { PageSpec } from '../../types'
import { buildLegalPage } from './legal-shared'

/**
 * /cgv — conditions générales de vente. 13 sections, texte FR extrait du
 * bloc par défaut (dernier `return (` après le 3ᵉ `if (locale === 'en')`) de
 * `apps/website/src/app/[locale]/cgv/page.tsx`. Corps tronqué au premier
 * paragraphe réel de chaque section.
 */
export const cgvPage: PageSpec = buildLegalPage({
  slug: 'cgv',
  domain: 'legal',
  route: 'apps/website/src/app/[locale]/cgv/page.tsx',
  title: 'Conditions générales de vente',
  lastUpdated: '25 mai 2026',
  sections: [
    {
      id: 'objet',
      title: 'Objet',
      text: 'Les présentes conditions générales de vente (ci-après les « CGV ») régissent les relations contractuelles entre la société BELLUM, SASU au capital de 1 000,00 euros, immatriculée sous le numéro 931 750 681 R.C.S. Paris.',
    },
    {
      id: 'description-services',
      title: 'Description des services',
      text: "La plateforme BellumAI est un service d'intelligence commerciale accessible en ligne, destiné aux professionnels du secteur des entreprises de services du numérique (ESN) et, plus généralement, à tout professionnel.",
    },
    {
      id: 'intelligence-artificielle',
      title: "Utilisation de l'intelligence artificielle",
      text: "La plateforme BellumAI utilise des technologies d'intelligence artificielle pour générer des analyses, des recommandations, des messages et des plans d'action. Conformément au Règlement (UE) 2024/1689.",
    },
    {
      id: 'abonnement-tarifs',
      title: "Formules d'abonnement et tarifs",
      text: "Les services sont proposés sous forme d'abonnement mensuel ou annuel, selon les formules et les tarifs décrits sur la page de tarification du Site. Les tarifs sont indiqués en euros hors taxes (HT).",
    },
    {
      id: 'systeme-credits',
      title: 'Système de crédits',
      text: "Certaines fonctionnalités de la plateforme, et notamment les analyses d'entreprises, sont soumises à un système de crédits. Chaque analyse consomme un nombre déterminé de crédits selon la formule d'abonnement.",
    },
    {
      id: 'modalites-paiement',
      title: 'Modalités de paiement',
      text: 'Le paiement est effectué par carte bancaire via un prestataire de paiement sécurisé certifié PCI-DSS, ou par virement bancaire pour les clients ayant souscrit une formule entreprise sur devis.',
    },
    {
      id: 'duree-resiliation',
      title: 'Durée, reconduction et résiliation',
      text: "L'abonnement est conclu pour la durée correspondant à la formule choisie (mensuelle ou annuelle). Il se renouvelle par tacite reconduction pour des périodes successives de même durée.",
    },
    {
      id: 'droit-retractation',
      title: 'Droit de rétractation',
      text: "Conformément aux articles L. 221-18 et suivants du Code de la consommation, le Client consommateur dispose d'un délai de quatorze jours à compter de la souscription de l'abonnement pour exercer son droit de rétractation.",
    },
    {
      id: 'propriete-intellectuelle',
      title: 'Propriété intellectuelle',
      text: "La plateforme BellumAI, ses algorithmes, ses modèles d'intelligence artificielle, sa base de données propriétaire, son interface et l'ensemble de ses composants logiciels sont et demeurent la propriété exclusive de BELLUM.",
    },
    {
      id: 'limitation-responsabilite',
      title: 'Limitation de responsabilité',
      text: "La société BELLUM s'engage à fournir les services avec diligence, conformément aux règles de l'art, dans le cadre d'une obligation de moyens.",
    },
    {
      id: 'donnees-personnelles',
      title: 'Données personnelles',
      text: 'Le traitement des données personnelles dans le cadre de l’exécution des services est régi par la Politique de confidentialité et de protection des données personnelles accessible sur le Site.',
    },
    {
      id: 'nullite-clause',
      title: "Nullité d'une clause",
      text: "Si l'une quelconque des dispositions des présentes CGV était annulée par une décision de justice devenue définitive, cette nullité n'entraînerait pas la nullité des autres dispositions qui demeureront en vigueur.",
    },
    {
      id: 'droit-applicable',
      title: 'Droit applicable et juridiction compétente',
      text: 'Les présentes CGV sont régies par le droit français. En cas de litige entre professionnels, et après tentative de résolution amiable restée infructueuse sous un délai de trente jours, les tribunaux compétents de Paris seront seuls compétents.',
    },
  ],
})
