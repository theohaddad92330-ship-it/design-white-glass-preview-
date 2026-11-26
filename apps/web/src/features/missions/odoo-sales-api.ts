import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

/**
 * #2561/#2562 — les VENTES de l'outil de gestion branché (Odoo) dans
 * /missions, et leur reprise en missions. Miroir de `OdooSalesResponse` /
 * `OdooReprisePreview` / `OdooRepriseResult` côté API
 * (`mission-odoo-sales.service.ts`) et de `OdooSaleRow`
 * (`odoo-sales-reprise.ts`).
 */

type OdooSaleLine = { label: string; quantity: number | null; unitPrice: number | null; subtotal: number | null }

export type OdooSaleRow = {
  saleId: number
  reference: string
  clientName: string | null
  clientRef: string | null
  orderDate: string | null
  commitmentDate: string | null
  invoiceStatus: string | null
  amountUntaxed: number | null
  currency: string | null
  lines: OdooSaleLine[]
  account: { id: string; name: string } | null
  accountIssue: 'not_found' | 'ambiguous' | null
  mission: { id: string; label: string; by: 'link' | 'reference' | 'label' | 'dates' } | null
  draft: { label: string; startedOn: string | null; dailyRate: number | null } | null
}

type OdooSalesUnavailable =
  | { status: 'not_connected' }
  | { status: 'unknown'; message: string }
  | { status: 'error'; message: string }

export type OdooSalesResponse = OdooSalesUnavailable | { status: 'ok'; demo: boolean; sales: OdooSaleRow[] }

export type OdooReprisePreview =
  | OdooSalesUnavailable
  | {
      status: 'ok'
      fingerprint: string
      items: {
        saleId: number
        reference: string
        accountId: string
        accountName: string
        label: string
        startedOn: string | null
        dailyRate: number | null
      }[]
      skipped: { saleId: number; reference: string | null; reason: 'already_mission' | 'not_found' | 'ambiguous' }[]
    }

type OdooRepriseResult =
  | OdooSalesUnavailable
  | {
      status: 'ok'
      created: { saleId: number; missionId: string }[]
      failed: { saleId: number; reason: 'already_mission' | 'refused' }[]
    }

/** Sous `['missions', …]` : toute création de mission la rafraîchit aussi. */
const odooSalesKey = ['missions', 'odoo-sales'] as const

export function useOdooSales() {
  return useQuery({
    queryKey: odooSalesKey,
    queryFn: () => apiFetch<OdooSalesResponse>({ path: '/delivery/odoo-sales' }),
    // Une lecture chez le client à chaque focus serait une sonde : on relit à la demande.
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  })
}

export function useOdooSalesPreview() {
  return useMutation<OdooReprisePreview, Error, number[]>({
    mutationFn: saleIds =>
      apiFetch<OdooReprisePreview, { saleIds: number[] }>({
        path: '/delivery/odoo-sales/preview',
        method: 'POST',
        body: { saleIds },
      }),
  })
}

export function useOdooSalesImport() {
  const qc = useQueryClient()
  return useMutation<OdooRepriseResult, Error, { saleIds: number[]; fingerprint: string }>({
    mutationFn: body =>
      apiFetch<OdooRepriseResult, { saleIds: number[]; fingerprint: string }>({
        path: '/delivery/odoo-sales/import',
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['missions'] })
    },
  })
}
