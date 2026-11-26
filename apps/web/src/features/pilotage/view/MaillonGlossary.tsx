import { Button, Popover, PopoverContent, PopoverTrigger, Text } from '@bellum/ui'
import { HelpCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * LA DÉFINITION DE « MAILLON », DITE UNE FOIS — #2206.51.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE POINT CONSTATE
 * ─────────────────────────────────────────────────────────────────────────────
 * « maillon » est employé partout sur `/pilotage` (`intro`, les alertes, le
 * compteur, chaque niveau de la chaîne) sans qu'aucune définition ne soit
 * accessible — ni tooltip, ni glossaire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MÊME PATRON QUE `CycleVocabulary` (#1323, `features/projects`)
 * ─────────────────────────────────────────────────────────────────────────────
 * Un terme du produit se dit UNE fois, à la demande — un `Popover` derrière un
 * bouton NOMMÉ (GA-32), jamais une icône muette ni un bandeau permanent qui
 * répéterait la phrase de `intro` (GA-26, « rien deux fois sous la même
 * forme ») : celle-ci reste la SEULE prose visible sans geste, celle-ci en est
 * la définition FORMELLE, ouverte à la demande.
 */
export function MaillonGlossary() {
  const { t } = useTranslation('pilotage')
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" icon={HelpCircle} className="pointer-coarse:min-h-11">
          {t('glossary.trigger')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-4">
        <Text element="h2" size="sm" weight="semibold">
          {t('glossary.title')}
        </Text>
        <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t('glossary.definition')}
        </Text>
      </PopoverContent>
    </Popover>
  )
}
