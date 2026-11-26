import type { PageSpec } from '../../types'
import { buildLegalPage } from './legal-shared'

/**
 * /legal — mentions légales. 6 sections, texte FR extrait du bloc par défaut
 * de `apps/website/src/app/[locale]/legal/page.tsx`.
 */
export const legalPage: PageSpec = buildLegalPage({
  slug: 'legal',
  domain: 'legal',
  route: 'apps/website/src/app/[locale]/legal/page.tsx',
  title: 'Mentions légales',
  lastUpdated: '25 mai 2026',
  sections: [
    {
      id: 'editeur',
      title: 'Éditeur du Site',
      text: 'Le Site est édité par la société BELLUM, société par actions simplifiée unipersonnelle (SASU) au capital social de 1 000,00 euros, immatriculée au Registre du commerce et des sociétés de Paris.',
    },
    {
      id: 'hebergement',
      title: 'Hébergement',
      text: 'Le Site est hébergé par la société Vercel Inc., dont le siège social est situé au 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis d’Amérique.',
    },
    {
      id: 'propriete-intellectuelle',
      title: 'Propriété intellectuelle',
      text: 'Toutes les marques, photographies, textes, commentaires, illustrations, images animées ou non, séquences vidéo, sons, ainsi que toutes les applications informatiques qui pourraient être utilisées.',
    },
    {
      id: 'responsabilite',
      title: 'Responsabilité',
      text: 'La société BELLUM se réserve le droit de modifier à tout moment le contenu du Site. Elle en gère les mises à jour. Cependant, elle ne garantit pas l’absence d’erreur ou d’inexactitude sur le Site.',
    },
    {
      id: 'liens-hypertextes',
      title: 'Liens hypertextes',
      text: 'Le Site peut contenir des liens hypertextes donnant accès à d’autres sites internet édités et gérés par des tiers et non par la société BELLUM.',
    },
    {
      id: 'droit-applicable',
      title: 'Droit applicable',
      text: 'Les présentes mentions légales sont régies par le droit français. En cas de litige, et après tentative de résolution amiable, les tribunaux compétents de Paris seront seuls compétents.',
    },
  ],
})
