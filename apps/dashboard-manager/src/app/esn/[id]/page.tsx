import { fetchAdminWorkspace, type AdminWorkspaceDetail } from '@/lib/admin'
import { RenameWorkspace } from './_components/rename-workspace'
import { AddMember } from './_components/add-member'
import { OwnershipTransferPanel } from './_components/ownership-transfer-panel'
import { RemoveMemberButton } from './_components/remove-member-button'
import { EsnProfilePanel } from './_components/esn-profile-panel'
import { OwnerInvitationPanel } from './_components/owner-invitation-panel'
import { WorkspaceHealthPanel } from './_components/workspace-health-panel'
import { CostLedgerPanel } from './_components/cost-ledger-panel'
import { CostLeversPanel } from './_components/cost-levers-panel'
import { ToolQuotaPanel } from './_components/tool-quota-panel'
import { EmailEnClair } from '@/app/_components/email-en-clair'
import { dateEtHeure } from '@/lib/dates'
import { fetchWorkspaceHealth, type WorkspaceHealthReport } from '@/lib/workspace-health'
import { fetchWorkspaceCostLedger, type WorkspaceCostLedgerEntry } from '@/lib/workspace-cost-ledger'
import { fetchWorkspaceCostLevers } from '@/lib/workspace-cost-levers'
import { fetchWorkspaceToolQuotas } from '@/lib/workspace-tool-quotas'
import type { ToolDailyCapStatus, WorkspaceBudgetLevers } from '@bellum/contracts'

// Backoffice — ESN detail: rename, members (add/remove) and pending invitations.
export const dynamic = 'force-dynamic'

const shortDate = (iso: string): string => dateEtHeure(iso)

export default async function EsnDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  let detail: AdminWorkspaceDetail
  try {
    detail = await fetchAdminWorkspace(params.id)
  } catch (err) {
    return (
      <main className="wrap">
        <a className="link" href="/esn">
          ← retour aux ESN
        </a>
        <div className="error" style={{ marginTop: 16 }}>
          ESN indisponible. {err instanceof Error ? err.message : String(err)}
        </div>
      </main>
    )
  }

  // ⚠️ Panne isolée : une panne de la sonde de santé produit (9 requêtes SQL,
  // #2977) ne doit jamais faire disparaître le reste de la fiche ESN — le
  // panneau le dit lui-même, sans faire échouer la page entière.
  let workspaceHealth: WorkspaceHealthReport | null = null
  let workspaceHealthPanne: string | null = null
  try {
    workspaceHealth = await fetchWorkspaceHealth(params.id)
  } catch (err) {
    workspaceHealthPanne = err instanceof Error ? err.message : String(err)
  }

  // ⚠️ Même isolation de panne — #2975 : le ledger de coût IA est un panneau
  // séparé, sa panne ne doit jamais faire disparaître le reste de la fiche.
  let costLedger: WorkspaceCostLedgerEntry[] | null = null
  let costLedgerPanne: string | null = null
  try {
    costLedger = await fetchWorkspaceCostLedger(params.id)
  } catch (err) {
    costLedgerPanne = err instanceof Error ? err.message : String(err)
  }

  // Même isolation de panne : les cinq leviers (#2440.83-89) sont un panneau séparé.
  let costLevers: WorkspaceBudgetLevers | null = null
  let costLeversPanne: string | null = null
  try {
    costLevers = await fetchWorkspaceCostLevers(params.id)
  } catch (err) {
    costLeversPanne = err instanceof Error ? err.message : String(err)
  }

  // Même isolation de panne : le quota quotidien par outil (#2440.45) est un panneau séparé.
  let toolQuotas: ToolDailyCapStatus[] | null = null
  let toolQuotasPanne: string | null = null
  try {
    toolQuotas = await fetchWorkspaceToolQuotas(params.id)
  } catch (err) {
    toolQuotasPanne = err instanceof Error ? err.message : String(err)
  }

  const workspace = detail.workspace
  const members = detail.members ?? []
  const invitations = detail.invitations ?? []

  return (
    <main className="wrap">
      <a className="link" href="/esn">
        ← retour aux ESN
      </a>

      <h1 style={{ marginTop: 12 }}>{workspace?.name || 'ESN'}</h1>
      <p className="subtitle">
        Propriétaire {workspace?.ownerEmail || '—'} · {members.length} membre{members.length > 1 ? 's' : ''}
      </p>

      <section className="card" style={{ display: 'grid', gap: 10 }}>
        <div className="label">Renommer l&apos;ESN</div>
        <RenameWorkspace id={workspace?.id ?? params.id} name={workspace?.name ?? ''} />
      </section>

      {/* La fiche ESN partagée (#1671-ter) — juste sous l'identité de l'espace,
          parce que c'est elle qui décide de ce que ses membres auront à remplir. */}
      <EsnProfilePanel esnProfile={detail.esnProfile} />

      {/* L'activation du propriétaire — #2643.2 : préparée et montrée ici,
          jamais envoyée sans un clic opérateur (#2643.1). */}
      <OwnerInvitationPanel id={workspace?.id ?? params.id} ownerInvitation={detail.ownerInvitation} />

      {/* La santé PRODUIT de l'espace (§5.6, #2977) — le score interne à neuf
          axes, distinct de la colonne Santé de `/revenus/clients` (#1652). */}
      <WorkspaceHealthPanel report={workspaceHealth} panne={workspaceHealthPanne} />

      {/* Le LEDGER de coût IA (épopée #2975) — la table et l'écriture
          existaient déjà, testées ; ce panneau est la LECTURE ADMIN qui
          manquait, ligne par ligne, jamais un total entre espaces (GA-43). */}
      <CostLeversPanel id={workspace?.id ?? params.id} levers={costLevers} panne={costLeversPanne} />
      <ToolQuotaPanel quotas={toolQuotas} panne={toolQuotasPanne} />
      <CostLedgerPanel entries={costLedger} panne={costLedgerPanne} />

      <section className="card" style={{ marginTop: 16, display: 'grid', gap: 14 }}>
        <div className="label">Membres</div>
        <AddMember id={workspace?.id ?? params.id} />
        {members.length === 0 ? (
          <div className="empty" style={{ padding: 12 }}>
            Aucun membre.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Nom</th>
                <th>Rôle</th>
                <th>Depuis</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map(m => {
                const isOwner = m.userId === workspace?.ownerUserId || m.role === 'owner'
                return (
                  <tr key={m.userId}>
                    <td>
                      <EmailEnClair email={m.email} />
                    </td>
                    <td>{m.fullName || '—'}</td>
                    <td>
                      <span className="pill">{m.role}</span>
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{shortDate(m.joinedAt)}</td>
                    <td>
                      {isOwner ? (
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>propriétaire</span>
                      ) : (
                        <RemoveMemberButton
                          id={workspace?.id ?? params.id}
                          userId={m.userId}
                          label={m.email || m.fullName || m.userId}
                        />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* #4158.33 — le transfert de propriété n'existe QUE dans le back-office. */}
      <OwnershipTransferPanel
        id={workspace?.id ?? params.id}
        candidats={members
          .filter(m => m.role === 'admin')
          .map(m => ({ userId: m.userId, label: m.email || m.fullName || m.userId }))}
      />

      <section className="card" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <div className="label">Invitations en attente</div>
        {invitations.length === 0 ? (
          <div className="empty" style={{ padding: 12 }}>
            Aucune invitation en attente.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th>Expire le</th>
                <th>Envoyée le</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map(inv => (
                <tr key={inv.id}>
                  <td>
                    <EmailEnClair email={inv.email} />
                  </td>
                  <td>
                    <span className="pill">{inv.role}</span>
                  </td>
                  <td>
                    <span className="badge">{inv.status}</span>
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{shortDate(inv.expiresAt)}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{shortDate(inv.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}
