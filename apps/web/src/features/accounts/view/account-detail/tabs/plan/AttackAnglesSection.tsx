import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { angleEstimateKind } from '@bellum/contracts'
import { motion } from 'framer-motion'
import { ArrowRight, BadgeEuro, BriefcaseBusiness, Compass, Quote, RefreshCw, Sparkles, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EstimatedBadge } from '@/components/primitives/EstimatedBadge'
import { useGenerateAttackAngle } from '@/features/accounts/hooks/useGenerateAttackAngle'
import { cardFade } from '../../motion'
import type { AttackAngle, DiscardedAxis } from './planViewData'
import { ReplanDialog } from './ReplanDialog'

/**
 * Remplace `tabs/sections/AttackAngles.tsx` (supprimé 31/08/2026, code mort —
 * zéro appelant depuis que l'onglet « Vue d'ensemble » a cédé la place à
 * « Plan »). L'ancien composant ne montrait que titre/stratégie/offre en
 * lecture seule ; celui-ci couvre en plus le point d'entrée, le potentiel
 * chiffré, la preuve (dans ses quatre états), le badge « recommandé », les
 * axes écartés avec leur raison, et la régénération/replanification — rien
 * n'est perdu, tout est repris en mieux.
 */
export function AttackAnglesSection({
  angles,
  accountId,
  discardedAxes = [],
}: {
  angles: AttackAngle[]
  accountId: string
  /** Les angles que l'analyse a écartés, avec leur raison. */
  discardedAxes?: DiscardedAxis[]
}) {
  const { t } = useTranslation('accountDetail')
  const sortedAngles = sortAngles(angles)
  const [selectedAngle, setSelectedAngle] = useState<AttackAngle | null>(null)
  const [replanOpen, setReplanOpen] = useState(false)
  // « Générer un autre angle » (Théo TF1 p31) : accumule un angle frais dans le
  // dossier sans écraser les précédents. Le hook invalide le compte → le nouvel
  // angle apparaît dans cette liste (planViewData lit user_attack_angles d'abord).
  const generateAngle = useGenerateAttackAngle(accountId)

  return (
    <motion.div variants={cardFade} className="p-1 mt-4">
      <Card className=" p-0 [--card-spacing:0px]">
        {/* `flex-wrap` : la carte a repris la colonne principale (#1089), mais
            elle reste étroite sur mobile et dans un dossier ouvert en demi-écran.
            Sans retour à la ligne, le groupe de boutons — qui refuse de se
            rétrécir — débordait par-dessus le titre. Vu en production. */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--bellum-border)] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Compass className="size-4 text-[var(--bellum-text-accent)]" />
              <Text element="h3" size="base" weight="semibold">
                {t('attackAngles.title')}
              </Text>
            </div>
            <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
              {t('attackAngles.subtitle')}
            </Text>
          </div>
          {/* Le premier correctif faisait passer le GROUPE à la ligne ; le groupe
              lui-même reste plus large que la colonne, si bien que « Changer »
              se faisait toujours couper par le bord de la carte. Les deux
              boutons doivent pouvoir se répartir sur deux lignes — donc
              `flex-wrap` ici aussi, et pas de `shrink-0` qui l'en empêche. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={Sparkles}
              disabled={generateAngle.isPending}
              onClick={() => generateAngle.mutate()}
            >
              {generateAngle.isPending ? t('attackAngles.generating') : t('attackAngles.generate')}
            </Button>
            <Button type="button" variant="outline" size="sm" icon={RefreshCw} onClick={() => setReplanOpen(true)}>
              {t('replan.trigger')}
            </Button>
          </div>
        </div>

        {sortedAngles.length > 0 ? (
          <div className="max-h-[420px] divide-y divide-[var(--bellum-border)] overflow-y-auto overscroll-contain">
            {sortedAngles.map((angle, index) => (
              <AttackAngleItem key={`${angle.title}-${index}`} angle={angle} onOpen={() => setSelectedAngle(angle)} />
            ))}
          </div>
        ) : (
          <div className="px-5 py-6">
            <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
              {t('attackAngles.emptyTitle')}
            </Text>
            {/* Un panneau vide disait « les angles apparaîtront dès que l'analyse
                fournit assez de signaux » — sur un dossier qui en portait six et
                vingt actions. Ce n'était pas la matière qui manquait : la
                sélection avait tranché, en sachant pourquoi. Quand elle a écrit
                ses raisons, on les MONTRE : c'est le raisonnement du produit, et
                il partait à la poubelle. */}
            {discardedAxes.length > 0 ? (
              <>
                <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
                  {t('attackAngles.discardedIntro')}
                </Text>
                <div className="mt-3 space-y-3">
                  {discardedAxes.map(axis => (
                    <div key={axis.angle} className="border-l-2 border-[var(--bellum-border)] pl-3">
                      <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                        {axis.angle}
                      </Text>
                      {axis.raison ? (
                        <Text size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
                          {axis.raison}
                        </Text>
                      ) : null}
                      {axis.comment_reactiver ? (
                        <Text size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
                          {t('attackAngles.discardedReactivate', { how: axis.comment_reactiver })}
                        </Text>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
                {t('attackAngles.emptyDescription')}
              </Text>
            )}
          </div>
        )}
      </Card>
      <AttackAngleDialog angle={selectedAngle} onOpenChange={open => !open && setSelectedAngle(null)} />
      <ReplanDialog open={replanOpen} onOpenChange={setReplanOpen} accountId={accountId} angles={angles} />
    </motion.div>
  )
}

function AttackAngleItem({ angle, onOpen }: { angle: AttackAngle; onOpen: () => void }) {
  const { t } = useTranslation('accountDetail')
  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Text size="sm" weight="semibold" className="leading-snug text-[var(--bellum-text-primary)]">
            {angle.title || t('attackAngles.fallbackTitle')}
          </Text>
          {angle.description ? (
            <Text size="xs" className="mt-1 line-clamp-3 leading-relaxed text-[var(--bellum-text-secondary)]">
              {angle.description}
            </Text>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {/* #4016.L4 — un angle sans preuve mobilisable est une HYPOTHÈSE, badgée avec sa base. */}
          {angleEstimateKind(angle.proofState) ? (
            <EstimatedBadge kind="hypothesis" basis={t(`attackAngles.proof.${angle.proofState}`)} />
          ) : null}
          {angle.recommended ? <Badge variant="success">{t('attackAngles.recommended')}</Badge> : null}
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {angle.entryPoint ? <AngleMeta icon={<UserRound className="size-3.5" />} label={angle.entryPoint} /> : null}
        {angle.offer ? <AngleMeta icon={<BriefcaseBusiness className="size-3.5" />} label={angle.offer} /> : null}
        {angle.estimatedDealSize ? (
          <AngleMeta icon={<BadgeEuro className="size-3.5" />} label={angle.estimatedDealSize} />
        ) : null}
        {/* La PREUVE du play (tome 5 §32.2), dans les QUATRE états. Elle est
            affichée même quand elle manque : un play dont on ne dit rien de la
            preuve se lit comme un play qui en a une. Les trois façons de ne pas
            en avoir ne se disent pas pareil — « rien à citer », « une phrase que
            rien n'étaye, donc retirée » et « pas encore vérifié » appellent trois
            gestes différents. */}
        <AngleMeta
          icon={<Quote className="size-3.5" />}
          label={angle.proof ?? t(`attackAngles.proof.${angle.proofState}`)}
        />
      </div>
      {/* #1091 « quand je clique ici, une fenêtre s'affiche mais rien est
          dedans ». Elle n'était pas vide : elle ne montrait RIEN DE PLUS que la
          carte. Le point d'entrée, l'offre et le potentiel sont déjà là au-dessus
          en entier ; seule la description est tronquée à trois lignes, donc elle
          seule justifie d'ouvrir. Sans elle, le lien promet un détail qui
          n'existe pas — et une promesse tenue à vide use plus la confiance
          qu'un lien absent. */}
      {angle.description ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={ArrowRight}
          iconPosition="right"
          onClick={onOpen}
          className="mt-3 h-auto px-0 text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]"
        >
          {t('cta.viewDetail')}
        </Button>
      ) : null}
    </div>
  )
}

function AngleMeta({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-[var(--bellum-text-secondary)]">
      <span className="shrink-0 text-[var(--bellum-text-muted)]">{icon}</span>
      <Text size="xs" className="min-w-0 truncate">
        {label}
      </Text>
    </div>
  )
}

function sortAngles(angles: AttackAngle[]) {
  return [...angles].sort((left, right) => Number(right.recommended) - Number(left.recommended))
}

function AttackAngleDialog({
  angle,
  onOpenChange,
}: {
  angle: AttackAngle | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('accountDetail')
  const hasDetailRows = Boolean(angle?.entryPoint || angle?.offer || angle?.estimatedDealSize)
  return (
    <Dialog open={angle !== null} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t('common:actions.close')}
        className="flex max-h-[82dvh] flex-col overflow-hidden border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-0 sm:max-w-xl"
      >
        <DialogHeader className="shrink-0 border-b border-[var(--bellum-border)] p-5 pr-14">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                <Compass className="size-5 shrink-0 text-[var(--bellum-text-accent)]" />
                <DialogTitle className="text-base leading-snug text-[var(--bellum-text-primary)]">
                  {angle?.title || t('attackAngles.fallbackTitle')}
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-[var(--bellum-text-muted)]">
                {t('attackAngles.dialogDescription')}
              </DialogDescription>
            </div>
            {angle?.recommended ? <Badge variant="success">{t('attackAngles.recommended')}</Badge> : null}
          </div>
        </DialogHeader>

        {/* Même défaut que #1081 : l'entête est plus haute que les 108 px supposés. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {angle ? (
            <div className="space-y-5">
              <section className="space-y-2">
                <Text size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
                  {t('attackAngles.reading')}
                </Text>
                <Text size="sm" className="leading-relaxed text-[var(--bellum-text-primary)]">
                  {angle.description || t('attackAngles.noDescription')}
                </Text>
              </section>
              {/* #1091 : « une fenêtre s'affiche mais rien est dedans ». Elle
                  affichait trois lignes « non renseigné » quand l'analyse
                  n'avait rempli aucun des trois champs — quatre libellés gris
                  au-dessus du vide, qui se lisent comme un écran cassé. Une
                  ligne sans valeur ne s'écrit plus, et quand il n'en reste
                  aucune la modale le DIT en une phrase. On ne devine rien : on
                  nomme l'absence, ce qui est une information. */}
              {hasDetailRows ? (
                <div className="rounded-lg border border-[var(--bellum-border)]">
                  {angle.entryPoint ? (
                    <DialogDetailRow label={t('attackAngles.entryPoint')} value={angle.entryPoint} />
                  ) : null}
                  {angle.offer ? <DialogDetailRow label={t('attackAngles.offer')} value={angle.offer} /> : null}
                  {angle.estimatedDealSize ? (
                    <DialogDetailRow label={t('attackAngles.potential')} value={angle.estimatedDealSize} />
                  ) : null}
                </div>
              ) : (
                <Text size="sm" className="text-[var(--bellum-text-muted)]">
                  {t('attackAngles.noDetail')}
                </Text>
              )}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// #2613 — les trois appelants ne passent déjà que des valeurs connues
// (`angle.entryPoint ?`, `angle.offer ?`, `angle.estimatedDealSize ?` avant
// le rendu, #1091) : le repli « Non renseigné » ne se déclenchait jamais.
function DialogDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-[var(--bellum-border)] px-4 py-3 last:border-b-0 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
      <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <Text size="sm" className="text-[var(--bellum-text-primary)]">
        {value}
      </Text>
    </div>
  )
}
