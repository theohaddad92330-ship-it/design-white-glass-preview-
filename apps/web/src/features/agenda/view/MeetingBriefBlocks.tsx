import type { MeetingBriefBlock, MeetingBriefGround } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * Un bloc du brief, et — dessous — la ligne qui dit d'où il vient.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE LIGNE EST LE COMPOSANT, ET PAS UN DÉTAIL DU COMPOSANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Un brief se lit à voix haute en réunion. « 17 postes Data ouverts » énoncé
 * sans sa source ni sa date engage celui qui le dit ; la même phrase suivie de
 * « sources datées, relevé du 20/08 » engage la source. C'est la différence
 * entre un outil et une rumeur, et elle tient à cette ligne-là.
 *
 * Elle n'est donc jamais optionnelle : `MeetingBriefGround` n'a pas de cas
 * « rien ». Le seul état sans ligne — `unattributed` — a déjà fait disparaître
 * le bloc en amont (`buildMeetingBrief`), et le `default` ci-dessous ne rend
 * rien plutôt que d'écrire une phrase rassurante par défaut.
 */
export function MeetingBriefBlockCard({ block }: { block: MeetingBriefBlock }) {
  const { t } = useTranslation('briefing')

  return (
    <Box className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
      <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-accent)]">
        {t('agenda.brief.blockIndex', { index: String(block.index).padStart(2, '0') })}
        {' · '}
        {t(`agenda.brief.block.${block.key}`)}
      </Text>

      <Box className="mt-2 flex flex-col gap-1">
        {block.lines.map(line => (
          <Text key={line} element="p" size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
            {line}
          </Text>
        ))}
        {/* #2319.25 — le brief tient en cinq minutes : ce qui a été coupé est
            COMPTÉ, jamais perdu en silence. */}
        {block.moreCount > 0 ? (
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('agenda.brief.more', { count: block.moreCount })}
          </Text>
        ) : null}
      </Box>

      {block.note ? (
        <Text element="p" size="xs" className="mt-2 text-[var(--bellum-text-secondary)]">
          {block.note}
        </Text>
      ) : null}

      {/* #2102.31 — ce que CE bloc n'a pas pu établir, nommé. Liste vide = aucune ligne : jamais « 0 », jamais un
          blanc qui rassure. */}
      {block.unknowns.length > 0 ? (
        <Text element="p" size="xs" className="mt-2 text-[var(--bellum-text-secondary)]">
          {t('agenda.brief.unknownsLine', {
            list: block.unknowns
              .map(unknown => t(`agenda.brief.unknown.${unknown}`))
              .join(t('agenda.brief.sourceJoin')),
          })}
        </Text>
      ) : null}

      <GroundLine ground={block.ground} />
    </Box>
  )
}

/**
 * La ligne d'origine. Quatre phrases, une par état, et elles ne se ressemblent
 * pas : un bloc sourcé nomme sa source ET sa date ; un bloc déduit dit qu'il
 * l'est et renvoie la vérification au rendez-vous ; un bloc mixte sépare
 * explicitement les deux moitiés ; un bloc calculé nomme ce dont il dérive.
 */
function GroundLine({ ground }: { ground: MeetingBriefGround }) {
  const { t, i18n } = useTranslation('briefing')
  const day = new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: '2-digit' })
  const named = (sources: readonly string[]) =>
    sources.map(source => t(`agenda.brief.source.${source}`)).join(t('agenda.brief.sourceJoin'))

  const text = (() => {
    switch (ground.kind) {
      case 'sourced':
        return t('agenda.brief.ground.sourced', {
          sources: named(ground.sources),
          date: day.format(new Date(ground.observedAt)),
        })
      case 'mixed':
        return t('agenda.brief.ground.mixed', {
          sources: named(ground.sources),
          date: day.format(new Date(ground.observedAt)),
          probable: ground.probable.map(item => t(`agenda.brief.probable.${item}`)).join(t('agenda.brief.sourceJoin')),
        })
      case 'inferred':
        return t('agenda.brief.ground.inferred')
      case 'derived':
        return t('agenda.brief.ground.derived', {
          from: ground.from.map(item => t(`agenda.brief.derivedFrom.${item}`)).join(t('agenda.brief.sourceJoin')),
        })
      default:
        // `unattributed` : le bloc n'aurait pas dû arriver jusqu'ici. On n'écrit
        // rien — surtout pas une phrase rassurante qui lui rendrait sa crédibilité.
        return null
    }
  })()

  if (!text) return null
  return (
    <Text element="p" size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
      {text}
    </Text>
  )
}
