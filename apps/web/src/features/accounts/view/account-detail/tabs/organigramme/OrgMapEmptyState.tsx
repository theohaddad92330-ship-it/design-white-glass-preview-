import { Button, Card, EmptyState } from '@bellum/ui'
import { Network, Search, Sparkles, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEnrichContacts, useEnrichOrganigram } from '@/features/accounts/hooks/useEnrichAccount'
import { useElapsedWhilePending } from '@/features/accounts/hooks/useElapsedWhilePending'
import { useCreditGate } from '@/features/credits/hooks/useCreditGate'

type OrgMapEmptyStateProps = { variant: 'noGraph'; accountId: string; hasContacts: boolean } | { variant: 'noEntities' }

/**
 * Ce qui occupe la place de l'ancien `OrgChart` — décision **D280** (30/08) :
 * le retirer maintenant, il affichait le RÔLE comme une rangée de l'arbre, ce
 * que le FINAL du 27/08 interdit explicitement (position = hiérarchie L0-L4,
 * rôle = badge). Un repli ne se retire pas en laissant un blanc.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX VIDES, DEUX PHRASES
 * ─────────────────────────────────────────────────────────────────────────
 * `noGraph`     — ce dossier n'a PAS de graphe d'organigramme du tout
 *                 (`raw_analysis.org.orgGraph` absent, invalide, ou vide).
 *                 Il faut LANCER une analyse. Deux gestes selon ce qui
 *                 manque réellement : sans contact, on en cherche d'abord ;
 *                 avec des contacts, on relance l'enrichissement qui les
 *                 classe.
 * `noEntities`  — la vue système, sur un graphe qui EXISTE et porte des
 *                 personnes, mais aucune entité (filiale, BU). L'analyse a
 *                 tourné ; elle n'a rien trouvé à cartographier ICI. Ce
 *                 n'est PAS la même situation que `noGraph`, et ne lui
 *                 emprunte jamais ses mots (garde
 *                 `org-map-empty-states-are-distinct.test.ts`).
 *
 * Si les deux ne peuvent pas être distingués depuis les données disponibles,
 * le mauvais choix est d'en inventer une seule — voir le docblock de
 * `TabOrganigramme.tsx` pour ce que chaque position du code SAIT au moment
 * où elle choisit cette variante.
 */
export function OrgMapEmptyState(props: OrgMapEmptyStateProps) {
  const { t } = useTranslation('accountOrg')
  const gate = useCreditGate()
  // Toujours instanciées : les deux mutations ne PARTENT que sur un clic, et
  // les Règles des Hooks interdisent de les poser derrière une condition.
  const enrichContactsMutation = useEnrichContacts(props.variant === 'noGraph' ? props.accountId : '')
  const enrichOrgMutation = useEnrichOrganigram(props.variant === 'noGraph' ? props.accountId : '')
  // #3020 — `isLoading` (packages/ui `Button`) remplace les enfants par un
  // spinner nu pendant l'appel : c'est `loadingText` qui porte ce qui reste
  // lisible, le temps RÉELLEMENT écoulé plutôt qu'un pourcentage inventé.
  const enrichOrgElapsed = useElapsedWhilePending(enrichOrgMutation.isPending)

  if (props.variant === 'noEntities') {
    return (
      <Card className="flex h-64 items-center justify-center rounded-2xl bg-[var(--bellum-bg)] p-5">
        <EmptyState
          size="sm"
          icon={<Network />}
          title={t('mapEmptyState.noEntitiesTitle')}
          description={t('mapEmptyState.noEntitiesDescription')}
        />
      </Card>
    )
  }

  if (!props.hasContacts) {
    // Même situation, même geste que l'ancien état vide de `OrgChart` : sans
    // aucun contact, il n'y a rien à classer — on en CHERCHE d'abord.
    return (
      <Card className="flex h-64 items-center justify-center rounded-xl bg-[var(--bellum-bg)] p-5">
        <EmptyState
          size="sm"
          icon={<Users />}
          title={t('emptyState.title')}
          description={t('emptyState.description')}
          action={
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={() => enrichContactsMutation.mutate()}
              disabled={enrichContactsMutation.isPending}
              isLoading={enrichContactsMutation.isPending}
              icon={Search}
              className="gap-2"
            >
              {enrichContactsMutation.isPending ? t('emptyState.searching') : t('emptyState.cta')}
            </Button>
          }
        />
      </Card>
    )
  }

  return (
    <Card className="flex h-64 items-center justify-center rounded-xl bg-[var(--bellum-bg)] p-5">
      <EmptyState
        size="sm"
        icon={<Network />}
        title={t('mapEmptyState.noGraphTitle')}
        description={t('mapEmptyState.noGraphDescription')}
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => enrichOrgMutation.mutate()}
            // #2502 — DÉFAUT recette 17/09 (passage 7) : ce geste ne débite
            // AUCUN crédit (`analysis-ondemand.service.ts:960-963`, premier
            // peuplement depuis le vide — pas un `POST :accountId/refresh`).
            // Le griser à zéro crédit rendait « Générer » injoignable :
            // l'organigramme disparu, sans aucune façon de le ramener. Seul
            // `locked` (essai terminé) est une vraie porte fermée ici.
            disabled={enrichOrgMutation.isPending || gate.locked}
            isLoading={enrichOrgMutation.isPending}
            loadingText={t('organigramme.enrichingElapsed', { elapsed: enrichOrgElapsed })}
            icon={Sparkles}
            className="gap-2"
            title={gate.locked ? t('organigramme.enrichLockedTitle') : undefined}
          >
            {t('mapEmptyState.noGraphCta')}
          </Button>
        }
      />
    </Card>
  )
}
