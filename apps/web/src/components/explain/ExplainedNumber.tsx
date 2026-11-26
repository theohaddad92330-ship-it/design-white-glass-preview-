import { canExplainNumber, type NumberExplanation } from '@bellum/contracts'
import { Popover, PopoverContent, PopoverTrigger } from '@bellum/ui'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExplainPanel } from './ExplainPanel'

/**
 * « EXPLIQUE-MOI CE CHIFFRE » — le geste, PDF 6 §5.1.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE GESTE N'APPARAÎT PAS TOUJOURS, ET C'EST LA RÈGLE
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ Un chiffre qui ne sait pas expliquer son calcul **n'affiche pas le geste**.
 * `canExplainNumber` en est le seul juge, et il vit dans les contrats pour que
 * l'écran ne puisse pas décider autrement au cas par cas.
 *
 * Un bouton qui ouvre un panneau vide est pire que pas de bouton : il se clique
 * une fois, et l'utilisateur apprend que le geste ne sert à rien — y compris sur
 * les chiffres où il aurait servi.
 *
 * Sans explication, l'enfant est rendu TEL QUEL : aucun conteneur en plus,
 * aucune classe, rien qui déplace le chiffre d'un pixel. Un geste absent ne doit
 * pas se voir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI SE CLIQUE SE TABULE (GA-35)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le déclencheur est un `<button type="button">` et jamais un `<div onClick>` :
 * un `div` n'a ni tabulation, ni Entrée, ni annonce. `asChild` de Radix pose sur
 * ce bouton `aria-expanded`, `aria-controls` et la fermeture par Échap ; il ne
 * pose PAS de nom accessible — c'est `aria-label` qui le donne, sans quoi un
 * lecteur d'écran annonce « bouton, 12,4 % » (GA-32).
 *
 * Cible tactile : `min-h-11 min-w-11` sous pointeur grossier (44 px, GA-30). Le
 * chiffre lui-même est souvent plus petit que ça.
 */
export function ExplainedNumber({
  explanation,
  label,
  children,
}: {
  /** `null` / `undefined` = pas de geste. Voir le bloc ci-dessus. */
  explanation: NumberExplanation | null | undefined
  /** Le nom du chiffre, DÉJÀ traduit — il devient le nom accessible du bouton. */
  label: string
  children: ReactNode
}) {
  const { t } = useTranslation('explain')
  const [open, setOpen] = useState(false)

  if (!canExplainNumber(explanation) || !explanation) return <>{children}</>

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('trigger', { label })}
          className="inline-flex cursor-pointer items-center rounded-md text-left underline decoration-dotted decoration-from-font underline-offset-4 coarse:min-h-11 coarse:min-w-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bellum-text-accent)]"
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        className="z-overlay w-auto rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-0 shadow-[var(--shadow-elevated)]"
      >
        <ExplainPanel explanation={explanation} />
      </PopoverContent>
    </Popover>
  )
}
