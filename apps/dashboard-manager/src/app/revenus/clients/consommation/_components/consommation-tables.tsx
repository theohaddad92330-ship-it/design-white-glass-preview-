'use client'

import type { JSX } from 'react'
import { DataTable, EmptyState, type DataTableColumn } from '@/ui'
import { EmailEnClair } from '@/app/_components/email-en-clair'
import type { CreditConsumptionReport, UserConsumptionRow, WorkspaceConsumptionRow } from '@/lib/credit-consumption'
import { libelleConsomme, libelleRenouvellement, libelleSolde, trierEpuises, trierEspaces } from '../consommation.logic'

/**
 * #4467 — LA CONSOMMATION DE CRÉDITS, par espace ET par utilisateur.
 *
 * Les crédits sont implicites côté client (#4468) : cet écran est le SEUL endroit
 * où ils se voient. Trois blocs, dans l'ordre où l'opérateur les lit :
 *  1. les comptes à solde ÉPUISÉ — ceux qui voient le frein doux ;
 *  2. les espaces : solde du pool, consommé sur la fenêtre, renouvellement ;
 *  3. les utilisateurs : leur consommation propre, le solde du pool de leur espace.
 *
 * ⚠️ Le solde est celui du POOL de l'espace, partagé : il n'existe pas de solde
 * individuel. Ajuster un solde = ajuster le pool, donc la fiche du PROPRIÉTAIRE
 * (la route `/api/admin/users/[userId]/credits` existait déjà, avec sa capacité
 * `credits.grant` et son journal d'audit — rien n'est réécrit ici).
 */
export function ConsommationTables({ report }: { report: CreditConsumptionReport }): JSX.Element {
  const proprietaireDe = new Map(report.workspaces.map(espace => [espace.workspaceId, espace.ownerUserId]))
  const ajuster = (workspaceId: string): string | null => {
    const owner = proprietaireDe.get(workspaceId)
    return owner ? `/users/${encodeURIComponent(owner)}` : null
  }

  const colonnesEspaces: DataTableColumn<WorkspaceConsumptionRow>[] = [
    { key: 'name', header: 'Espace', sortValue: row => row.name, render: row => row.name },
    { key: 'plan', header: 'Offre', sortValue: row => row.plan, render: row => row.plan ?? '—' },
    {
      key: 'solde',
      header: 'Solde restant',
      align: 'right',
      sortValue: row => row.remaining,
      render: row => libelleSolde(row),
    },
    {
      key: 'consomme',
      header: `Consommé (${report.windowDays} j)`,
      align: 'right',
      sortValue: row => row.consumed,
      render: row => libelleConsomme(row.consumed),
    },
    {
      key: 'renouvellement',
      header: 'Renouvellement',
      sortValue: row => row.renewsAt,
      render: row => libelleRenouvellement(row.renewsAt),
    },
    {
      key: 'membres',
      header: 'Membres',
      align: 'right',
      sortValue: row => row.memberCount,
      render: row => row.memberCount,
    },
    {
      key: 'ajuster',
      header: 'Solde',
      render: row => <a href={`/users/${encodeURIComponent(row.ownerUserId)}`}>Ajuster</a>,
    },
  ]

  const colonnesComptes = (avecSolde: boolean): DataTableColumn<UserConsumptionRow>[] => [
    {
      key: 'email',
      header: 'Utilisateur',
      sortValue: row => row.email,
      render: row => (
        <a href={`/users/${encodeURIComponent(row.userId)}`}>
          {row.email ? <EmailEnClair email={row.email} /> : row.userId}
        </a>
      ),
    },
    { key: 'espace', header: 'Espace', sortValue: row => row.workspaceName, render: row => row.workspaceName },
    {
      key: 'consomme',
      header: `Consommé (${report.windowDays} j)`,
      align: 'right',
      sortValue: row => row.consumed,
      render: row => libelleConsomme(row.consumed),
    },
    ...(avecSolde
      ? [
          {
            key: 'solde',
            header: 'Solde du pool',
            align: 'right' as const,
            sortValue: (row: UserConsumptionRow) => row.remaining,
            render: (row: UserConsumptionRow) =>
              row.remaining === null ? '—' : row.exhausted ? `${row.remaining} — épuisé` : String(row.remaining),
          },
        ]
      : []),
    {
      key: 'renouvellement',
      header: 'Renouvellement',
      sortValue: row => row.renewsAt,
      render: row => libelleRenouvellement(row.renewsAt),
    },
    {
      key: 'ajuster',
      header: 'Solde',
      render: row => {
        const lien = ajuster(row.workspaceId)
        return lien ? <a href={lien}>Ajuster le pool</a> : '—'
      },
    },
  ]

  const epuises = trierEpuises(report.exhausted)

  return (
    <>
      <h2>Comptes à solde épuisé</h2>
      <p className="subtitle">
        Ces comptes voient le frein doux : l’analyse est refusée sans qu’aucun chiffre ne leur soit montré. Le solde est
        celui du pool de leur espace.
      </p>
      {epuises.length === 0 ? (
        <EmptyState message="Aucun compte à solde épuisé." />
      ) : (
        <DataTable rows={epuises} columns={colonnesComptes(false)} rowKey={row => row.userId} maxHeight="40vh" />
      )}

      <h2 style={{ marginTop: 32 }}>Par espace</h2>
      <DataTable
        rows={trierEspaces(report.workspaces)}
        columns={colonnesEspaces}
        rowKey={row => row.workspaceId}
        maxHeight="50vh"
      />

      <h2 style={{ marginTop: 32 }}>Par utilisateur</h2>
      <DataTable
        rows={report.users}
        columns={colonnesComptes(true)}
        rowKey={row => `${row.workspaceId}:${row.userId}`}
        maxHeight="60vh"
      />
    </>
  )
}
