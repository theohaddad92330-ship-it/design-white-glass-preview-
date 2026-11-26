import { NEED_URGENCIES } from '@bellum/contracts'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Text,
  Textarea,
} from '@bellum/ui'
import { cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { useNeedActions, type NeedActionInput } from '../hooks/useNeedActions'
import {
  NEED_BULK_ACTIONS,
  NEED_CANCELLED_REASON_PRESETS,
  needActionNeedsReason,
  needsEligibleFor,
  type ActionableNeed,
  type NeedBulkAction,
} from '../model/need-actions'

/** Le motif est borné comme celui d'une clôture — `changeNeedStatusSchema`
 *  refuse au-delà, et un champ qui laisse taper ce que le serveur rejette ment. */
const REASON_MAX = 200

/** #2173.48 — même borne que `createNeedStepSchema.label` (`need-step.ts`) :
 *  un libellé plus long partirait en 400 sur chaque besoin de la sélection. */
const ACTION_LABEL_MAX = 300

/**
 * Les sept gestes d'un besoin — ou d'une sélection de besoins.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN SEUL MENU, DEUX DÉCLENCHEURS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le kebab d'une ligne et la barre de sélection rendent CE composant, avec un
 * déclencheur différent. C'est délibéré : deux listes d'actions recopiées
 * divergent en trois semaines, et l'utilisateur découvre alors qu'un geste
 * existe « en haut » mais pas « sur la ligne ». L'ordre lui-même vient du
 * catalogue (`model/need-actions.ts`), qui est la seule source.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE ENTRÉE GRISE PLUTÔT QU'ABSENTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un menu dont les entrées vont et viennent ne s'apprend jamais. Une entrée que
 * la porte d'état refuserait reste donc visible et DÉSACTIVÉE, et le panneau dit
 * combien de la sélection le geste peut réellement toucher — « 7 sur 12 » se lit,
 * douze appels dont cinq reviennent en 400 se lisent comme une panne.
 *
 * ⚠️ L'éligibilité vient de `canTransitionNeedStatus`, la MÊME fonction que le
 * serveur consulte. Et pour le rapprochement, c'est la règle QUE LE BOUTON de la
 * colonne « Matching » affiche déjà — un besoin refusé dans une colonne et
 * accepté dans un menu à trente pixels de là, c'est la divergence qu'on évite.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DES ENTRÉES PLATES, PAS DE SOUS-MENUS
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque geste ouvre un panneau, et aucun ne se déplie dans le menu. Un
 * sous-menu imbriqué se survole à la souris et se rate au pouce : sur un
 * produit dont le mobile est le produit et non un repli, c'est un geste qu'on
 * n'atteint pas. Le panneau, lui, est le même partout.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS LÀ
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun export. La seule route d'export côté besoins POUSSE vers un CRM tiers,
 * donc hors de l'entreprise, et aucune action de masse ne sort de l'entreprise.
 * Aucune suppression non plus : on archive, on ne supprime pas — « Marquer
 * annulé » EST le chemin d'archivage, et il garde son motif.
 * `need-actions.test.ts` relit ce dossier et échoue si un chemin sortant y
 * réapparaît.
 */
export function NeedActionsMenu({
  needs,
  trigger,
  onDone,
  forceAction,
}: {
  /** Un besoin (le kebab) ou toute la sélection (la barre). */
  needs: readonly ActionableNeed[]
  trigger: ReactNode
  /** Appelé quand un geste est parti — la barre s'en sert pour vider la sélection. */
  onDone?: () => void
  /**
   * #2178.20 — ignore le menu déroulant : un clic sur `trigger` ouvre
   * DIRECTEMENT ce geste, panneau de motif compris.
   *
   * Le bouton « Refuser le besoin » du panneau zéro-résultat (`MatchDrawer`,
   * module `matching`) déclenche ainsi le MÊME panneau que le kebab — motif
   * obligatoire, mêmes presets, même mutation — sans un second dialogue qui
   * pourrait diverger du premier (GA-26, « un réglage vit à un seul endroit »).
   */
  forceAction?: NeedBulkAction
}) {
  const { t } = useTranslation('projects')
  /** Le geste en cours de saisie. `null` = aucun panneau ouvert. */
  const [pending, setPending] = useState<NeedBulkAction | null>(null)
  const [reason, setReason] = useState('')
  /** #3389.13 — la reprise prévue d'une veille (AAAA-MM-JJ), facultative. */
  const [resumeOn, setResumeOn] = useState('')
  /** #2173.48 — le libellé de l'action à créer. Distinct du motif : ce n'est
   *  pas une justification, c'est ce qui sera écrit tel quel comme prochaine
   *  étape. */
  const [actionLabel, setActionLabel] = useState('')
  const act = useNeedActions()

  const count = needs.length
  const disabled =
    count === 0 || act.isPending || (forceAction != null && needsEligibleFor(needs, forceAction).length === 0)

  /** Les lignes que le geste OUVERT peut réellement toucher. Compter avant
   *  d'agir est ce qui permet de dire « 7 sur 12 ». */
  const eligible = pending === null ? [] : needsEligibleFor(needs, pending)
  const needIds = eligible.map(need => need.id)

  const run = (input: NeedActionInput) => {
    setPending(null)
    act.mutate(input, { onSuccess: () => onDone?.() })
  }

  const label: Record<NeedBulkAction, string> = {
    assign_owner: t('openNeeds.actions.assignOwner'),
    set_urgency: t('openNeeds.actions.setUrgency'),
    create_actions: t('openNeeds.actions.createActions'),
    match: t('openNeeds.actions.match'),
    hold: t('openNeeds.actions.hold'),
    reactivate: t('openNeeds.actions.reactivate'),
    close_lost: t('openNeeds.actions.closeLost'),
    close_cancelled: t('openNeeds.actions.closeCancelled'),
    archive: t('openNeeds.actions.archive'),
    unarchive: t('openNeeds.actions.unarchive'),
  }

  /** Le titre, la phrase d'explication, et — pour les trois gestes qui l'exigent
   *  — comment on demande le motif. Un seul panneau, jamais un second dialogue :
   *  « fermer avec motif » et « mettre en veille avec motif » posent la même
   *  question, à un mot près. */
  const panel = (action: NeedBulkAction) => {
    switch (action) {
      case 'create_actions':
        return {
          title: t('openNeeds.actions.createActionsTitle', { count }),
          description: t('openNeeds.actions.createActionsDescription'),
          confirm: t('openNeeds.actions.createActionsConfirm'),
          reasonLabel: null,
          placeholder: '',
          hint: '',
        }
      case 'match':
        return {
          title: t('openNeeds.actions.matchTitle', { count }),
          description: t('openNeeds.actions.matchDescription'),
          confirm: t('openNeeds.actions.matchConfirm', { count: eligible.length }),
          reasonLabel: null,
          placeholder: '',
          hint: '',
        }
      case 'reactivate':
        return {
          title: t('openNeeds.actions.reactivateTitle', { count }),
          // Le serveur EFFACE le motif d'arrêt. L'écran le DIT, plutôt que de
          // laisser découvrir la disparition d'une information après coup.
          description: t('openNeeds.actions.reactivateDescription'),
          confirm: t('openNeeds.actions.reactivate'),
          reasonLabel: null,
          placeholder: '',
          hint: '',
        }
      case 'hold':
        return {
          title: t('openNeeds.hold.title', { count }),
          description: t('openNeeds.hold.description'),
          confirm: t('openNeeds.hold.confirm'),
          reasonLabel: t('openNeeds.hold.label'),
          placeholder: t('openNeeds.hold.placeholder'),
          hint: t('openNeeds.hold.hint'),
        }
      case 'close_lost':
        return {
          title: t('openNeeds.closeLost.title', { count }),
          description: t('openNeeds.closeLost.description'),
          confirm: t('openNeeds.closeLost.confirm'),
          reasonLabel: t('openNeeds.closeLost.label'),
          placeholder: t('openNeeds.closeLost.placeholder'),
          hint: t('openNeeds.closeLost.hint'),
        }
      case 'close_cancelled':
        return {
          title: t('openNeeds.closeCancelled.title', { count }),
          description: t('openNeeds.closeCancelled.description'),
          confirm: t('openNeeds.closeCancelled.confirm'),
          reasonLabel: t('openNeeds.closeCancelled.label'),
          placeholder: t('openNeeds.closeCancelled.placeholder'),
          hint: t('openNeeds.closeCancelled.hint'),
        }
      // #2173.49 — un rangement NEUTRE : la description le dit explicitement,
      // pour qu'on ne confonde jamais ce geste avec une clôture.
      case 'archive':
        return {
          title: t('openNeeds.actions.archiveTitle', { count }),
          description: t('openNeeds.actions.archiveDescription'),
          confirm: t('openNeeds.actions.archive'),
          reasonLabel: null,
          placeholder: '',
          hint: '',
        }
      case 'unarchive':
        return {
          title: t('openNeeds.actions.unarchiveTitle', { count }),
          description: t('openNeeds.actions.unarchiveDescription'),
          confirm: t('openNeeds.actions.unarchive'),
          reasonLabel: null,
          placeholder: '',
          hint: '',
        }
      default:
        return {
          title: label[action],
          description: t('openNeeds.actions.appliesTo', { count }),
          confirm: null,
          reasonLabel: null,
          placeholder: '',
          hint: '',
        }
    }
  }

  const open = pending !== null
  const copy = pending === null ? null : panel(pending)

  const openForced = () => {
    if (disabled || !forceAction) return
    setReason('')
    setResumeOn('')
    setActionLabel('')
    setPending(forceAction)
  }

  return (
    <>
      {forceAction ? (
        isValidElement(trigger) ? (
          cloneElement(trigger as ReactElement<{ onClick?: () => void; disabled?: boolean }>, {
            onClick: openForced,
            disabled,
          })
        ) : (
          trigger
        )
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={disabled}>
            {trigger}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{t('openNeeds.actions.title', { count })}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {NEED_BULK_ACTIONS.map(action => (
              <DropdownMenuItem
                key={action}
                // Grise, jamais absente : un menu dont les entrées disparaissent
                // ne s'apprend pas, et l'utilisateur ne saurait pas que le geste
                // existe ailleurs.
                disabled={needsEligibleFor(needs, action).length === 0}
                className="pointer-coarse:min-h-11"
                onSelect={() => {
                  setReason('')
                  setResumeOn('')
                  setActionLabel('')
                  setPending(action)
                }}
              >
                {label[action]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog open={open} onOpenChange={next => !next && setPending(null)}>
        <DialogContent closeLabel={t('common:actions.close')}>
          <DialogHeader>
            <DialogTitle>{copy?.title ?? ''}</DialogTitle>
            <DialogDescription>{copy?.description ?? ''}</DialogDescription>
          </DialogHeader>

          {/* « 7 sur 12 », et seulement quand ce n'est pas « 12 sur 12 » : une
              phrase qui répète l'évidence se cesse d'être lue, et celle-ci doit
              l'être le jour où elle dit quelque chose. */}
          {eligible.length < count && (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {/* ⚠️ `total`, jamais `count` : `count` est réservé par i18next pour
                  le pluriel, et une clé sans suffixe `_one`/`_other` se
                  résoudrait au petit bonheur. */}
              {t('openNeeds.actions.eligible', { eligible: eligible.length, total: count })}
            </Text>
          )}

          {/* « À qui » — le geste du matin, celui qui fait sortir un besoin de
              la pile commune. */}
          {pending === 'assign_owner' && (
            <OwnerChoices onPick={ownerId => run({ kind: 'assign_owner', needIds, ownerId })} />
          )}

          {pending === 'set_urgency' && (
            <Box display="flex" className="flex-wrap gap-2">
              {NEED_URGENCIES.map(urgency => (
                <Button
                  key={urgency}
                  size="sm"
                  variant="outline"
                  onClick={() => run({ kind: 'set_urgency', needIds, urgency })}
                >
                  {t(`openNeeds.urgency.${urgency}`)}
                </Button>
              ))}
              {/* Effacer, et non « remettre à normale » : une urgence absente
                  n'est pas une urgence basse, c'est une question sans
                  réponse. */}
              <Button size="sm" variant="ghost" onClick={() => run({ kind: 'set_urgency', needIds, urgency: null })}>
                {t('openNeeds.actions.clearUrgency')}
              </Button>
            </Box>
          )}

          {/* #2173.48 — un libellé, posé tel quel comme prochaine étape sur
              chaque besoin de la sélection. Le copilote PRÉPARE l'action, il
              ne l'exécute jamais à la place du commercial : rien ne s'envoie,
              rien ne se coche — c'est lui qui le fera quand ce sera fait. */}
          {pending === 'create_actions' && (
            <>
              <Input
                value={actionLabel}
                maxLength={ACTION_LABEL_MAX}
                aria-label={t('openNeeds.actions.createActionsLabel')}
                placeholder={t('openNeeds.actions.createActionsPlaceholder')}
                onChange={event => setActionLabel(event.target.value.slice(0, ACTION_LABEL_MAX))}
              />
              <DialogFooter>
                <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
                  {t('openNeeds.actions.cancel')}
                </Button>
                <Button
                  size="sm"
                  disabled={actionLabel.trim().length === 0 || eligible.length === 0 || act.isPending}
                  onClick={() => run({ kind: 'create_actions', needIds, label: actionLabel.trim() })}
                >
                  {copy?.confirm}
                </Button>
              </DialogFooter>
            </>
          )}

          {/* Les deux gestes qui ne demandent rien de plus qu'un accord. Le
              rapprochement PART (c'est l'appel le plus lourd du produit) et la
              reprise EFFACE le motif d'arrêt : ni l'un ni l'autre ne se déclenche
              sur un simple survol de menu. */}
          {(pending === 'match' || pending === 'reactivate' || pending === 'archive' || pending === 'unarchive') && (
            <DialogFooter>
              <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
                {t('openNeeds.actions.cancel')}
              </Button>
              <Button
                size="sm"
                disabled={eligible.length === 0 || act.isPending}
                onClick={() => run({ kind: pending, needIds })}
              >
                {copy?.confirm}
              </Button>
            </DialogFooter>
          )}

          {/* La veille et les DEUX clôtures demandent leur motif, et c'est tout
              le point : le serveur les refuse sans lui. Un besoin en veille
              continue de compter comme ouvert — sans motif, c'est exactement
              celui que personne ne rouvre ; et sans motif de perte, le taux de
              perte par cause ne veut rien dire.

              ⚠️ La question est posée AVANT d'agir, y compris sur une sélection :
              un motif demandé après coup, besoin par besoin, ne serait pas une
              action de masse. */}
          {pending !== null && needActionNeedsReason(pending) && (
            <>
              {/* #2323.10 / #2323.11 — deux motifs NOMMÉS, sur l'annulation
                  seulement : un besoin qu'on arrête nous-mêmes retombe presque
                  toujours sur l'un des deux, quand un refus client (« perdu »)
                  a toujours SA raison propre, imprévisible à l'avance. Un clic
                  REMPLACE le brouillon, il ne s'y ajoute pas — le texte reste
                  éditable ensuite. */}
              {pending === 'close_cancelled' && (
                <Box display="flex" className="flex-wrap gap-1">
                  {NEED_CANCELLED_REASON_PRESETS.map(preset => (
                    <Button
                      key={preset}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs"
                      onClick={() => setReason(t(`openNeeds.closeCancelled.presets.${preset}`))}
                    >
                      {t(`openNeeds.closeCancelled.presets.${preset}`)}
                    </Button>
                  ))}
                </Box>
              )}
              <Textarea
                value={reason}
                maxLength={REASON_MAX}
                rows={3}
                aria-label={copy?.reasonLabel ?? ''}
                placeholder={copy?.placeholder}
                onChange={event => setReason(event.target.value.slice(0, REASON_MAX))}
              />
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {copy?.hint}
              </Text>
              {/* #3389.13 — « attente AVEC DATE » : facultative (on ne l'invente
                  pas), posée seulement sur la veille. Même Input que le reste du
                  panneau, aucun bloc de plus. */}
              {pending === 'hold' && (
                <Box className="space-y-1">
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {t('openNeeds.hold.resumeOnLabel')}
                  </Text>
                  <Input
                    type="date"
                    value={resumeOn}
                    min={new Date().toISOString().slice(0, 10)}
                    aria-label={t('openNeeds.hold.resumeOnLabel')}
                    onChange={event => setResumeOn(event.target.value)}
                  />
                </Box>
              )}
              <DialogFooter>
                <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
                  {t('openNeeds.actions.cancel')}
                </Button>
                {/* Désactivé tant que le motif est vide : le serveur rendrait
                    400, et un bouton qui part pour revenir en erreur fait
                    recliquer. */}
                <Button
                  size="sm"
                  disabled={reason.trim().length === 0 || eligible.length === 0 || act.isPending}
                  onClick={() =>
                    run({
                      kind: pending,
                      needIds,
                      reason: reason.trim(),
                      ...(pending === 'hold' && resumeOn ? { resumeOn } : {}),
                    })
                  }
                >
                  {copy?.confirm}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Les membres de l'espace, LUS QUAND ON OUVRE le panneau et pas avant.
 *
 * ⚠️ C'est la raison d'être de ce composant, et elle n'est pas cosmétique : le
 * kebab est monté sur CHAQUE ligne du tableau. Lire les membres depuis le
 * composant parent ferait partir la requête cinquante fois à l'affichage de la
 * page — et surtout imposerait un contexte de session à tout écran qui rend une
 * ligne de besoin. Le panneau ne se monte qu'à l'ouverture : la lecture suit le
 * geste.
 *
 * Vide = la lecture n'a rien rendu (espace d'une personne, ou échec). On le DIT,
 * jamais une liste inventée : une liste vide se lit comme une panne, une phrase
 * se lit comme un fait.
 */
function OwnerChoices({ onPick }: { onPick: (ownerId: string | null) => void }) {
  const { t } = useTranslation('projects')
  const members = useWorkspaceMembers()
  const list = members.data ?? []

  return (
    <Box display="flex" className="flex-col gap-1">
      {list.length === 0 ? (
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {members.isLoading ? t('openNeeds.actions.loadingMembers') : t('openNeeds.actions.noMembers')}
        </Text>
      ) : (
        list.map(member => (
          <Button
            key={member.userId}
            size="sm"
            variant="ghost"
            className="justify-start"
            onClick={() => onPick(member.userId)}
          >
            {member.fullName ?? member.email ?? t('openNeeds.actions.unnamedMember')}
          </Button>
        ))
      )}
      {/* Retirer le propriétaire est un geste LÉGITIME : un besoin sans porteur
          est plus honnête qu'un porteur désigné au hasard, et c'est justement
          ce que le cockpit cherche à repérer. */}
      <Button size="sm" variant="outline" className="justify-start" onClick={() => onPick(null)}>
        {t('openNeeds.actions.clearOwner')}
      </Button>
    </Box>
  )
}
