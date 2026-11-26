import {
  CALL_GOLDEN_RULE,
  CALL_PREP_CHECKLIST,
  DEFENSE_BLOCKS,
  DEFENSE_CONDUCT_RULES,
  DEFENSE_QUESTIONS,
  DISCOVERY_FAMILIES,
  DISCOVERY_QUESTIONS,
  selectQuestions,
} from '@bellum/contracts'
import { Card, FilterChips, Text } from '@bellum/ui'
import { motion } from 'framer-motion'
import { HelpCircle, Phone } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cardFade } from '../../motion'

/**
 * Les questions à poser — découverte, soutenance, appel.
 *
 * ⚠️ Les trois bibliothèques du guide commercial n'existaient nulle part dans
 * le produit : elles vivaient dans des PDF et dans un JSON sans appelant. La
 * seule banque de questions branchée était celle du chatbot du site vitrine.
 *
 * ## On SÉLECTIONNE, on ne récite pas
 *
 * Trois à huit questions, jamais la banque entière. Cinquante questions à plat
 * devant quelqu'un qui entre en rendez-vous dans dix minutes ne sont pas un
 * outil, c'est un document — et un document ne se lit pas avant un rendez-vous.
 *
 * Aucune famille n'est sautée sur la seule foi d'un script de préparation
 * (#3717) : un texte généré n'est pas une réponse du client.
 */
export function QuestionLibraryCard() {
  const { t } = useTranslation('accountDetail')
  const [tab, setTab] = useState<'discovery' | 'defense' | 'call'>('discovery')

  // #3717 — AUCUNE famille n'est sautée : un script de préparation est un texte
  // GÉNÉRÉ, il ne prouve pas qu'une réponse client existe. Seul ce que le
  // commercial a entendu en rendez-vous pourrait marquer une famille répondue,
  // et rien ne l'enregistre encore.
  const answered: string[] = []

  const discovery = useMemo(
    () => selectQuestions({ families: [...DISCOVERY_FAMILIES], bank: DISCOVERY_QUESTIONS, answered, limit: 6 }),
    [answered],
  )
  const defense = useMemo(
    () => selectQuestions({ families: [...DEFENSE_BLOCKS], bank: DEFENSE_QUESTIONS, limit: 5 }),
    [],
  )

  return (
    <motion.div variants={cardFade} className="p-1 mt-4">
      <Card className="overflow-hidden p-0 [--card-spacing:0px]">
        <div className="border-b border-[var(--bellum-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="size-4 text-[var(--bellum-text-accent)]" />
            <Text element="h3" size="base" weight="semibold">
              {t('questionLibrary.title')}
            </Text>
          </div>
          <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('questionLibrary.subtitle')}
          </Text>

          <FilterChips
            className="mt-3"
            size="sm"
            ariaLabel={t('questionLibrary.title')}
            options={(['discovery', 'defense', 'call'] as const).map(key => ({
              value: key,
              label: t(`questionLibrary.tab.${key}`),
            }))}
            value={tab}
            onChange={next => next && setTab(next)}
          />
        </div>

        <div className="px-5 py-4">
          {tab === 'discovery' ? <QuestionList questions={discovery} /> : null}

          {tab === 'defense' ? (
            <>
              <QuestionList questions={defense} />
              <div className="mt-4 border-t border-[var(--bellum-border)] pt-3">
                <Text element="h4" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
                  {t('questionLibrary.conductTitle')}
                </Text>
                <PlainList items={DEFENSE_CONDUCT_RULES} />
              </div>
            </>
          ) : null}

          {tab === 'call' ? (
            <>
              <Text element="h4" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
                {t('questionLibrary.callChecklist')}
              </Text>
              <PlainList items={CALL_PREP_CHECKLIST} />
              <div className="mt-3 flex gap-2 border-t border-[var(--bellum-border)] pt-3">
                <Phone className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-accent)]" />
                <Text element="p" size="sm">
                  {CALL_GOLDEN_RULE}
                </Text>
              </div>
            </>
          ) : null}
        </div>
      </Card>
    </motion.div>
  )
}

function QuestionList({ questions }: { questions: string[] }) {
  const { t } = useTranslation('accountDetail')
  // Une liste vide N'EST PAS un bug : elle veut dire qu'il ne reste rien à
  // demander. Retomber sur la banque entière ferait exactement ce que la règle
  // de sélection interdit.
  if (questions.length === 0) {
    return (
      <Text size="sm" color="text-[var(--bellum-text-muted)]">
        {t('questionLibrary.nothingLeft')}
      </Text>
    )
  }
  return <PlainList items={questions} />
}

function PlainList({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {items.map(item => (
        <li key={item} className="flex gap-2">
          <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-[var(--bellum-text-accent)]" />
          <Text element="p" size="sm">
            {item}
          </Text>
        </li>
      ))}
    </ul>
  )
}
