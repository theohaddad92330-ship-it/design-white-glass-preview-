import { SubTabs } from '@/components/sub-tabs'
import { CataloguePanel } from './_components/catalogue-panel'
import { ClientsPanel } from './_components/clients-panel'
import { DeliveriesPanel } from './_components/deliveries-panel'
import { ScopeGapsPanel } from './_components/scope-gaps-panel'

// Écran « Intégrations » du back-office — la moitié OPÉRATEUR du registre
// d'outils, sortie de Réglages › Intégrations côté app.
//
// L'écran client ne garde que ce sur quoi l'utilisateur peut agir : brancher,
// débrancher, tester. L'inventaire arrive ici, en deux vues :
//   • Catalogue — ce que chaque outil sait faire, son coût, ses limites de
//     débit, sa rétention, et si CE serveur est configuré pour l'offrir ;
//   • Par client — l'état réel chez un espace de travail donné ;
//   • Livraisons — le journal des webhooks avec sa trace technique (code HTTP,
//     tentative, erreur). Il était sur l'écran utilisateur, qui n'en tirait
//     aucun geste ; il est ici depuis le 14/08.
//
// Cross-tenant derrière InternalSecretGuard, comme le reste du back-office.
// Toujours frais.
export const dynamic = 'force-dynamic'

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const view = first(params['view']) || 'catalogue'
  const workspaceId = first(params['workspace'])

  return (
    <main className="wrap">
      <h1>Intégrations</h1>
      <p className="subtitle">
        Backoffice — registre des outils : capacités, coûts, limites de débit, rétention, et état réel par client.
      </p>

      <SubTabs
        tabs={[
          { label: 'Catalogue', href: '/integrations?view=catalogue', active: view === 'catalogue' },
          { label: 'Par client', href: '/integrations?view=clients', active: view === 'clients' },
          { label: 'Livraisons', href: '/integrations?view=deliveries', active: view === 'deliveries' },
          { label: 'Connexions incomplètes', href: '/integrations?view=scope-gaps', active: view === 'scope-gaps' },
        ]}
      />

      {view === 'clients' ? (
        <ClientsPanel workspaceId={workspaceId} />
      ) : view === 'scope-gaps' ? (
        <ScopeGapsPanel />
      ) : view === 'deliveries' ? (
        <DeliveriesPanel {...(workspaceId ? { workspaceId } : {})} />
      ) : (
        <CataloguePanel />
      )}
    </main>
  )
}
