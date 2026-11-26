import { qualifyRank2, RANK2_QUALIFICATION_CRITERIA, WORKFLOW_OUTCOME_CATALOG } from '@bellum/contracts'
import { Badge, Box, Card, CardContent, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAccountPartnersLandscape } from '@/features/accounts/hooks/useAccountPartnersLandscape'
import { fetchPartnerRelations, PARTNER_PIPELINE_KEY } from '@/features/partner-pipeline/api/partner-pipeline-api'

/**
 * #2646.2 — LE CHEMIN RANG 2 → PREUVE → RANG 1, PROPOSÉ, JAMAIS CHIFFRÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT DÉJÀ, ET CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `account_partners.rank` porte `rank1`/`rank2`/`unknown` depuis toujours
 * (`account-partner.entity.ts`) — l'onglet Partenaires le LIT déjà. Le
 * catalogue `WORKFLOW_OUTCOME_CATALOG.rank2_to_rank1` (LEGACY-004) nomme déjà
 * les trois pas de ce chemin (`proof_pack`, `sponsor_path`,
 * `direct_access_plan`) et est déjà servi par `GET /action-os/workflows` —
 * mais rien, côté `/accounts/:id`, ne reliait « ce compte a un partenaire au
 * rang 2 » à « voici le chemin ». Les deux moitiés existaient, sans appelant
 * commun.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN CHEMIN, ET PAS UNE CHANCE DE RÉUSSITE
 * ─────────────────────────────────────────────────────────────────────────────
 * La doctrine refuse toute PROBABILITÉ affichée (chance de closing,
 * prévisionnel pondéré). Cette carte ne calcule donc rien : elle NOMME trois
 * pas, dans l'ordre du catalogue, sans pourcentage ni score qui laisserait
 * croire à une estimation de succès.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CONDITION D'AFFICHAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Seul un partenaire (`relationship: 'partner'`) au rang 2 déclenche la carte.
 * Un CONCURRENT au rang 2 n'ouvre aucune porte : ce n'est pas nous qui livrons
 * la mission, il n'y a donc aucune preuve à notre nom à constituer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2316.22-.27 / .36 — LA RÈGLE NO-GO, AVANT TOUT CV/POSITIONNEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Les trois pas du chemin (`proof_pack`, `sponsor_path`, `direct_access_plan`)
 * SONT le positionnement que #2316 encadre : le retour demande qu'un rang 2
 * soit qualifié sur cinq critères avant qu'on le lui propose. Tant que
 * `qualifyRank2` ne dit pas `go`, la carte montre la CHECKLIST — jamais les
 * trois pas — et nomme les critères, mesurés ou non (doctrine : « on n'affiche
 * pas ce qu'on n'a pas », « un score n'est jamais nu »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #3404.11 / .14 — LE CADRE DE GOUVERNANCE, QUAND CETTE PRÉSENCE EN DÉSIGNE UN
 * ─────────────────────────────────────────────────────────────────────────────
 * #3404 (« faire du rang 2 un objet métier structuré ») demande que Laura
 * sache « quand il interdit une approche directe » et « quand il détruit la
 * marge ». Les deux faits vivent déjà sur `partner_relations`
 * (`nonSolicitation`, `marginFloorPercent`/`marginSharePercent` — module
 * `partner-pipeline`) : quand `rank2Partner.partner_relation_id` en désigne
 * une, `direct_access_plan` — le pas qui PROPOSE l'accès direct — n'est plus
 * rendu, et une raison remplace le silence. Une recommandation ne doit jamais
 * encourager à contourner un partenaire ; retirer le pas, plutôt que
 * l'afficher sous une clause qu'on ignorerait, est la garde elle-même,
 * jamais une nuance qu'un lecteur pressé pourrait sauter.
 */
export function Rank2PathCard({ accountId }: { accountId: string }) {
  const { t } = useTranslation('accountDetail')
  const { data } = useAccountPartnersLandscape(accountId)
  const { data: partnerRelations } = useQuery({ queryKey: PARTNER_PIPELINE_KEY, queryFn: fetchPartnerRelations })

  const rank2Partner = (data?.partners ?? []).find(
    partner => partner.rank === 'rank2' && partner.relationship === 'partner',
  )
  if (!rank2Partner) return null

  const governedRelation = rank2Partner.partner_relation_id
    ? (partnerRelations ?? []).find(relation => relation.id === rank2Partner.partner_relation_id)
    : undefined
  const directApproachForbidden = governedRelation?.nonSolicitation === true
  const marginFloor = governedRelation?.governance.marginFloorPercent ?? null
  const marginShare = governedRelation?.governance.marginSharePercent ?? null
  const marginDestroyed = marginFloor !== null && marginShare !== null && marginShare < marginFloor

  const qualification = qualifyRank2(rank2Partner)

  if (qualification.decision !== 'go') {
    return (
      <Card>
        <CardContent className="space-y-2 p-4">
          <Text size="sm" weight="semibold">
            {t('plan.rank2Qualification.title')}
          </Text>
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('plan.rank2Qualification.description', { partner: rank2Partner.name })}
          </Text>
          <Box className="space-y-1">
            {RANK2_QUALIFICATION_CRITERIA.map(key => {
              const criterion = qualification.criteria.find(candidate => candidate.key === key)
              const met = criterion?.met ?? null
              return (
                <Box key={key} display="flex" className="items-center justify-between gap-2">
                  <Text size="xs">{t(`plan.rank2Qualification.criteria.${key}`)}</Text>
                  <Badge variant={met === true ? 'success' : met === false ? 'destructive' : 'outline'}>
                    {t(
                      `plan.rank2Qualification.status.${met === true ? 'met' : met === false ? 'missing' : 'unmeasured'}`,
                    )}
                  </Badge>
                </Box>
              )
            })}
          </Box>
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t(`plan.rank2Qualification.decision.${qualification.decision}`)}
          </Text>
        </CardContent>
      </Card>
    )
  }

  // #3404.11 — le pas qui PROPOSE l'accès direct disparaît quand une clause
  // de non-sollicitation l'interdit ; jamais rendu puis nuancé.
  const steps = WORKFLOW_OUTCOME_CATALOG.rank2_to_rank1.drafts.filter(
    step => !(step === 'direct_access_plan' && directApproachForbidden),
  )
  const ownerName =
    governedRelation?.governance.accountOwnership === 'ours' ? governedRelation?.governance.ourContactName : null

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <Text size="sm" weight="semibold">
          {t('plan.rank2Path.title')}
        </Text>
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('plan.rank2Path.description', { partner: rank2Partner.name })}
        </Text>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {steps.map(step => (
            <li key={step}>{t(`plan.rank2Path.steps.${step}`)}</li>
          ))}
        </ol>
        {/* #3404.11 — « quand il interdit une approche directe » : nommé, pas deviné. */}
        {directApproachForbidden && (
          <Text size="xs" color="text-[var(--danger-soft-text)]" weight="medium">
            {t('plan.rank2Path.directApproachForbidden')}
          </Text>
        )}
        {/* #3404.14 — « quand il détruit la marge » : le partage convenu sous
            le plancher déclaré, nommé — jamais un score qui l'absorberait. */}
        {marginDestroyed && marginShare !== null && marginFloor !== null && (
          <Text size="xs" color="text-[var(--danger-soft-text)]" weight="medium">
            {t('plan.rank2Path.marginDestroyed', { share: marginShare, floor: marginFloor })}
          </Text>
        )}
        {/* #3404.15 — « qui doit porter le message » : le propriétaire déclaré
            de la relation client, quand l'espace en a nommé un. */}
        {ownerName && (
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('plan.rank2Path.carriedBy', { name: ownerName })}
          </Text>
        )}
      </CardContent>
    </Card>
  )
}
