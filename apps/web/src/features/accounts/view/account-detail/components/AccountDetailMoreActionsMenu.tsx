import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import type { DossierCtaBlockedReason, DossierHeroState } from '@bellum/contracts'
import {
  Archive,
  ArrowRight,
  CalendarClock,
  ClipboardList,
  DatabaseZap,
  Eye,
  FileDown,
  FileText,
  Link2Off,
  MessageCircle,
  MoreHorizontal,
  Scale,
  Share2,
  Star,
  Target,
  Trash2,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import {
  useArchiveAccountFromDossier,
  useDeleteAccountFromDossier,
  useDetachAccountFromDossier,
} from '@/features/accounts/hooks/useAccountAdminActions'
import { useBestReferences, useSetBestReference } from '@/features/accounts/hooks/useBestReference'
import { useCrmPresence } from '@/features/crm/hooks/useCrmPresence'
import { useCreateTargetFromAccount } from '@/features/target-lists/useCreateTargetFromAccount'
import { useCreateTargetFromCrmPresence } from '@/features/target-lists/useCreateTargetFromCrmPresence'
import { AccountRefreshMenu } from './AccountRefreshMenu'
import { BetProfileDialog } from './BetProfileDialog'
import { DossierCtaButton, DossierCtaMenuItem } from '@/features/accounts/view/account-detail/cta/DossierCta'

const itemClasses = 'gap-1.5'

type AccountDetailMoreActionsMenuProps = {
  /**
   * Id du dossier — pour le sous-menu de rafraîchissement par axe
   * (`AccountRefreshMenu`) et les trois gestes administratifs. Optionnel :
   * sans lui, ces entrées restent simplement absentes plutôt que de casser
   * l'appelant.
   */
  accountId?: string
  /**
   * #2117.36-38 — pour nommer le compte dans les toasts d'archivage,
   * détachement et suppression (#2116.40). `null`/absent retombe sur « ce
   * compte » plutôt que d'écrire un toast vide.
   */
  companyName?: string | null
  /**
   * Rafraîchir un axe n'a de sens qu'une fois le dossier livré (il y a des
   * sorties stockées à réutiliser pour les autres axes) — même condition que
   * l'ancien bouton autonome (`account.status === 'completed'`), portée par
   * l'appelant plutôt que redevinée ici.
   */
  showRefreshDimensions?: boolean
  /**
   * #2165.13 — « Marquer meilleure référence » n'a de sens QUE sur un compte
   * CLIENT (`commercial_status === 'customer'`) : la référence est une preuve
   * de délivrance passée, pas une préférence sur un prospect. Porté par
   * l'appelant plutôt que redevinée ici (même patron que `showRefreshDimensions`).
   */
  isCustomer?: boolean
  /**
   * Épopée #2853 (#2157.7) — pour `useCrmPresence` : sans eux, « Créer une
   * cible depuis le CRM » ne peut pas savoir si ce compte y est confirmé.
   * Absents = même comportement qu'avant ce lot (l'entrée reste absente).
   */
  website?: string | null
  siren?: string | null
  /**
   * #4507 (refonte V22, contrat Louis 23/10) — « Tout le reste dans « … » » : l'en-tête ne garde qu'épingle ·
   * Actualiser · « … ». Le geste qui dépend de l'état du dossier (`heroPrimaryAction`) devient une entrée ;
   * l'état « analyse incomplète » n'en a pas, c'est « Actualiser » qui le porte. `null` = rien à proposer.
   */
  nextAction?: { state: Exclude<DossierHeroState, 'analysis-incomplete'>; onSelect: () => void } | null
  /** #4459.3 — « Compléter le compte », seulement quand `useCanCompleteCrmAccount` l'autorise. */
  onCompleteAccount?: (() => void) | null
  /** #2117.30 — « Avec Laura » (Louis : seul Actualiser en grand ; Laura reste dans la barre latérale). */
  onAskLaura?: () => void
  /** Entrées hors registre CTA (Commenter, Planifier, CRM) — `AccountHeaderWorkMenuItems`. */
  workItems?: ReactNode
  /** Les gestes d'équipe (Attribuer, Demander une validation, Ajouter un co-équipier). */
  teamItems?: ReactNode
}

/**
 * Kebab dropdown du dossier — /accounts/$id.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Q-1816 RENVERSÉE (14/09/2026, #2117) — CE QUI RESTE ICI, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 * #1816 (troisième tour, 10/09/2026) avait descendu « Exporter », « Brief »,
 * « Rafraîchir un axe » et « Partager » sous ce menu pour tenir le hero sous
 * ~270px. Louis revient sur l'arbitrage : Aperçu PDF, Télécharger PDF, Brief
 * et Partager REMONTENT en boutons visibles du hero
 * (`AccountDetailHero.tsx`) — ce ne sont pas des gestes occasionnels, ce sont
 * des LIVRABLES du dossier, et les cacher sous « … » les rendait un clic plus
 * loin sans raison qui tienne.
 *
 * Ce menu ne garde donc que ce qui EST occasionnel au sens fort :
 *  · « Rafraîchir un axe » — un SOUS-menu (`DropdownMenuSub`), qui n'a pas sa
 *    place parmi des boutons icône du hero ; hors périmètre de ce lot.
 *  · Le volet ADMINISTRATIF (archiver / détacher / supprimer) — des gestes
 *    qu'on pose UNE fois sur ce dossier, jamais quotidiens.
 */
export function AccountDetailMoreActionsMenu({
  accountId,
  companyName = null,
  showRefreshDimensions = false,
  isCustomer = false,
  website = null,
  siren = null,
  nextAction = null,
  onCompleteAccount = null,
  onAskLaura,
  workItems,
  teamItems,
}: AccountDetailMoreActionsMenuProps) {
  const { t } = useTranslation('accounts')
  const [open, setOpen] = useState(false)
  // #3245 — le dialogue du profil de pari vit HORS du menu (Radix le démonte en se fermant).
  const [betProfileOpen, setBetProfileOpen] = useState(false)

  // #2165.13 — la liste est déjà chargée par ailleurs dès qu'on ouvre
  // Découvrir ; ici elle sert seulement à savoir si CE compte y figure, pour
  // rendre l'item du menu à bascule (« Marquer » / « Retirer »).
  const bestReferences = useBestReferences()
  const isBestReference = Boolean(accountId) && (bestReferences.data ?? []).some(ref => ref.id === accountId)
  const setBestReference = useSetBestReference()

  // #2164.44 — « Créer une cible » : target-lists.service.ts existait déjà,
  // sans appelant depuis le dossier compte (correctif de lecture inerte).
  const createTarget = useCreateTargetFromAccount()

  // Épopée #2853 (#2157.7) — MÊME donnée que `CrmPresenceBadge` (queryKey
  // identique, aucune requête réseau supplémentaire, GA-26) : l'entrée
  // n'apparaît que quand le connecteur CRM branché confirme une
  // correspondance sur CE compte — jamais sur le seul fait qu'un CRM soit
  // connecté (no-op strict sans connecteur ou sans correspondance).
  const crmPresence = useCrmPresence({ companyName, website, siren })
  const createTargetFromCrm = useCreateTargetFromCrmPresence()

  // #2117.36-38 — le volet administratif. Les trois mutations vivent HORS de
  // ce fichier (`useAccountAdminActions.ts`) : #2116.43 interdit tout
  // `toast.success` dans la barre d'actions elle-même.
  const archive = useArchiveAccountFromDossier()
  const detach = useDetachAccountFromDossier()
  const deleteAccount = useDeleteAccountFromDossier()
  // « Détacher » n'a de sens QUE si ce dossier appartient à un groupe (#1111)
  // — même lecture que `LinkedAccountsCard`, dont le cache est PARTAGÉ (même
  // clé) quand les deux sont montés sur le même dossier.
  const links = useQuery({
    queryKey: accountKeys.links(accountId ?? ''),
    queryFn: () => accountsApi.accountLinks(accountId as string),
    enabled: Boolean(accountId),
  })
  const canDetach = Boolean(accountId) && Boolean(links.data?.mergedInto) && !links.data?.detachRefusal

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <Tooltip delayDuration={1000}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <DossierCtaButton
                cta="dossier.moreActions.open"
                variant="ghost"
                size="icon"
                aria-label={t('moreActions.label')}
                className={cn('h-8 w-8', open && 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-primary)]')}
              >
                <MoreHorizontal className="size-4" />
              </DossierCtaButton>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          {!open && <TooltipContent>{t('moreActions.label')}</TooltipContent>}
        </Tooltip>
        <DropdownMenuContent align="end" className="max-h-[80dvh] w-64 overflow-y-auto">
          {/* #4507 — « Avancer » : le geste de l'état, compléter, Laura, puis commenter / planifier / CRM. */}
          <DropdownMenuLabel>{t('header.menu.groupNext')}</DropdownMenuLabel>
          {/* Les quatre identifiants restent LITTÉRAUX, un par branche (la garde lit la source). */}
          {nextAction?.state === 'plan-active' && (
            <DossierCtaMenuItem
              cta="dossier.hero.continueNextAction"
              className={itemClasses}
              onClick={nextAction.onSelect}
            >
              <ArrowRight className="size-4" />
              {t('hero.primary.continueNextAction')}
            </DossierCtaMenuItem>
          )}
          {nextAction?.state === 'no-plan' && (
            <DossierCtaMenuItem cta="dossier.hero.preparePlan" className={itemClasses} onClick={nextAction.onSelect}>
              <ClipboardList className="size-4" />
              {t('hero.primary.preparePlan')}
            </DossierCtaMenuItem>
          )}
          {nextAction?.state === 'meeting-booked' && (
            <DossierCtaMenuItem cta="dossier.hero.prepareMeeting" className={itemClasses} onClick={nextAction.onSelect}>
              <CalendarClock className="size-4" />
              {t('hero.primary.prepareMeeting')}
            </DossierCtaMenuItem>
          )}
          {nextAction?.state === 'watching' && (
            <DossierCtaMenuItem cta="dossier.hero.seeChanges" className={itemClasses} onClick={nextAction.onSelect}>
              <Eye className="size-4" />
              {t('hero.primary.seeChanges')}
            </DossierCtaMenuItem>
          )}
          {onCompleteAccount && (
            <DossierCtaMenuItem cta="dossier.hero.completeAccount" className={itemClasses} onClick={onCompleteAccount}>
              <DatabaseZap className="size-4" />
              {t('hero.primary.completeAccount')}
            </DossierCtaMenuItem>
          )}
          {onAskLaura && (
            <DossierCtaMenuItem cta="dossier.hero.askLaura" className={itemClasses} onClick={onAskLaura}>
              <MessageCircle className="size-4" />
              {t('hero.primary.askLaura')}
            </DossierCtaMenuItem>
          )}
          {workItems}
          {teamItems ? (
            <>
              <DropdownMenuSeparator />
              {teamItems}
            </>
          ) : null}
          <DropdownMenuSeparator />
          {/* Théo A comptes-fiche.R9 — le menu « … » en deux groupes : « Le dossier » (relire, actualiser)
              puis « Le compte » (références, cibles, gestes administratifs). */}
          {showRefreshDimensions && accountId && (
            <>
              <DropdownMenuLabel>{t('moreActions.groupDossier')}</DropdownMenuLabel>
              <AccountRefreshMenu accountId={accountId} />
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuLabel>{t('moreActions.groupAccount')}</DropdownMenuLabel>

          {/* #2165.13 — la SOURCE du preset Découvrir « Proches de mes
            meilleures références » : le commercial marque lui-même le compte
            qui lui sert de référence, jamais un calcul. */}
          {isCustomer && accountId && (
            <DossierCtaMenuItem
              cta="dossier.moreActions.bestReference"
              className={itemClasses}
              busy={setBestReference.isPending}
              onClick={() => setBestReference.mutate({ id: accountId, value: !isBestReference })}
            >
              <Star className="size-4" fill={isBestReference ? 'currentColor' : 'none'} />
              {t(isBestReference ? 'moreActions.unmarkBestReference' : 'moreActions.markBestReference')}
            </DossierCtaMenuItem>
          )}

          {/* #3245 (#3209.6) — le profil de pari DÉCLARÉ : ce que « où investir
            mon temps » de Laura lit pour nommer un portefeuille trop homogène. */}
          {accountId && (
            <DossierCtaMenuItem
              cta="dossier.moreActions.betProfile"
              className={itemClasses}
              onClick={() => setBetProfileOpen(true)}
            >
              <Scale className="size-4" />
              {t('moreActions.betProfile')}
            </DossierCtaMenuItem>
          )}

          {/* #2164.44 — une liste NEUVE dans « Mes cibles », seedée avec ce
            compte. Geste répétable, pas administratif : reste au-dessus de
            la ligne de séparation. */}
          {accountId && (
            <DossierCtaMenuItem
              cta="dossier.moreActions.createTarget"
              className={itemClasses}
              busy={createTarget.isPending}
              onClick={() => createTarget.mutate({ accountId, companyName })}
            >
              <Target className="size-4" />
              {t('moreActions.createTarget')}
            </DossierCtaMenuItem>
          )}

          {/* Épopée #2853 (#2157.7) — même geste que ci-dessus, depuis le
            connecteur CRM branché plutôt que le dossier d'analyse. Rendu
            SEULEMENT quand `CrmPresenceBadge` confirme une correspondance
            sur ce compte (`matched: true`) — sans connecteur ou sans
            correspondance, l'entrée reste absente. */}
          {accountId && crmPresence.data?.provider && crmPresence.data.matched && (
            <DossierCtaMenuItem
              cta="dossier.moreActions.createTargetFromCrm"
              className={itemClasses}
              busy={createTargetFromCrm.isPending}
              onClick={() => createTargetFromCrm.mutate({ accountId, companyName })}
            >
              <Target className="size-4" />
              {t('moreActions.createTargetFromCrm')}
            </DossierCtaMenuItem>
          )}

          {/* #2117.36-38 — le volet ADMINISTRATIF, réservé aux trois gestes
            rares : archiver, détacher, supprimer. Séparé du reste par une
            ligne, en fin de menu — ce n'est ni un geste quotidien (haut du
            hero) ni un geste occasionnel comme le rafraîchissement par axe,
            c'est un geste qu'on pose une fois sur ce dossier. */}
          {accountId && (
            <>
              {showRefreshDimensions && <DropdownMenuSeparator />}
              <DossierCtaMenuItem
                cta="dossier.moreActions.archive"
                className={itemClasses}
                busy={archive.isPending}
                onClick={() => archive.mutate({ accountId, companyName })}
              >
                <Archive className="size-4" />
                {t('moreActions.archive')}
              </DossierCtaMenuItem>
              {canDetach && (
                <DossierCtaMenuItem
                  cta="dossier.moreActions.detach"
                  className={itemClasses}
                  busy={detach.isPending}
                  onClick={() => detach.mutate({ accountId, companyName })}
                >
                  <Link2Off className="size-4" />
                  {t('moreActions.detach')}
                </DossierCtaMenuItem>
              )}
              <DossierCtaMenuItem
                cta="dossier.moreActions.delete"
                // #2116.40 côté visuel, pas au registre : le rouge passe par le
                // TOKEN sémantique (`*-soft-text`), jamais par une couleur fixe
                // qui échouerait AA d'un côté du thème (même garde que
                // `AccountRowActionsMenu`).
                className={cn(
                  itemClasses,
                  'text-[var(--danger-soft-text)] focus:bg-[color-mix(in_srgb,var(--bellum-danger)_10%,transparent)] focus:text-[var(--danger-soft-text)]',
                )}
                busy={deleteAccount.isPending}
                onClick={() => deleteAccount.mutate({ accountId, companyName })}
              >
                <Trash2 className="size-4" />
                {t('moreActions.delete')}
              </DossierCtaMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {accountId && (
        <BetProfileDialog
          accountId={accountId}
          companyName={companyName}
          open={betProfileOpen}
          onClose={() => setBetProfileOpen(false)}
        />
      )}
    </>
  )
}
