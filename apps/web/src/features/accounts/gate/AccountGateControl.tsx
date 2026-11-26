import type { PriorityGate } from '@bellum/contracts'
import {
  Box,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Text,
  Textarea,
} from '@bellum/ui'
import { Flag } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDecideAccountGate, useParkReasons } from './useAccountGate'
import { DossierCtaButton } from '@/features/accounts/view/account-detail/cta/DossierCta'
import { PARK_REASON_REQUIRED } from '@/features/accounts/view/account-detail/cta/dossier-cta-blocked'

const REASON_MAX = 200

type Props = {
  accountId: string
  gate: PriorityGate
  reason: string | null
  /** #2116.40 — le nom du compte, pour que le message de succès dise QUI vient
   *  d'entrer au portefeuille ou d'en sortir. `null` quand le compte n'a pas
   *  de nom lisible : le hook retombe alors sur un libellé générique, jamais
   *  sur un nom inventé. */
  companyName: string | null
  /**
   * #2117.84 — recette iPhone du 25/09 : la rangée compacte du hero mobile.
   * Rend le MÊME déclencheur (même contrat `dossier.gate.open`, même
   * popover) en icône seule, nommée par le même libellé (GA-32). `false` par
   * défaut : le bureau, qui ne la passe jamais, garde son rendu d'avant.
   */
  iconOnly?: boolean
}

/**
 * La porte G1 — « Prioriser ce compte » (PDF 2 §4.4 B2, ticket BEL-CRM-102).
 *
 * Trois issues dans un popover, et une seule qui ouvre un formulaire :
 * ÉCARTER. C'est délibéré et c'est la règle du ticket — prioriser est un geste
 * qu'on refait chaque semaine, l'assortir d'un motif obligatoire le ferait
 * contourner ; écarter, en revanche, est précisément ce qu'on voudra relire
 * dans six mois.
 *
 * Le choix « Prioriser » DISPARAÎT sur un compte écarté : la transition est
 * refusée côté serveur, et proposer un bouton qui rend une erreur fait perdre
 * un clic. Il faut d'abord rouvrir la question.
 */
export function AccountGateControl({ accountId, gate, reason, companyName, iconOnly = false }: Props) {
  const { t } = useTranslation('accounts')
  const decide = useDecideAccountGate(accountId, companyName)
  const { data: reasons } = useParkReasons()
  const [open, setOpen] = useState(false)
  const [askReason, setAskReason] = useState(false)
  const [draft, setDraft] = useState('')

  const choose = (next: PriorityGate) => {
    setOpen(false)
    if (next === 'parked') {
      setDraft('')
      setAskReason(true)
      return
    }
    decide.mutate({ gate: next })
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {/* #2116.28-31 — le contrat de ce bouton : `dossier.gate.open`.
              #2688.1 (retour bêta 21/09) — ce déclencheur affichait
              `t(\`gate.state.${gate}\`)` : le STATUT courant du compte
              (« À trancher », « Priorisé », « Écarté »), pas l'action qu'il
              déclenche réellement (ouvrir le choix prioriser/écarter/rouvrir).
              « À trancher » se lisait comme un jugement, pas un geste, et
              personne ne devinait qu'il fallait cliquer dessus. Le libellé est
              maintenant un verbe d'action STABLE, identique quel que soit
              l'état — `gate.state.*` reste inchangé, c'est un STATUT du
              contrat (PRIORITY_GATES, gardé par `enum-keys.test.ts`), pas le
              nom de ce bouton. */}
          <DossierCtaButton
            cta="dossier.gate.open"
            size={iconOnly ? 'icon' : 'sm'}
            variant="outline"
            busy={decide.isPending}
            icon={iconOnly ? Flag : undefined}
            aria-label={iconOnly ? t('gate.decide') : undefined}
          >
            {iconOnly ? null : t('gate.decide')}
          </DossierCtaButton>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-1 p-2">
          {/* #2116.28-30 — trois choix, trois contrats : l'ancien `GateChoice`
              factorisait le style ET l'identité. Le style vit dans les classes,
              l'identité doit rester LITTÉRALE sur chaque bouton, sinon aucune
              garde ne peut relire quel contrat porte quel geste. */}
          {gate !== 'prioritised' && gate !== 'parked' && (
            <DossierCtaButton
              cta="dossier.gate.prioritise"
              size="sm"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => choose('prioritised')}
            >
              {t('gate.actions.prioritise')}
            </DossierCtaButton>
          )}
          {gate !== 'parked' && (
            <DossierCtaButton
              cta="dossier.gate.park"
              size="sm"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => choose('parked')}
            >
              {t('gate.actions.park')}
            </DossierCtaButton>
          )}
          {gate === 'parked' && (
            <DossierCtaButton
              cta="dossier.gate.reopen"
              size="sm"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => choose('pending')}
            >
              {t('gate.actions.reopen')}
            </DossierCtaButton>
          )}
          {gate === 'parked' && reason && (
            <Text size="xs" color="text-[var(--bellum-text-muted)]" className="px-2 py-1">
              {t('gate.parkedBecause', { reason })}
            </Text>
          )}
        </PopoverContent>
      </Popover>

      <Dialog open={askReason} onOpenChange={setAskReason}>
        <DialogContent closeLabel={t('common:actions.close')}>
          <DialogHeader>
            <DialogTitle>{t('gate.parkDialog.title')}</DialogTitle>
            <DialogDescription>{t('gate.parkDialog.description')}</DialogDescription>
          </DialogHeader>

          {/* Les motifs déjà utilisés par l'espace en premier : c'est ainsi
              qu'une ESN se constitue SA liste, au lieu d'en recevoir une
              inventée. Ils sont PROPOSÉS — le texte reste libre. */}
          <Box display="flex" className="flex-wrap gap-1">
            {(reasons?.items ?? []).map(item => (
              <DossierCtaButton
                key={item.label}
                cta="dossier.gate.park.reason"
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs"
                onClick={() => setDraft(item.label)}
              >
                {item.label}
              </DossierCtaButton>
            ))}
          </Box>

          <Textarea
            value={draft}
            maxLength={REASON_MAX}
            onChange={event => setDraft(event.target.value.slice(0, REASON_MAX))}
            placeholder={t('gate.parkDialog.placeholder')}
            rows={3}
          />

          <DialogFooter>
            <DossierCtaButton
              cta="dossier.gate.park.cancel"
              size="sm"
              variant="ghost"
              onClick={() => setAskReason(false)}
            >
              {t('gate.parkDialog.cancel')}
            </DossierCtaButton>
            <DossierCtaButton
              cta="dossier.gate.park.confirm"
              size="sm"
              // #2116.45-47 — le bouton reste INERTE tant que le motif est vide
              // (le serveur refuserait de toute façon), mais il DIT pourquoi,
              // ce qui manque et le geste qui débloque : un bouton gris sans
              // raison fait chercher une panne là où il manque une phrase.
              blockedBy={draft.trim().length === 0 ? PARK_REASON_REQUIRED : null}
              busy={decide.isPending}
              onClick={() => {
                decide.mutate({ gate: 'parked', reason: draft.trim() })
                setAskReason(false)
              }}
            >
              {t('gate.parkDialog.confirm')}
            </DossierCtaButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
