import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { initialSelection, moveOnlySelection, type EffectProposal } from '@bellum/contracts'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Le panneau d'effet — la primitive (Tome 7 §47).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE APPORTE QUE LES PANNEAUX EXISTANTS N'AVAIENT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le panneau de déplacement d'étape appliquait déjà les règles 1 et 3 (pré-coche
 * réservée au niveau N1, aucun envoi externe pré-coché) — mais dans SON code,
 * pour SON écran. Deux règles manquaient, et ce sont celles qui protègent
 * l'utilisateur pressé :
 *
 *  - **Règle 2 — « Faire seulement le déplacement » est toujours à un clic.**
 *    Sans elle, refuser les propositions demande de décocher les cases une par
 *    une. Personne ne le fait : on confirme ce qui est pré-coché.
 *  - **Règle 4 — le panneau se ferme au clavier**, et la validation ne se fait
 *    JAMAIS sur `Entrée` (voir plus bas).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE DÉCISION CONTRE LA LETTRE DU TOME
 * ─────────────────────────────────────────────────────────────────────────────
 * Le tome propose un raccourci `M` qui OUVRE le panneau. Il est posé par
 * l'écran qui déclenche le mouvement, pas par le panneau lui-même — un panneau
 * fermé ne peut pas écouter le clavier. Ce que la primitive tient, c'est
 * l'inverse et c'est plus important : **`Entrée` ne confirme pas**. Un panneau
 * dont les cases engagent une écriture ne doit pas se valider par la touche
 * qu'on presse par réflexe après avoir lu.
 */
export function EffectPanel({
  title,
  proposals,
  renderProposal,
  changes,
  checks,
  extra,
  blocked = false,
  confirmDisabled = false,
  moveOnlyLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string
  /** Les propositions, au contrat partagé. La pré-coche est recalculée ici. */
  proposals: readonly EffectProposal[]
  renderProposal: (proposal: EffectProposal) => ReactNode
  /** Ce qui change quoi qu'il arrive — l'utilisateur le subit, il ne le coche pas. */
  changes?: ReactNode
  /** Ce qu'on vérifie et qu'on lui montre sans décider à sa place. */
  checks?: ReactNode
  /** Motif, options — ce que l'écran ajoute. */
  extra?: ReactNode
  blocked?: boolean
  confirmDisabled?: boolean
  /** Le libellé du geste NU (« Déplacer seulement », « Clore seulement »…). */
  moveOnlyLabel: string
  /** Le libellé de la confirmation. Il appartient à l'ÉCRAN — « Déplacer »,
   *  « Clore », « Archiver » — et pas à la primitive : un « Confirmer »
   *  générique ne dit plus ce qu'on confirme, au moment précis où c'est la
   *  seule chose qui compte. */
  confirmLabel?: string
  onCancel: () => void
  onConfirm: (accepted: readonly string[]) => void
}) {
  const { t } = useTranslation('common')
  // La sélection initiale passe par le contrat : c'est lui qui refuse de
  // pré-cocher un envoi externe, quoi qu'en dise le catalogue de l'écran.
  const initial = useMemo(() => initialSelection(proposals), [proposals])
  const [accepted, setAccepted] = useState<Set<string>>(() => new Set(initial))

  // Un changement de propositions (l'utilisateur vise une autre étape sans
  // fermer) doit repartir de la pré-coche autorisée, pas garder l'ancienne.
  useEffect(() => setAccepted(new Set(initial)), [initial])

  const toggle = (key: string) =>
    setAccepted(previous => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onCancel()
      }}
    >
      <DialogContent
        closeLabel={t('common:actions.close')}
        className="max-w-lg space-y-3"
        // `Entrée` ne confirme pas : voir le docblock. Le geste reste au clic.
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('effects.description')}</DialogDescription>
        </DialogHeader>

        {changes}

        {proposals.length > 0 ? (
          <Box className="space-y-2">
            {proposals.map(proposal => (
              <Box key={proposal.key} display="flex" className="items-start gap-2">
                <Checkbox checked={accepted.has(proposal.key)} onCheckedChange={() => toggle(proposal.key)} />
                <Box className="flex-1">{renderProposal(proposal)}</Box>
              </Box>
            ))}
          </Box>
        ) : null}

        {checks}
        {extra}

        <DialogFooter className="flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t('effectPanel.cancel')}
          </Button>
          {/* Règle 2. Toujours présent, même quand rien n'est pré-coché : c'est
              ce qui permet de dire « juste le geste » sans relire les cases. */}
          <Button
            size="sm"
            variant="outline"
            disabled={blocked || confirmDisabled}
            onClick={() => onConfirm(moveOnlySelection())}
          >
            {moveOnlyLabel}
          </Button>
          <Button size="sm" disabled={blocked || confirmDisabled} onClick={() => onConfirm([...accepted])}>
            {confirmLabel ?? t('effectPanel.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
