import type { ReactNode } from 'react'
import { Box, Text, TYPE_SCALE, cn } from '@bellum/ui'
import { ScreenGuideSlot, useHasScreenGuideSlot } from '@/components/shell/ScreenGuideSlot'
import { useFirstName } from '@/hooks/useFirstName'

type ScreenIntroProps = {
  /** Le titre AVEC le gabarit `{{firstName}}`. */
  title: string
  /** Le même titre, rédigé sans prénom. Utilisé quand on ne le connaît pas. */
  titleWithoutName: string
  /** Une phrase qui dit à quoi l'écran sert. Absente = rien, pas un vide. */
  subtitle?: string
  /**
   * #2476 — l'action PRINCIPALE de l'écran, sur la MÊME ligne que le titre.
   *
   * Absente par défaut : la plupart des écrans n'ont rien à poser ici, et le
   * rendu reste alors BYTE-IDENTIQUE à avant (un `Box` empilé, sans rangée).
   * Un écran qui a une action d'entête (« Ajouter un contact ») et dont le
   * titre de `PageHeader` ne se rend pas (le nom « vit dans les onglets » de
   * section, cf `PageHeader.tsx`) a sinon une ligne d'entête ORPHELINE — un
   * bouton seul, sans le titre qu'il devrait accompagner.
   */
  action?: ReactNode
  /**
   * #4654 — « Comment travailler ici ? » se pose sur CETTE rangée, à gauche de l'action (voir `ScreenGuideSlot`).
   * `false` quand l'écran dessine lui-même la rangée de ses gestes et y pose l'emplacement : un seul lien par écran.
   */
  guideSlot?: boolean
}

/**
 * L'ENTÊTE D'UN ÉCRAN — un titre qui s'adresse à la personne, et une phrase
 * qui dit à quoi l'écran sert.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE COMPOSANT
 * ─────────────────────────────────────────────────────────────────────────
 * NEUF retours du 02/09 demandent exactement la même chose, écran par écran :
 * « Tes favoris, Louis », « Tes partenaires, Maëlle », « Ton pipe commercial,
 * Maëlle », « Voilà ce qui mérite ton attention, Maëlle »… Les livrer un par
 * un produirait neuf entêtes qui divergeraient en trois semaines — c'est
 * exactement ce qui est déjà arrivé au calcul du prénom, recopié quatre fois
 * sous deux règles différentes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES DEUX PIÈGES DU LITTÉRAL, TRAITÉS ICI
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **Le prénom en dur.** Les issues écrivent « Louis » et « Maëlle » dans la
 *    chaîne. Il vient du profil, par {@link useFirstName}.
 * 2. **Le prénom ABSENT.** Un profil neuf n'en a pas. « Tes favoris, » suivi
 *    d'un vide, ou « Tes favoris, Utilisateur », sont tous deux pires que le
 *    titre nu : le premier est cassé, le second annonce une personnalisation
 *    qu'il n'a pas. D'où `titleWithoutName`, une formule RÉDIGÉE, pas un
 *    gabarit rafistolé — les deux existent en FR et en EN.
 *
 * Le titre est un `h1` : un écran a un titre, et il s'annonce. La largeur de
 * lecture est bornée par le composant `Text`, rien à poser ici.
 */
export function ScreenIntro({ title, titleWithoutName, subtitle, action, guideSlot = true }: ScreenIntroProps) {
  const hasGuideSlot = useHasScreenGuideSlot() && guideSlot
  const firstName = useFirstName()
  const heading = firstName ? title.replace('{{firstName}}', firstName) : titleWithoutName

  const titleBlock = (
    <>
      {/* F2-FIX #4332 — le titre de page vient du RÔLE `pageTitle` (packages/ui), plus d'une taille
          posée ici : 24 px sur /accounts, /projects, /consultants contre 20 px sur /dashboard. */}
      <Text element="h1" className={cn(TYPE_SCALE.pageTitle, 'text-[var(--bellum-text-primary)]')}>
        {heading}
      </Text>
      {subtitle ? (
        <Text element="p" size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
          {subtitle}
        </Text>
      ) : null}
    </>
  )

  if (!action && !hasGuideSlot) {
    return <Box className="mb-4">{titleBlock}</Box>
  }

  return (
    <Box className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <Box className="min-w-0">{titleBlock}</Box>
      {/* #4654 — le lien d'aide, à GAUCHE des boutons : l'action principale reste la plus à droite. */}
      <Box className="ml-auto flex shrink-0 flex-wrap items-center gap-3">
        {hasGuideSlot ? <ScreenGuideSlot /> : null}
        {action}
      </Box>
    </Box>
  )
}
