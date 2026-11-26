import type { PageSpec } from '../../types'
import { buildLegalPage } from './legal-shared'

/**
 * /cgu — conditions générales d'utilisation. 14 sections, texte FR extrait
 * du bloc par défaut (dernier `return (` après le 3ᵉ `if (locale === 'en')`)
 * de `apps/website/src/app/[locale]/cgu/page.tsx` — jamais les blocs de/nl/en.
 * Corps tronqué au premier paragraphe réel de chaque section (texte intégral
 * bien plus long : la maquette montre la forme, pas le contrat complet).
 */
export const cguPage: PageSpec = buildLegalPage({
  slug: 'cgu',
  domain: 'legal',
  route: 'apps/website/src/app/[locale]/cgu/page.tsx',
  title: "Conditions générales d'utilisation",
  lastUpdated: '25 mai 2026',
  sections: [
    {
      id: 'application',
      title: 'Application',
      text: "La société BELLUM est un concepteur et un éditeur de logiciels. Elle a développé la plateforme BellumAI, solution SaaS d'intelligence commerciale qui constitue un outil d'aide à la prospection et à la conquête de comptes pour les professionnels (ci-après désignée la « Plateforme »).",
    },
    {
      id: 'definitions',
      title: 'Définitions',
      text: "Plateforme : désigne la solution SaaS de la Société, accessible à l'adresse https://www.bellum-ai.com/, à laquelle un Utilisateur accède avec son compte Utilisateur.",
    },
    {
      id: 'inscription-compte',
      title: 'Inscription et compte Utilisateur',
      text: "L'accès aux Services nécessite la création d'un compte Utilisateur. L'inscription s'effectue par le renseignement d'un formulaire en ligne comprenant le prénom, le nom, l'adresse de courrier électronique professionnelle et la création d'un mot de passe.",
    },
    {
      id: 'intelligence-artificielle',
      title: "Utilisation de l'intelligence artificielle",
      text: "La Plateforme utilise des technologies d'intelligence artificielle pour générer des analyses, des recommandations, des messages et des plans d'action. Conformément au Règlement (UE) 2024/1689 du 13 juin 2024.",
    },
    {
      id: 'comportements-interdits',
      title: 'Comportements interdits',
      text: "L'Utilisateur s'interdit de : utiliser la Plateforme à des fins illégales ou contraires aux présentes CGU ; tenter de contourner les limitations techniques de la Plateforme, et notamment le système de crédits.",
    },
    {
      id: 'usage-contacts',
      title: 'Usage responsable des contacts professionnels',
      text: 'Les coordonnées de contacts professionnels fournies par la Plateforme sont destinées à un usage exclusif de prospection commerciale interentreprises (B2B), dans le respect des dispositions du RGPD.',
    },
    {
      id: 'disponibilite',
      title: 'Disponibilité du service',
      text: "La Société s'efforce d'assurer la disponibilité de la Plateforme vingt-quatre heures sur vingt-quatre, sept jours sur sept, sans toutefois pouvoir la garantir de manière absolue.",
    },
    {
      id: 'informations-publiees',
      title: 'Informations publiées sur la Plateforme',
      text: "Les résultats d'analyses générés par la Plateforme (fiches entreprises, listes de contacts, plans d'action, messages) sont consultables par l'Utilisateur dans son espace personnel.",
    },
    {
      id: 'suspension-resiliation',
      title: 'Suspension et résiliation du compte',
      text: "La Société peut suspendre immédiatement l'accès au compte d'un Utilisateur en cas de manquement grave aux présentes CGU, et notamment en cas d'utilisation abusive de la Plateforme.",
    },
    {
      id: 'propriete-intellectuelle',
      title: 'Propriété intellectuelle',
      text: "La marque BELLUM, ainsi que l'ensemble des marques figuratives ou non et, plus généralement, toutes les autres marques, illustrations, images, logotypes, bases de données, algorithmes et composants logiciels.",
    },
    {
      id: 'mode-preuve',
      title: 'Mode de preuve',
      text: "En cas de contentieux avec un tiers ou pour justifier des faits, l'Utilisateur accepte expressément que l'ensemble des données collectées à travers son activité sur la Plateforme (journaux de connexion) fasse foi.",
    },
    {
      id: 'nullite-clause',
      title: "Nullité d'une clause",
      text: "Si l'une quelconque des dispositions des présentes CGU était annulée, cette nullité n'entraînerait pas la nullité des autres dispositions des CGU qui demeureront en vigueur.",
    },
    {
      id: 'contact',
      title: 'Contact',
      text: 'BELLUM, 90 rue des Archives, 75003 Paris, France. Responsable : Monsieur Théo Haddad. Courrier électronique : contact@bellum-it.com.',
    },
    {
      id: 'loi-applicable',
      title: 'Loi applicable et juridiction compétente',
      text: 'Les présentes CGU sont régies par la loi française. Tout litige résultant de la formation, de l’interprétation ou de l’exécution des présentes CGU sera, à défaut de résolution amiable, de la compétence des tribunaux de Paris.',
    },
  ],
})
