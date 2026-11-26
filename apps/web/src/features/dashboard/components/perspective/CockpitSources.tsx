import type { CockpitProvenance } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { ComputedAt } from '@/components/primitives/ComputedAt'

/**
 * « Sur quoi, depuis où, et de quand » — la ligne de confiance d'un bloc (#1411).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE RETOUR DEMANDAIT, ET LE MOT QU'IL FALLAIT CORRIGER
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour demande quatre choses sous chaque insight — période, population,
 * sources, dernière mise à jour — et il donne son exemple : « Sources : Gmail +
 * CRM + actions Bellum ».
 *
 * Les quatre sont livrées. Le mot « Gmail », non : c'est un nom d'ÉDITEUR, et
 * le dépôt ne les nomme jamais côté application — on nomme la CAPACITÉ (« ta
 * messagerie », « ton CRM »), la seule exception étant Réglages › Intégrations,
 * où l'utilisateur autorise lui-même l'accès. L'intention est livrée, le mot est
 * corrigé, et ce commentaire existe pour que la correction ne se redécouvre pas
 * comme un oubli.
 *
 * ⚠️ Une source ABSENTE de la liste n'a pas été lue, et c'est ce qui permet
 * d'écrire « Non mesurable — CRM non connecté » plutôt qu'un zéro. Une liste
 * VIDE veut dire qu'on n'a rien pu lire du tout : le bloc le dit au lieu de se
 * taire, parce qu'un bloc muet se lit comme un bloc à zéro.
 *
 * `ComputedAt` porte la date : c'est LA primitive du dépôt pour ça, et elle sait
 * déjà se taire quand le calcul est à la volée (rien à apprendre d'une heure qui
 * est celle de la requête).
 */
export function CockpitSources({ provenance }: { provenance: CockpitProvenance }) {
  const { t } = useTranslation('dashboard')

  const sources = provenance.sources.map(source => t(`perspective.sources.${source}`))
  const parts = [
    sources.length > 0 ? t('perspective.sourcesLine', { list: sources.join(' · ') }) : t('perspective.sourcesNone'),
    provenance.window_days !== null ? t('perspective.window', { days: provenance.window_days }) : null,
    provenance.population !== null ? t('perspective.population', { count: provenance.population }) : null,
  ].filter(Boolean)

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {parts.join(' · ')}
      </Text>
      <ComputedAt at={provenance.computed_at} />
    </div>
  )
}
