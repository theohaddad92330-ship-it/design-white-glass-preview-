import type { PageSpec } from '../../types'
import { buildLegalPage } from './legal-shared'

/**
 * /cookies — politique cookies et traceurs. 5 sections, texte FR extrait du
 * bloc par défaut de `apps/website/src/app/[locale]/cookies/page.tsx`.
 */
export const cookiesPage: PageSpec = buildLegalPage({
  slug: 'cookies',
  domain: 'legal',
  route: 'apps/website/src/app/[locale]/cookies/page.tsx',
  title: 'Politique relative aux cookies et aux traceurs',
  lastUpdated: '28 août 2026',
  sections: [
    {
      id: 'definition',
      title: 'Définition des cookies',
      text: "Un cookie est un petit fichier texte, identifié par un nom, déposé et stocké sur votre navigateur ou votre terminal (ordinateur, tablette, téléphone) lors de la consultation d'un site internet.",
    },
    {
      id: 'types',
      title: 'Types de cookies utilisés',
      text: "Les cookies strictement nécessaires au fonctionnement du Site ne sont pas soumis à votre consentement. Ils comprennent les cookies d'authentification et de maintien de la session utilisateur.",
    },
    {
      id: 'traceurs',
      title: 'Les traceurs de mesure d’audience utilisés',
      text: "Trois outils de mesure peuvent être chargés sur le Site, et uniquement après votre accord : deux mesurent l'audience, le troisième les performances de chargement des pages.",
    },
    {
      id: 'consentement',
      title: 'Gestion du consentement',
      text: 'Lors de votre première visite sur le Site, une bannière vous informe de l’utilisation de cookies et vous permet d’accepter, de refuser ou de paramétrer vos préférences.',
    },
    {
      id: 'desactivation',
      title: 'Désactivation des cookies via le navigateur',
      text: "Vous pouvez également configurer votre navigateur pour qu'il refuse systématiquement les cookies ou pour qu'il vous alerte lorsqu'un cookie est déposé.",
    },
  ],
})
