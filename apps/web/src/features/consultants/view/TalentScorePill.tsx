import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text, cn } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { talentCompleteness, talentScore, type TalentRow, type TalentScoreInput } from '@bellum/contracts'
import { ScoreWithAxes } from '@/components/primitives/ScoreWithAxes'

/**
 * Théo C talents-vivier.R3 — LA PASTILLE DE SCORE, SOUS LE MÉTIER.
 *
 * « 82 /100 · 4 axes sur 4 », ouvrable : le score est /100 EN CLAIR et ses axes se lisent d'un geste
 * (modale) — la doctrine « un score n'est jamais nu » tenue sans quatrième colonne (Louis 22/10, Q14).
 * Un axe non évaluable SORT du calcul et reste NOMMÉ dans la modale ; une fiche dont aucun axe ne
 * l'est lit « Score non évaluable », jamais « 0 /100 ».
 *
 * ⚠️ Le score range la FICHE, il ne classe pas la personne : aucun critère protégé n'y entre
 * (`talentScore`, contrats), et la phrase de la modale le dit.
 */
export function TalentScorePill({
  row,
  displayName,
  className,
}: {
  row: TalentScoreInput & Pick<TalentRow, 'id'>
  displayName: string
  className?: string
}) {
  const { t } = useTranslation('consultants')
  const [open, setOpen] = useState(false)
  const score = talentScore(row, new Date())
  const completeness = talentCompleteness(row)
  // #4500 (maquette : Thomas Lefèvre) — une fiche non évaluable l'ÉCRIT, et s'ouvre comme les autres : ses axes,
  // tous nommés « non évaluable », se lisent d'un geste — jamais un tiret muet, jamais « 0 /100 ».
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className={cn(
          '-ml-1.5 h-auto min-h-0 max-w-full justify-start whitespace-normal px-1.5 py-0.5 text-left font-normal',
          score.value === null && 'text-[var(--bellum-text-muted)]',
          className,
        )}
        data-testid="vivier-score-pill"
        aria-label={t('vivier.score.openAria', { name: displayName })}
        onClick={event => {
          event.stopPropagation()
          setOpen(true)
        }}
      >
        <span className="break-words">
          {score.value === null
            ? t('vivier.score.notEvaluable')
            : `${t('vivier.score.pill', { score: score.value })} · ${t('vivier.score.axesOf', { count: score.evaluable })}`}
        </span>
      </Button>
      {open ? (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent closeLabel={t('common:actions.close')} className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {score.value === null
                  ? t('vivier.score.notEvaluable')
                  : t('vivier.score.dialogTitle', { score: score.value })}
              </DialogTitle>
              <DialogDescription>{displayName}</DialogDescription>
            </DialogHeader>
            <ScoreWithAxes
              score={score.value}
              max={100}
              axes={score.axes.map(axis => ({
                label: t(`vivier.score.axes.${axis.key}`),
                score: axis.score,
                max: 100,
              }))}
            />
            {/* Théo C talents-vivier.A6 — la complétude de la fiche garde ses CINQ axes (identité, compétences,
                disponibilité, tarif, CV) : ils se lisent ici, sous l'axe « Fiche complète » qui les résume. */}
            {row.reviewStatus === 'needs_review' ? null : (
              <div className="flex flex-col gap-1">
                <Text size="sm" weight="medium">
                  {t('vivier.score.fileDetail')}
                </Text>
                <ScoreWithAxes
                  score={completeness.score}
                  max={completeness.max}
                  axes={completeness.axes.map(axis => ({
                    label: t(`completeness.axes.${axis.key}`),
                    score: axis.score,
                    max: 100,
                  }))}
                />
              </div>
            )}
            <Text size="sm" className="text-[var(--bellum-text-muted)]">
              {t('vivier.score.footnote')}
            </Text>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}
