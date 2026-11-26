import { Card, Text } from '@bellum/ui'
import { motion } from 'framer-motion'
import { ExternalLink, Undo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cardFade } from '../../motion'
import type { ReverseProspect } from './planViewData'

/**
 * Prospection inversée (Annexe Méthodologie Sales ESN p7 canal 3 / p9) : les
 * personnes qui ont TRAVAILLÉ chez ce compte et sont ailleurs aujourd'hui. Le
 * pipeline les détectait déjà (historique de poste Apollo) mais personne ne les
 * affichait — un angle chaud jeté. Lecture seule, additif.
 *
 * Rien n'est fabriqué : sans donnée dans le dossier, la carte ne s'affiche pas.
 */
export function ReverseProspectsSection({ prospects }: { prospects: ReverseProspect[] }) {
  const { t } = useTranslation('accountDetail')

  if (prospects.length === 0) return null

  return (
    <motion.div variants={cardFade} className="p-1 mt-4">
      <Card className="overflow-hidden p-0 [--card-spacing:0px]">
        <div className="border-b border-[var(--bellum-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Undo2 className="size-4 text-[var(--bellum-text-accent)]" />
            <Text element="h3" size="base" weight="semibold">
              {t('reverseProspects.title')}
            </Text>
          </div>
          <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('reverseProspects.subtitle')}
          </Text>
        </div>

        <ul className="divide-y divide-[var(--bellum-border)]">
          {prospects.map(prospect => (
            <li key={prospect.linkedinUrl || prospect.fullName} className="px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Text size="sm" weight="semibold" className="break-words text-[var(--bellum-text-primary)]">
                    {prospect.fullName}
                  </Text>
                  {prospect.title ? (
                    <Text size="xs" className="mt-0.5 break-words text-[var(--bellum-text-secondary)]">
                      {prospect.title}
                    </Text>
                  ) : null}
                  {prospect.currentCompany ? (
                    <Text size="xs" className="mt-0.5 break-words text-[var(--bellum-text-secondary)]">
                      {t('reverseProspects.nowAt', { company: prospect.currentCompany })}
                    </Text>
                  ) : null}
                </div>
                {prospect.linkedinUrl ? (
                  <a
                    href={prospect.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-accent)]"
                    aria-label={t('reverseProspects.openProfile', { name: prospect.fullName })}
                  >
                    <ExternalLink className="size-4" />
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </motion.div>
  )
}
