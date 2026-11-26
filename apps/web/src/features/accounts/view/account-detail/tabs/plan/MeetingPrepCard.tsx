import { Card, Text } from '@bellum/ui'
import { motion } from 'framer-motion'
import { MessagesSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cardFade } from '../../motion'
import type { MeetingPrep } from './planViewData'

/**
 * De quoi préparer le rendez-vous : les questions qui font VERBALISER au client
 * ses critères et ses douleurs, et la trame de l'entretien.
 *
 * ⚠️ La phase 4 produit `powerQuestions` et `rdvScript` à CHAQUE analyse — un
 * appel modèle payé à chaque run — et aucun écran de l'application ne les
 * lisait : seul le back-office les affichait. Le commercial payait une sortie
 * qu'il n'avait jamais sous les yeux. Trouvé en croisant le Recovery Pack de
 * juin 2026 avec le code.
 *
 * Rien n'est fabriqué : sans questions ni trame dans le dossier, la carte ne
 * s'affiche pas. Une carte vide ferait croire que l'analyse n'a rien produit.
 */
export function MeetingPrepCard({ prep }: { prep: MeetingPrep | null }) {
  const { t } = useTranslation('accountDetail')

  if (!prep) return null

  return (
    <motion.div variants={cardFade} className="p-1 mt-4">
      <Card className="overflow-hidden p-0 [--card-spacing:0px]">
        <div className="border-b border-[var(--bellum-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <MessagesSquare className="size-4 text-[var(--bellum-text-accent)]" />
            <Text element="h3" size="base" weight="semibold">
              {t('meetingPrep.title')}
            </Text>
          </div>
          <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('meetingPrep.subtitle')}
          </Text>
        </div>

        {prep.powerQuestions.length > 0 ? (
          <div className="px-5 py-4">
            <Text element="h4" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
              {t('meetingPrep.questions')}
            </Text>
            <ul className="mt-2 flex flex-col gap-2">
              {prep.powerQuestions.map(question => (
                <li key={question} className="flex gap-2">
                  <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-[var(--bellum-text-accent)]" />
                  <Text element="p" size="sm">
                    {question}
                  </Text>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {prep.script.length > 0 ? (
          <div className="border-t border-[var(--bellum-border)] px-5 py-4">
            <Text element="h4" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
              {t('meetingPrep.script')}
            </Text>
            <ol className="mt-2 flex flex-col gap-3">
              {prep.script.map(section => (
                <li key={section.key}>
                  <Text element="p" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
                    {t(`meetingPrep.section.${section.key}`)}
                  </Text>
                  <Text element="p" size="sm" className="mt-0.5">
                    {section.text}
                  </Text>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </Card>
    </motion.div>
  )
}
