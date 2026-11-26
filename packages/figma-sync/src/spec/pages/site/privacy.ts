import type { PageSpec } from '../../types'
import { buildLegalPage } from './legal-shared'

/**
 * /privacy — politique de confidentialité RGPD. 12 sections, texte FR extrait
 * du bloc par défaut de `apps/website/src/app/[locale]/privacy/page.tsx`.
 */
export const privacyPage: PageSpec = buildLegalPage({
  slug: 'privacy',
  domain: 'legal',
  route: 'apps/website/src/app/[locale]/privacy/page.tsx',
  title: 'Politique de confidentialité et de protection des données personnelles',
  lastUpdated: '28 août 2026',
  sections: [
    {
      id: 'preambule',
      title: 'Préambule',
      text: 'La protection de vos données personnelles est une priorité pour la société BELLUM. La présente politique décrit la manière dont nous collectons, traitons et protégeons vos données à caractère personnel.',
    },
    {
      id: 'responsable-traitement',
      title: 'Responsable du traitement',
      text: 'Le responsable du traitement des données à caractère personnel est la société BELLUM, SASU au capital de 1 000,00 euros, immatriculée sous le numéro 931 750 681 R.C.S. Paris.',
    },
    {
      id: 'donnees-collectees',
      title: 'Données collectées',
      text: 'Lors de la création de votre compte et de l’utilisation de la plateforme, les données suivantes sont collectées : nom et prénom ; adresse de courrier électronique professionnelle ; dénomination de la société.',
    },
    {
      id: 'finalites',
      title: 'Finalités et bases légales des traitements',
      text: 'Nous collectons ou traitons vos données personnelles dans le respect du RGPD, pour les finalités et sur les bases légales suivantes :',
    },
    {
      id: 'conservation',
      title: 'Durée de conservation des données',
      text: 'Au-delà des durées indiquées ci-dessus, les données sont supprimées ou anonymisées de manière irréversible. En cas de procédure contentieuse, les données pertinentes pourront être conservées.',
    },
    {
      id: 'destinataires',
      title: 'Destinataires des données',
      text: 'Les données à caractère personnel collectées sont susceptibles d’être communiquées aux destinataires suivants : les personnels habilités de la société BELLUM, dans la stricte limite de leurs attributions.',
    },
    {
      id: 'transferts',
      title: 'Transferts de données hors de l’Union européenne',
      text: 'Certains sous-traitants techniques de la société BELLUM peuvent être établis en dehors de l’Union européenne. Le cas échéant, ces transferts sont encadrés par les garanties prévues par le RGPD.',
    },
    {
      id: 'securite',
      title: 'Sécurité des données',
      text: 'La société BELLUM met en œuvre des mesures techniques et organisationnelles appropriées afin de garantir un niveau de sécurité adapté au risque, conformément à l’article 32 du RGPD.',
    },
    {
      id: 'violations',
      title: 'Notification des violations de données',
      text: 'En cas de violation de données à caractère personnel au sens de l’article 4(12) du RGPD, la société BELLUM s’engage à notifier la Commission nationale de l’informatique et des libertés (CNIL).',
    },
    {
      id: 'droits',
      title: 'Droits des personnes concernées',
      text: 'Conformément aux articles 15 à 22 du RGPD et à la loi Informatique et Libertés, vous bénéficiez des droits suivants sur vos données personnelles :',
    },
    {
      id: 'droits-tiers',
      title: 'Droits des contacts professionnels tiers',
      text: 'Conformément à l’article 14 du RGPD relatif aux informations à fournir lorsque les données n’ont pas été collectées auprès de la personne concernée, la société BELLUM informe les contacts professionnels.',
    },
    {
      id: 'reclamation-cnil',
      title: 'Réclamation auprès de la CNIL',
      text: 'Si vous estimez que le traitement de vos données personnelles constitue une violation du RGPD, vous avez le droit d’introduire une réclamation auprès de la Commission nationale de l’informatique et des libertés.',
    },
  ],
})
