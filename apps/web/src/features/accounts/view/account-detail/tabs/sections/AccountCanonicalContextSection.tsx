import { useAccountIntelligenceContext } from '@/features/accounts/hooks/useAccountIntelligenceContext'
import type { TabId } from '../../components/AccountDetailTabsBar'
import { AccountCanonicalContextCard } from './AccountCanonicalContextCard'

/**
 * #2116 — L'APPELANT QUI MANQUAIT à `GET /accounts/:id/intelligence-context`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE HOOK VIT ICI, ET PAS EN TÊTE DE `TabOverview`
 * ─────────────────────────────────────────────────────────────────────────────
 * Un hook RÉSEAU posé dans un composant largement monté casse des tests qui ne
 * parlent pas du sujet — `TabOverview` se rend dans des harnais sans
 * `SessionProvider`, et `useSession` lève. Le motif est connu du dépôt, et il
 * a une seconde vertu ici : la vue d'ensemble est REPLIÉE par défaut (#1881),
 * donc la requête ne part que si quelqu'un ouvre la section. Un dossier
 * survolé ne coûte rien.
 *
 * La carte reste PURE (elle reçoit `context`) : c'est elle qu'on teste sur les
 * huit provenances et les huit métadonnées, sans monter de client de requête.
 */
export function AccountCanonicalContextSection({
  accountId,
  onTabChange,
  excludeTechnologies,
  contacts,
}: {
  accountId: string
  onTabChange: (tab: TabId) => void
  /** #3499 — technologies déjà en pastilles dans « Stack technique ». */
  excludeTechnologies?: readonly string[]
  /** K.3 / #4325 — détaille la ligne « Autre » des familles de métiers observées. */
  contacts?: ReadonlyArray<{ family?: string | null; title?: string | null }>
}) {
  const context = useAccountIntelligenceContext(accountId).data ?? null
  return (
    <AccountCanonicalContextCard
      context={context}
      onTabChange={onTabChange}
      excludeTechnologies={excludeTechnologies}
      contacts={contacts}
    />
  )
}
