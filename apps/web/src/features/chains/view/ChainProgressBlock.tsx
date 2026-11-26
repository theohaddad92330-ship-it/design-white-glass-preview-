import { chainFlowSteps, type Chain, type ChainDerivation, type ChainSubjectType } from '@bellum/contracts'
import { PendingBandSlot } from '@/components/primitives/PendingBandSlot'
import { Badge, Box, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useChainForSubject } from '../api'
import { ChainChecklist, ChainEvidence } from './ChainEvidence'
import { ChainFlow } from './ChainFlow'

/**
 * LE PARCOURS D'UN DOSSIER, SUR SA FICHE (#1505).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE BLOC EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Ne pas obliger l'utilisateur à ouvrir Parcours pour savoir où en est un
 * dossier. » Le moteur répond à une question qu'on se pose EN TRAVAILLANT — « où
 * en est ce besoin, et qu'attend-on de lui ? » — et une réponse qui vit sur un
 * autre écran n'est pas une réponse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ **Pas une seconde barre de statut modifiable.** C'est le garde-fou explicite
 * du retour, et il est tenu par l'absence de code : ce bloc n'a AUCUN chemin
 * d'écriture vers la position — elle se dérive de l'objet que la fiche affiche
 * déjà. Le seul geste possible est de cocher un geste HORS OUTIL, qu'aucune
 * table ne porte et qui n'entre donc en concurrence avec rien.
 *
 * Cliquer sur une étape ouvre la page SOURCE de cette étape (matching,
 * positionnements, relevés, facturation) : c'est là que le geste se fait, et
 * c'est ce qui change la position.
 *
 * ⚠️ Le bloc ne s'affiche pas quand aucun parcours ne couvre le dossier. Un
 * encart vide sur trois écrans quotidiens apprend à ne plus les regarder.
 */

/**
 * OÙ MÈNE UNE ÉTAPE — la page qui porte le geste (#1505).
 *
 * ⚠️ Une étape sans destination rend `null` et devient un simple libellé : un
 * lien qui ne va nulle part est pire qu'un texte, parce qu'il promet un écran.
 * Les destinations sont des routes qui EXISTENT ; en inventer une donnerait un
 * 404 au clic.
 */
export function stepDestination(chain: Chain, position: number, subjectId: string): string | null {
  // ⚠️ AUCUN paramètre de recherche. `/missions/cra`, `/missions/facturation` et
  // `/consultants/submissions` ne déclarent pas de `validateSearch` : un
  // `?needId=…` y serait purement décoratif, et un lien qui promet un filtre
  // qu'il n'applique pas est pire qu'un lien qui ouvre simplement l'écran.
  if (chain.key === 'sourcing_matching') {
    if (position >= 4 && position <= 7) return '/consultants'
    return `/projects/needs/${subjectId}`
  }
  if (chain.key === 'onboarding_delivery') {
    if (position === 6) return '/missions/cra'
    if (position === 7) return '/missions/facturation'
    return `/missions/${subjectId}`
  }
  if (chain.subjectType === 'account') return `/accounts/${subjectId}`
  if (chain.subjectType === 'consultant') return `/consultants/${subjectId}`
  // Un projet n'a pas de page à lui : la liste est sa page source.
  if (chain.subjectType === 'project') return '/projects'
  return null
}

/** L'étape suivante, s'il y en a une — « ce qu'on attend de ce dossier ». */
function nextStepLabel(chain: Chain, derivation: ChainDerivation, locale: 'fr' | 'en'): string | null {
  if (derivation.kind === 'undetermined') return null
  const steps = chainFlowSteps(chain)
  const next = steps.find(step => step.position === derivation.position + 1)
  return next?.label[locale] ?? null
}

type ChainEntry = NonNullable<ReturnType<typeof useChainForSubject>['data']>[number]

/** Le rendu COMPLET d'un parcours : frise, étape, pourquoi, gestes hors outil. */
function ChainEntryFull({
  entry,
  subjectId,
  locale,
  inDialog = false,
}: {
  entry: ChainEntry
  subjectId: string
  locale: 'fr' | 'en'
  /** #3525 — dans la modale, le titre porte déjà le nom et la modale est déjà une carte. */
  inDialog?: boolean
}) {
  const { t } = useTranslation('chains')
  // La dérivation est extraite dans une constante AVANT d'être discriminée :
  // TypeScript ne réduit pas le type d'une union lue à travers une chaîne
  // de propriétés, et `entry.projection.derivation.position` échouait à la
  // compilation pour cette seule raison.
  const derivation = entry.projection.derivation
  const current =
    derivation.kind === 'at'
      ? chainFlowSteps(entry.chain).find(step => step.position === derivation.position)
      : undefined
  const next = nextStepLabel(entry.chain, derivation, locale)
  const blocked = derivation.kind === 'at' && derivation.blockedGate !== null
  const destination = current ? stepDestination(entry.chain, current.position, subjectId) : null

  return (
    <Box className={inDialog ? undefined : 'rounded-xl border border-border bg-card p-3'}>
      <Box display="flex" className={`flex-wrap items-baseline gap-2 ${inDialog ? 'justify-end' : 'justify-between'}`}>
        {inDialog ? null : (
          <Text element="span" size="sm" weight="semibold">
            {entry.chain.label[locale]}
          </Text>
        )}
        {/* ⚠️ Aucune durée quand la date est illisible : « 0 jour »
            affirmerait que le dossier a bougé aujourd'hui. */}
        {entry.days === null || Math.round(entry.days) < 1 ? null : (
          <Badge variant={entry.days > 7 ? 'warning' : 'outline'}>
            {t('subject.since', { count: Math.round(entry.days) })}
          </Badge>
        )}
      </Box>

      <Box className="mt-2">
        <ChainFlow chain={entry.chain} locale={locale} derivation={derivation} />
      </Box>

      <Box className="mt-2 flex flex-col gap-1">
        {current ? (
          <Text element="p" size="sm">
            {blocked ? t('subject.blockedAt', { step: current.label[locale] }) : null}
            {!blocked ? (
              destination ? (
                // Le clic ouvre la page SOURCE : c'est là que le geste se
                // fait, et c'est ce qui change la position.
                <Link to={destination} className="font-medium hover:underline">
                  {t('subject.currentStep', { step: current.label[locale] })}
                </Link>
              ) : (
                t('subject.currentStep', { step: current.label[locale] })
              )
            ) : null}
          </Text>
        ) : null}
        {next ? (
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('subject.nextStep', { step: next })}
          </Text>
        ) : null}
        <ChainEvidence chain={entry.chain} derivation={derivation} locale={locale} defaultOpen />
      </Box>

      <Box className="mt-3 border-t border-border pt-2">
        <ChainChecklist chain={entry.chain} subjectId={subjectId} marked={entry.manual} locale={locale} />
      </Box>
    </Box>
  )
}

/**
 * #3371 / #3372 — le rendu COMPACT : UNE ligne par parcours, hauteur d'une
 * bande. Le bloc complet (465×468 px) écrasait les autres bandes de
 * `account-context-row`. Le clic ouvre le rendu complet dans une modale : rien
 * n'est retiré, seulement déplacé.
 */
function ChainEntryCompact({
  entry,
  subjectId,
  locale,
}: {
  entry: ChainEntry
  subjectId: string
  locale: 'fr' | 'en'
}) {
  const { t } = useTranslation('chains')
  const [open, setOpen] = useState(false)
  const derivation = entry.projection.derivation
  const current =
    derivation.kind === 'at'
      ? chainFlowSteps(entry.chain).find(step => step.position === derivation.position)
      : undefined
  const blocked = derivation.kind === 'at' && derivation.blockedGate !== null
  const name = entry.chain.label[locale]
  const stepText = current
    ? blocked
      ? t('subject.blockedAtShort', { step: current.label[locale] })
      : current.label[locale]
    : null
  const days =
    entry.days === null || Math.round(entry.days) < 1 ? null : t('subject.since', { count: Math.round(entry.days) })
  const full = [name, stepText, days].filter(Boolean).join(' · ')

  return (
    <>
      <button
        type="button"
        data-testid="chain-compact"
        title={full}
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-3 text-left text-sm hover:bg-muted/50"
      >
        <span className="min-w-0 truncate font-semibold">{name}</span>
        {stepText ? (
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{stepText}</span>
        ) : (
          <span className="flex-1" />
        )}
        {days && entry.days !== null ? (
          <Badge variant={entry.days > 7 ? 'warning' : 'outline'} className="shrink-0">
            {days}
          </Badge>
        ) : null}
      </button>
      {open ? (
        <Dialog open onOpenChange={o => setOpen(o)}>
          <DialogContent closeLabel={t('subject.close')} className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{name}</DialogTitle>
              <DialogDescription>{t('subject.dialogDescription')}</DialogDescription>
            </DialogHeader>
            <ChainEntryFull entry={entry} subjectId={subjectId} locale={locale} inDialog />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}

export function ChainProgressBlock({
  subjectType,
  subjectId,
  variant = 'full',
}: {
  subjectType: ChainSubjectType
  subjectId: string
  variant?: 'full' | 'compact'
}) {
  const { i18n } = useTranslation('chains')
  const locale = i18n.language.startsWith('en') ? 'en' : 'fr'
  const { data, isPending } = useChainForSubject(subjectType, subjectId)

  // #3465 — la ligne compacte d'un dossier arrive après le premier rendu et
  // décalait la barre d'onglets : on réserve sa place pendant la lecture.
  if (variant === 'compact' && !data && isPending) return <PendingBandSlot testId="chain-compact-slot" />

  // Rien à dire ⇒ rien à afficher. Un encart « aucun parcours » sur une fiche
  // n'apprend rien à personne et occupe la place d'un bloc utile.
  if (!data || data.length === 0) return null

  if (variant === 'compact') {
    return (
      <Box className="flex min-w-0 flex-col gap-2 lg:min-w-64 lg:flex-1">
        {data.map(entry => (
          <ChainEntryCompact key={entry.chain.key} entry={entry} subjectId={subjectId} locale={locale} />
        ))}
      </Box>
    )
  }

  return (
    <Box className="flex flex-col gap-3">
      {data.map(entry => (
        <ChainEntryFull key={entry.chain.key} entry={entry} subjectId={subjectId} locale={locale} />
      ))}
    </Box>
  )
}
