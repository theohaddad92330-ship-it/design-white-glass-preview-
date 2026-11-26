import { deriveCompleteness } from '@bellum/contracts'
import { Box, Popover, PopoverContent, PopoverTrigger } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { AggregateNote } from './AggregateNote'

/**
 * « Calculé sur … » — un agrégat dit sur combien d'éléments il est calculé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE PRIMITIVE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Tome 7, partie A, loi 2 « partout, sans exception », élément n°6 : « à créer,
 * absent de TOUS les agrégats ».
 *
 * Le produit tient déjà la règle AU CALCUL — un axe non évaluable sort du
 * dénominateur, un taux sans dénominateur vaut `null`, une source non lue ne
 * produit aucun chiffre. Puis l'écran affiche « 62 » ou « 4 300 € » tout seul,
 * et le lecteur suppose une mesure COMPLÈTE : un chiffre nu se lit toujours
 * comme une vérité entière. C'est exactement le raisonnement de `ScoreWithAxes`
 * — « personne ne devine que trois axes sur douze n'ont pas pu être évalués » —
 * appliqué à l'échelon au-dessus : la POPULATION.
 *
 * Ce que la primitive REFUSE d'afficher :
 *  - une part sur un dénominateur non lu (ce serait une opinion présentée comme
 *    une mesure) ;
 *  - « 0 % » sur une population vide (c'est une division par rien) ;
 *  - « 100 % » sur un agrégat complet (du bruit : « les 34 comptes » dit mieux).
 * Les quatre règles de bord vivent dans `deriveCompleteness`
 * (`@bellum/contracts`) et non ici : l'API qui produit un agrégat doit pouvoir
 * poser son dénominateur avec les MÊMES règles que l'écran qui l'affiche.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `of` EST OBLIGATOIRE, ET C'EST LE POINT
 * ─────────────────────────────────────────────────────────────────────────
 * « Calculé sur 21 sur 34 » a l'air d'une mesure et n'en dit pas l'objet — le
 * même défaut qu'un score nu. La population se NOMME (« comptes », « maillons »,
 * « affaires lues »), sinon la phrase ne mène à aucun geste. Un `of` vide ne
 * rend rien du tout : mieux vaut le silence qu'une phrase creuse.
 */
export function Completeness({
  counted,
  total,
  of,
  excluded,
  className,
  plain = false,
}: {
  /** Combien d'éléments sont ENTRÉS dans le calcul. Zéro est une mesure. */
  counted: number
  /** La population de référence. `null` = on n'a PAS pu la compter. */
  total: number | null
  /** Le nom de la population, déjà traduit par l'appelant — « comptes », « maillons ». */
  of: string
  /** Ce qui est sorti du dénominateur, NOMMÉ : « 13 sans montant saisi ». */
  excluded?: string[]
  className?: string
  /**
   * #3162 — la phrase ET ce qui est sorti du dénominateur dans le MÊME flux de
   * texte, jamais derrière le `<Popover>` ci-dessous. Réservé aux surfaces qui
   * ne peuvent pas accueillir un second élément interactif imbriqué — une
   * infobulle (Radix `Tooltip`, pensée pour du phrasé, pas pour un
   * déclencheur) en est une. Même dérivation, même deux phrases : seul le
   * CONTENANT change, comme partout ailleurs dans ce fichier (#1816).
   */
  plain?: boolean
}) {
  const { t } = useTranslation('common')
  const population = of.trim()
  if (population.length === 0) return null

  const verdict = deriveCompleteness({ counted, total, excluded })
  const sentence =
    verdict.kind === 'complete'
      ? t('completeness.complete', { total: verdict.total, of: population })
      : verdict.kind === 'partial'
        ? t('completeness.partial', {
            counted: verdict.counted,
            total: verdict.total,
            of: population,
            share: verdict.share,
          })
        : verdict.kind === 'unknownTotal'
          ? t('completeness.unknownTotal', { counted: verdict.counted, of: population })
          : t('completeness.nothingToCount', { of: population })

  // Ce qui est sorti du calcul est NOMMÉ. Même discipline que les axes non
  // évaluables d'un score : « 13 exclus » n'apprend rien, « 13 sans montant
  // saisi » dit quoi compléter pour que l'agrégat devienne fiable.
  const excludedSentence =
    verdict.excluded.length > 0 ? t('completeness.excluded', { items: verdict.excluded.join(', ') }) : null

  if (plain) {
    // Pas de `<Text>` : la couleur atténuée d'`AggregateNote` est réglée pour
    // les surfaces habituelles du produit, jamais pour l'intérieur toujours
    // sombre d'une infobulle — le texte hérite donc de la couleur que
    // `TooltipContent` a déjà posée.
    return (
      <span className={className}>
        {sentence}
        {excludedSentence ? ` ${excludedSentence}` : ''}
      </span>
    )
  }

  // `AggregateNote` — LA voix des qualifications d'un agrégat, partagée avec
  // `ComputedAt` (l'horodatage de calcul). Les deux se posent au même endroit
  // et doivent se lire comme un seul bloc : leur taille, leur ton et leur
  // couleur vivent donc à un seul endroit, pas recopiés ici.
  if (!excludedSentence) {
    return (
      <Box className={className}>
        <AggregateNote>{sentence}</AggregateNote>
      </Box>
    )
  }

  return (
    <Box className={className}>
      {/* #1866 — « réduis / supprime le texte grisé il prend de la place pour
          rien ». Mesuré sur `/consultants` le 11/09/2026 : DEUX notes grises
          empilées sous un chiffre de 24 px, 16 px + 32 px = 48 px dans une
          tuile qui en fait ~110.

          Ce qui RESTE dans le flux : la phrase qui porte le DÉNOMINATEUR.
          C'est elle qui rend le chiffre vrai — « 0 sur les 10 fiches
          mesurables » est vrai, « 0 sur 31 » est faux, et c'est le second que
          l'œil lit sous un grand zéro nu. Elle ne se replie jamais.

          Ce qui se REPLIE : le détail de ce qui est sorti du dénominateur. Il
          dit quoi compléter, il ne change pas la lecture du nombre. Derrière
          un `<button type="button">` (GA-35 — ce qui se clique se tabule), et
          jamais dans un `title=` : le dépôt a déjà payé « la donnée rangée
          dans un attribut title », qui n'existe ni au clavier ni au doigt.

          Le nom accessible du bouton est son TEXTE (la phrase) plus l'indice
          replié : un `aria-label` aurait REMPLACÉ la phrase, et le lecteur
          d'écran aurait perdu le dénominateur — exactement ce qu'on protège.

          Pas de plancher tactile de 44 px ici, et c'est l'exception que GA-30
          nomme elle-même (« un lien de texte dans une phrase reste à la
          hauteur de sa ligne ») : l'agrandir rendrait au doigt les 32 px qu'on
          vient de gagner. La cible reste large — le bouton occupe toute la
          largeur de la note. */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="block w-full cursor-pointer rounded-sm text-left underline decoration-dotted decoration-from-font underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bellum-text-accent)]"
          >
            <AggregateNote element="span">{sentence}</AggregateNote>
            <span className="sr-only">{t('completeness.excludedHint')}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" side="bottom" sideOffset={6} className="w-auto max-w-xs p-3">
          <AggregateNote>{excludedSentence}</AggregateNote>
        </PopoverContent>
      </Popover>
    </Box>
  )
}
