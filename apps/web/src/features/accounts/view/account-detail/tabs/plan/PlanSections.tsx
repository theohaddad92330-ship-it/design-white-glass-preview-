import { Card, Text } from '@bellum/ui'
import { motion } from 'framer-motion'
import { LayoutList } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cardFade } from '../../motion'
import { buildPlanSections, type PlanSection } from './planSectionsData'
import type { PlanViewData } from './planViewData'

/**
 * #2123.11-.19 — le plan, section par section.
 *
 * Le plan était une pile de cartes dont l'ordre venait du fichier : rien ne
 * disait par quoi commencer. Les sections sont nommées et toujours dans le même
 * ordre, verdict en tête.
 *
 * ⚠️ #2617.2 (21/09/2026) — RENVERSEMENT DATÉ, écrit pour être lu.
 * Ce composant disait : « une section sans contenu le DIT : elle ne disparaît
 * pas, sinon on lit son absence comme "il n'y a rien à faire" (GA-18 / GA-19) ».
 * La doctrine du 20/09 (#2613) tranche l'inverse DANS UNE LISTE : une valeur
 * absente ne produit AUCUNE ligne. Mesuré en production le 21/09 sur un compte
 * réel : sept sections, sept fois « Non produit par la dernière analyse. » —
 * l'écran ne disait rien de plus qu'un écran vide, et le disait sept fois.
 * L'exception SCORE de #2613 ne couvre pas ce bloc : ces sections ne sont pas
 * les axes d'une note, rien ne s'y lit « sur 7 », donc aucun silence ne ment.
 * Ce qui NE bouge pas : une section produite garde son titre, et une absence
 * ne devient jamais un « 0 » ni une phrase de comblement.
 */
export function PlanSections({
  data,
  verdict = null,
}: {
  data: PlanViewData
  /** #2123.11 — le verdict LU par `readStrategicVerdict`, la lecture de la Synthèse. */
  verdict?: Parameters<typeof buildPlanSections>[1]
}) {
  const { t } = useTranslation('accountDetail')
  // #2617.2 — on n'affiche pas ce qu'on n'a pas : une section que la dernière
  // analyse n'a pas produite ne fait aucune ligne, pas même son titre.
  const sections = buildPlanSections(data, verdict).filter(section => section.measured)
  // Rien de produit : pas même le cadre. Un titre « Le plan, section par
  // section » au-dessus du vide promet un plan qui n'existe pas.
  if (sections.length === 0) return null

  return (
    <motion.div variants={cardFade} className="p-1">
      <Card className="overflow-hidden p-0 [--card-spacing:0px]">
        <div className="border-b border-[var(--bellum-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <LayoutList className="size-4 text-[var(--bellum-text-accent)]" />
            <Text element="h3" size="base" weight="semibold">
              {t('planSections.title')}
            </Text>
          </div>
          <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('planSections.subtitle')}
          </Text>
        </div>
        <div className="divide-y divide-[var(--bellum-border)]">
          {sections.map(section => (
            <PlanSectionBlock key={section.key} section={section} />
          ))}
        </div>
      </Card>
    </motion.div>
  )
}

function PlanSectionBlock({ section }: { section: PlanSection }) {
  const { t } = useTranslation('accountDetail')

  return (
    <section className="px-5 py-4">
      <Text element="h4" size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
        {t(`planSections.sections.${section.key}`)}
      </Text>
      {/* #2617.2 — plus de branche « vide » : une section non produite n'arrive
          jamais ici, elle est écartée en amont. */}
      <ul className="mt-2 space-y-2">
        {section.lines.map((line, index) => (
          <li key={`${line.label ?? ''}-${line.value}-${index}`} className="min-w-0">
            {line.label ? (
              <Text size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
                {line.label}
              </Text>
            ) : null}
            <Text size="sm" className="break-words leading-snug text-[var(--bellum-text-primary)]">
              {line.value}
            </Text>
          </li>
        ))}
      </ul>
    </section>
  )
}
