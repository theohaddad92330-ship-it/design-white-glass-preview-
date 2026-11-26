import type { OutreachTemplateKey } from '@bellum/contracts'
import {
  Box,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Text,
  cn,
} from '@bellum/ui'
import { ArrowRight, BookOpen, ChevronDown, Plus, Send, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CreateModelDialog, LauraModelDialog, WebPageModelDialog } from './SequenceModelDialogs'

/**
 * Théo C sequences-liste.R2 / R3 / N1 / N2 / N4 — « PRÉPARER UNE CAMPAGNE », puis « Commencer avec un modèle ».
 *
 * Deux blocs, dans l'ordre de la maquette : le HÉROS (sur-titre, titre sur deux lignes, phrase, « Partir de zéro »
 * en bouton principal | les quatre étapes en grille 2 × 2), puis la tête de bloc « Commencer avec un modèle » avec
 * ses trois portes (toute la bibliothèque, « Créer mon modèle » en menu, « Préparer avec Laura ») et la galerie des
 * trois modèles de départ — chaque carte entière est un bouton qui pré-remplit la fenêtre de création.
 * Mobile : le héros passe sur une colonne, chaque carte garde son bandeau illustré à gauche (120 px).
 */

const STARTER_CARDS = [
  { key: 'prospection', template: 'prospection_3_touches', tone: 'lilac' },
  { key: 'development', template: 'nurturing', tone: 'graphite' },
  { key: 'followup', template: 'post_meeting_followup', tone: 'mist' },
] as const satisfies readonly { key: string; template: OutreachTemplateKey; tone: string }[]

// Les trois bandeaux de la galerie (lilas · graphite · brume), en jetons : parité clair / sombre, aucun hexadécimal.
const ART_TONE = {
  lilac: { art: 'bg-[var(--accent-soft-bg)]', label: 'text-[var(--accent-soft-text)]', tilt: '-rotate-6' },
  graphite: { art: 'bg-[var(--bellum-text-primary)]', label: 'text-[var(--bellum-bg)]', tilt: 'rotate-6' },
  mist: { art: 'bg-[var(--info-soft-bg)]', label: 'text-[var(--info-soft-text)]', tilt: '-rotate-3' },
} as const

const PILLS = ['audience', 'objective', 'messages', 'review'] as const

export function SequenceStarters({
  modelCount,
  onStartFromScratch,
  onUseTemplate,
  onOpenLibrary,
  onGuide,
  onComposeByHand,
}: {
  modelCount: number
  onStartFromScratch: () => void
  onUseTemplate: (template: OutreachTemplateKey) => void
  onOpenLibrary: () => void
  onGuide: () => void
  onComposeByHand: () => void
}) {
  const { t } = useTranslation('outreach')
  // Théo C sequences-liste.A11 — les mêmes fenêtres que la bibliothèque (une seule définition, GA-26).
  const [dialog, setDialog] = useState<'create' | 'web' | 'laura' | null>(null)
  return (
    <Box className="flex min-w-0 flex-col gap-8" data-testid="sequence-starters">
      {/* Le héros — `.sequence-intro-v2` : deux colonnes, rayon large, fond de surface. */}
      <section
        aria-labelledby="sequence-intro-title"
        data-testid="sequence-intro"
        className="grid min-w-0 gap-6 rounded-overlay border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-6 md:p-8 lg:grid-cols-2 lg:gap-12 lg:px-10"
      >
        <Box className="flex min-w-0 flex-col items-start gap-3">
          <Text size="xs" weight="bold" className="uppercase tracking-widest text-[var(--bellum-text-muted)]">
            {t('starter.eyebrow')}
          </Text>
          <h2
            id="sequence-intro-title"
            className="text-2xl font-semibold leading-tight tracking-tight text-[var(--bellum-text-primary)] md:text-3xl"
          >
            {t('starter.title')}
            <br />
            {t('starter.titleLine2')}
          </h2>
          <Text size="sm" className="max-w-md leading-relaxed text-[var(--bellum-text-secondary)]">
            {t('starter.lead')}
          </Text>
          <Button type="button" className="mt-2 pointer-coarse:min-h-11" onClick={onStartFromScratch}>
            <Plus className="size-4" aria-hidden="true" />
            {t('starter.fromScratch')}
          </Button>
        </Box>
        <ol className="grid list-none content-center grid-cols-2 gap-3 p-0" aria-label={t('starter.stepsLabel')}>
          {PILLS.map((pill, index) => (
            <li
              key={pill}
              className="flex min-w-0 flex-col rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-4 py-4"
            >
              <Text size="xs" weight="bold" className="text-[var(--bellum-text-accent)]">
                {String(index + 1).padStart(2, '0')}
              </Text>
              <Text size="base" weight="semibold" className="mt-2">
                {t(`starter.pill.${pill}.name`)}
              </Text>
              <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
                {t(`starter.pill.${pill}.hint`)}
              </Text>
            </li>
          ))}
        </ol>
      </section>

      {/* « Commencer avec un modèle » — `.block-head` + `.a14-inline` + `.sequence-template-gallery`. */}
      <section
        aria-labelledby="sequence-models-title"
        data-testid="sequence-models"
        className="flex min-w-0 flex-col gap-4"
      >
        <Box className="flex flex-col gap-1">
          <Text element="h2" id="sequence-models-title" size="xl" weight="semibold">
            {t('starter.withModel')}
          </Text>
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('starter.modelCount', { count: modelCount })}
          </Text>
        </Box>
        <Box className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="pointer-coarse:min-h-11" onClick={onOpenLibrary}>
            <BookOpen className="size-4" aria-hidden="true" />
            {t('starter.exploreLibrary')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="pointer-coarse:min-h-11">
                <Plus className="size-4" aria-hidden="true" />
                {t('starter.createModel')}
                <ChevronDown className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => setDialog('create')}>{t('libraryView.menu.scratch')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog('web')}>{t('libraryView.menu.web')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={onGuide}>{t('libraryView.menu.guided')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={onComposeByHand}>{t('starter.model.byHand')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* N1 — la porte « Laura prépare », rangée ici : elle ne figure qu'une fois. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pointer-coarse:min-h-11"
            onClick={() => setDialog('laura')}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {t('libraryView.prepareWithLaura')}
          </Button>
        </Box>
        <ul className="grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-3 md:gap-5" data-testid="starter-gallery">
          {STARTER_CARDS.map(card => {
            const tone = ART_TONE[card.tone]
            return (
              <li key={card.key} className="min-w-0">
                <button
                  type="button"
                  aria-label={t('starter.useModelNamed', { name: t(`starter.card.${card.key}.name`) })}
                  onClick={() => onUseTemplate(card.template)}
                  className="grid h-full w-full grid-cols-[7.5rem_minmax(0,1fr)] overflow-hidden rounded-overlay border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] text-left transition-colors duration-immediate hover:border-[var(--bellum-border-strong)] hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bellum-primary)] md:grid-cols-1 md:grid-rows-[8rem_auto]"
                >
                  <span
                    aria-hidden="true"
                    className={cn('relative block min-h-44 overflow-hidden p-4 md:min-h-0', tone.art)}
                  >
                    <span className={cn('text-xs font-bold uppercase tracking-wider', tone.label)}>
                      {t(`starter.card.${card.key}.kind`)}
                    </span>
                    <span
                      className={cn(
                        'absolute -right-8 top-8 flex h-32 w-36 flex-col gap-2 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-5 shadow-card md:right-7',
                        tone.tilt,
                      )}
                    >
                      <span className="block h-1 w-2/5 rounded-full bg-[var(--bellum-primary-300)]" />
                      <span className="block h-1 w-3/4 rounded-full bg-[var(--bellum-border)]" />
                      <span className="block h-1 w-3/4 rounded-full bg-[var(--bellum-border)]" />
                      <span className="absolute bottom-7 right-4 grid size-9 place-items-center rounded-card bg-[var(--bellum-primary)] text-[var(--bellum-on-primary)]">
                        <Send className="size-4" />
                      </span>
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-col gap-2 p-5">
                    <Text element="span" size="base" weight="semibold" className="leading-snug">
                      {t(`starter.card.${card.key}.name`)}
                    </Text>
                    <Text element="span" size="sm" className="leading-relaxed text-[var(--bellum-text-secondary)]">
                      {t(`starter.card.${card.key}.hint`)}
                    </Text>
                    <Text
                      element="span"
                      size="xs"
                      weight="semibold"
                      className="mt-auto inline-flex items-center gap-2 pt-3 text-[var(--bellum-text-accent)]"
                    >
                      {t('starter.useModel')}
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Text>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
      <CreateModelDialog
        key={dialog === 'create' ? 'open' : 'closed'}
        open={dialog === 'create'}
        onOpenChange={open => setDialog(open ? 'create' : null)}
      />
      <LauraModelDialog open={dialog === 'laura'} onOpenChange={open => setDialog(open ? 'laura' : null)} />
      <WebPageModelDialog open={dialog === 'web'} onOpenChange={open => setDialog(open ? 'web' : null)} />
    </Box>
  )
}
