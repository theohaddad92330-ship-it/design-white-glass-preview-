import { useState, type ReactNode } from 'react'
import { dossierCta, type Account } from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { RelaunchScope } from '@/features/accounts/hooks/useAccountRelaunch'
import { useAccountRuns } from '@/features/accounts/hooks/useAccountRuns'

/**
 * Ce qu'« Actualiser l'analyse » refait, et ce qu'il ne touche pas (#1133).
 *
 * « En espérant que ça n'écrase pas les infos. »
 *
 * Le retour dit deux choses, et la seconde est le sujet : au moment du clic,
 * rien ne permettait de savoir ce qui allait être réécrit. La garantie, elle,
 * existe depuis longtemps côté serveur — elle n'avait simplement aucun chemin
 * jusqu'à l'endroit où la question se pose.
 *
 * CE QUI EST AFFIRMÉ ICI EST EXACTEMENT CE QUE LE CODE TIENT, pas un mot de
 * plus :
 *
 * · « sans créer de doublon » — `AnalysisService` réutilise le compte canonique
 *   en place (`reuseForRelaunch`), il n'insère jamais une seconde ligne.
 * · « les champs de la fiche corrigés à la main » — `AccountsService.arbitrate`
 *   relit la provenance des champs et retire du patch du pipeline tout champ
 *   dont la source est `human` (secteur, effectif, CA, siège, site, téléphone,
 *   adresse, SIREN, code NAF, raison sociale).
 * · « les contacts déjà trouvés » — `ContactsService.bulkInsert` fusionne par
 *   identité (nom normalisé / e-mail / LinkedIn / id fournisseur) et aucune
 *   phase du pipeline ne supprime ni n'archive une ligne de contact.
 * · « les faits, l'organigramme et le plan sont refaits » — la phase 1 réécrit
 *   `raw_analysis`, la phase 3 le graphe, la phase 4 le plan.
 *
 * Ce qui n'est PAS affirmé, et c'est délibéré : rien sur les angles et les
 * actions que l'utilisateur ajoute lui-même au plan. Le panneau de confirmation
 * de `/search` le dit, parce que c'est là que le geste devient irréversible.
 *
 * OÙ ça se lit (revu le 01/09/2026) : au SURVOL du bouton, plus en paragraphe
 * dans l'entête. Quatre lignes de garantie occupaient le tiers du bandeau d'un
 * dossier qu'on rouvre chaque semaine ; la question, elle, ne se pose qu'au
 * moment de viser le bouton. Le survol n'existant pas au doigt, la version
 * écrite reste rendue en pointeur GROSSIER (`RelaunchImpactNote`) — sinon la
 * garantie disparaîtrait purement et simplement du mobile.
 */
function useRelaunchImpactText(status: Account['status']): string | null {
  const { t } = useTranslation('accounts')

  // Un dossier jamais livré n'a ni fiche corrigée ni contacts : promettre de les
  // conserver parlerait de ce qui n'existe pas. Le silence est la seule réponse
  // vraie tant qu'il n'y a rien à écraser.
  return status === 'completed' ? t('hero.relaunchImpact') : null
}

/**
 * Ce que le clic va produire, et la garantie quand il y a quelque chose à
 * écraser — au survol du bouton qui pose la question.
 *
 * #2116.34 — l'infobulle existe DÉSORMAIS TOUJOURS, et c'est un changement
 * assumé : le contrat du bouton (`dossier.analysis.relaunch`) dit que l'effet
 * est une NAVIGATION vers la recherche pré-remplie, pas une relance immédiate,
 * et cette phrase-là vaut sur tous les états du dossier. La garantie de #1133,
 * elle, reste réservée au dossier LIVRÉ : promettre de conserver des contacts
 * qui n'existent pas parlerait de rien.
 *
 * Elle porte la description PLUTÔT qu'un `title` natif sur le bouton : les deux
 * ensemble afficheraient deux bulles superposées au survol.
 */
export function RelaunchImpactTooltip({ account, children }: { account: Account; children: ReactNode }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const text = useRelaunchImpactText(account.status)
  const expectedKey = dossierCta('dossier.analysis.relaunch')?.expectedResultKey
  const expected = expectedKey ? t(expectedKey) : null

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[min(24rem,calc(100vw-2rem))] leading-relaxed">
        {expected && <span className="block">{expected}</span>}
        {/* #4463 — plus de coût annoncé : seul l'IMPACT de la relance se lit ici. */}
        {text && <span className="mt-1 block">{text}</span>}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * #2555 (recette prod 07/10, Thales) — le CLIC sur « Actualiser l'analyse »
 * ouvrait seulement l'infobulle de survol : rien ne s'annonçait au moment du
 * geste. Cette confirmation dit, AVANT de partir vers la recherche
 * pré-remplie : le coût (même source que l'infobulle), le périmètre REPRIS de
 * la dernière analyse (mode + zone, pays compris — la puce « France » se lit
 * « Zone : France », comme le filtre des personnes depuis #3742), et ce qui est
 * refait (organigramme compris). Le diff (personnes nouvelles / non
 * reconfirmées) est rendu après coup par `RefreshOutcomeCard`.
 *
 * Un run sans périmètre enregistré ne s'invente pas : la ligne le dit.
 */
export function RelaunchConfirmDialog({
  account,
  open,
  onOpenChange,
  onConfirm,
}: {
  account: Account
  open: boolean
  onOpenChange: (open: boolean) => void
  /** #3742 — reçoit le périmètre de la dernière analyse (puce + zone), pour que la relance le REPRENNE. */
  onConfirm: (scope: RelaunchScope) => void
}) {
  const { t } = useTranslation('accounts')
  const { t: tSearch } = useTranslation('search')
  const { data: runs } = useAccountRuns(open ? account.id : undefined)
  const lastRun = runs?.[0]
  const mode = lastRun?.scope_mode ?? null
  const selection = (lastRun?.scope_selection ?? null) as Record<string, unknown> | null
  const geo = typeof selection?.['geo_perimeter'] === 'string' ? (selection['geo_perimeter'] as string) : null
  const areas = Array.isArray(selection?.['geo_areas'])
    ? (selection['geo_areas'] as unknown[]).filter((area): area is string => typeof area === 'string' && !!area.trim())
    : []
  const zone = geo ?? (mode === 'france' ? 'france' : null)
  const modeLabel = mode ? tSearch(`scope.modes.${mode.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`) : null
  const zoneLabel = zone ? [tSearch(`confirm.geo.perimeters.${zone}`), ...areas].join(' · ') : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-md border-[var(--bellum-border)]">
        <DialogHeader>
          {/* #3709 — titre COURT + nom du compte en sous-titre : le titre long
              passait sur quatre lignes et chevauchait la croix de fermeture
              (`pr-8` réserve sa place). */}
          <DialogTitle className="pr-8 leading-snug">{t('relaunchConfirm.title')}</DialogTitle>
          {account.company_name ? (
            <Text size="sm" weight="medium" className="break-words pr-8 text-[var(--bellum-text-primary)]">
              {account.company_name}
            </Text>
          ) : null}
          <DialogDescription>{t('relaunchConfirm.description')}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5 text-sm text-[var(--bellum-text-secondary)]">
          <li>{modeLabel ? t('relaunchConfirm.scope', { scope: modeLabel }) : t('relaunchConfirm.scopeUnknown')}</li>
          {/* Seuls `france` et `europe` écartent des personnes côté API
              (`isOutsideGeoPerimeter`) : la phrase ne le promet que là. */}
          {zoneLabel ? (
            <li>
              {t(zone === 'france' || zone === 'europe' ? 'relaunchConfirm.zoneFiltered' : 'relaunchConfirm.zone', {
                zone: zoneLabel,
              })}
            </li>
          ) : null}
          <li>{t('hero.relaunchImpact')}</li>
          <li>{t('relaunchConfirm.diffAfter')}</li>
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('relaunchConfirm.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => {
              onOpenChange(false)
              onConfirm({ scopeMode: mode, geoPerimeter: geo, geoAreas: areas })
            }}
          >
            {t('relaunchConfirm.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Le repli tactile : au doigt il n'y a pas de survol, donc la garantie reste
 *  écrite. Rendue nulle part ailleurs — un pointeur fin la lit dans l'infobulle. */
export function RelaunchImpactNote({ status }: { status: Account['status'] }) {
  const text = useRelaunchImpactText(status)
  if (!text) return null

  return (
    <Text size="xs" className="mt-4 hidden pointer-coarse:block text-[var(--bellum-text-muted)]">
      {text}
    </Text>
  )
}
