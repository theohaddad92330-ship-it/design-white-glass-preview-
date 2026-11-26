import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Download, Eye, Upload, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { Account } from '@bellum/contracts'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { crmApi } from '@/features/crm/api'
import { domainFromWebsite } from '@/features/crm/hooks/useCrmPresence'
import { useCrmStatus } from '@/features/crm/hooks/useCrmStatus'
import { useDataExit, workspaceRuleRefusalText } from '@/lib/data-exit'
import { useBrand } from '@/features/brand/brand-context'
import { downloadDocument } from '../api'
import { buildDeliverableDescriptors, type DeliverableFormatKey } from '../deliverableDescriptors'
import { DeliverableDescriptorList } from './DeliverableDescriptorList'

type Format = { key: DeliverableFormatKey; path: string; gated: boolean }

/**
 * Les livrables d'un dossier : Word, PDF, présentation, classeur de contacts.
 *
 * Les trois premiers sortent du MÊME modèle de contenu côté serveur. C'est ce
 * qui permet de les proposer côte à côte sans avoir à prévenir que l'un ne dit
 * pas la même chose que l'autre.
 *
 * #2125.22 — TOUJOURS PRÉVISUALISER AVANT TÉLÉCHARGEMENT OU PARTAGE.
 * Cliquer un format n'envoie plus rien : ça ouvre la fiche du livrable — ce
 * qu'il contient, sa version, son périmètre, sa source, sa fraîcheur, ce
 * qu'il exclut, qui peut le voir, son coût, son état (#2125.12-21) — et c'est
 * SEULEMENT depuis cette fiche qu'on télécharge. Aucun clic ne fait sortir un
 * fichier sans être passé par cet écran.
 */
export function AccountDeliverables({ account }: { account: Account }) {
  const { t } = useTranslation('accounts')
  // #2081.14 — livrable commercial, décision Louis 19/09 : le dossier (docx,
  // pdf) et, depuis « Libérer le deck », la présentation (pptx) redeviennent
  // permis à tous — ce ne sont pas des exports de données. Le classeur de
  // contacts (xlsx) reste une SORTIE de données : sous la règle d'espace
  // « administrateurs seulement », son bouton reste masqué (l'API refuse
  // aussi cette route, `@DataExit()`).
  const dataExit = useDataExit()
  const brand = useBrand()
  const crmStatus = useCrmStatus()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewKey, setPreviewKey] = useState<DeliverableFormatKey | null>(null)
  const [crmBusy, setCrmBusy] = useState(false)

  const allFormats: Format[] = [
    { key: 'docx', path: `/documents/accounts/${account.id}/dossier.docx`, gated: false },
    { key: 'pdf', path: `/documents/accounts/${account.id}/dossier.pdf`, gated: false },
    { key: 'pptx', path: `/documents/accounts/${account.id}/deck.pptx`, gated: false },
    { key: 'xlsx', path: `/documents/accounts/${account.id}/contacts.xlsx`, gated: true },
  ]
  const formats = allFormats.filter(format => !format.gated || dataExit.allowed)
  const previewFormat = formats.find(format => format.key === previewKey) ?? null

  // #2125.15 — le périmètre couvert : n'interroge les liens de groupe QUE
  // quand une fiche est ouverte (même geste que « Détacher ce dossier »,
  // AccountDetailMoreActionsMenu.tsx) — la liste de formats seule n'en a pas
  // besoin.
  const links = useQuery({
    queryKey: accountKeys.links(account.id),
    queryFn: () => accountsApi.accountLinks(account.id),
    enabled: previewFormat !== null,
  })
  const hasGroupLinks = Boolean(links.data?.mergedInto) || (links.data?.linked.length ?? 0) > 0

  // #2125.10 — SUPPORTER L'EXPORT CRM SI CONNECTEUR RÉEL, jamais avant.
  // `crmStatus.data?.connected` est un no-op STRICT sans connecteur : aucun
  // appel réseau d'export ne part, et le bouton n'existe même pas — jamais un
  // repli deviné ni une case grisée qui nommerait un fournisseur. La même
  // règle d'espace que le classeur de contacts (`data:export`) tient l'écriture
  // — POST /crm/companies porte `@RequirePermission('data:export')`.
  const canExportToCrm = Boolean(crmStatus.data?.connected) && dataExit.allowed

  const exportToCrm = async () => {
    if (crmBusy) return
    setCrmBusy(true)
    try {
      const result = await crmApi.createCompany({
        name: account.company_name,
        domain: domainFromWebsite(account.website) ?? undefined,
        industry: account.sector ?? undefined,
      })
      toast.success(t(result.created ? 'deliverables.crm.exported' : 'deliverables.crm.alreadyExists'))
    } catch (cause) {
      toast.error(workspaceRuleRefusalText(cause) ?? t('deliverables.crm.error'))
    } finally {
      setCrmBusy(false)
    }
  }

  const run = async (format: Format) => {
    setBusy(format.key)
    setError(null)
    try {
      await downloadDocument(format.path, `dossier.${format.key}`)
    } catch (cause) {
      // Un échec de téléchargement se DIT. Un bouton qui ne fait rien laisse
      // croire que le fichier est parti.
      // #2081.14 — un refus de la règle d'espace se dit par sa phrase.
      setError(workspaceRuleRefusalText(cause) ?? (cause instanceof Error ? cause.message : String(cause)))
    } finally {
      setBusy(null)
    }
  }

  const closePreview = () => {
    setPreviewKey(null)
    setError(null)
  }

  /**
   * #2125.5 — PARTAGER DANS L'ÉQUIPE, distinct du bouton « Partager » du hero
   * (`AccountShareDialog`, lien PUBLIC vers un instantané figé — LinkedIn,
   * copie, partage natif). Ici, aucun lien public n'est créé : le lien copié
   * est le lien INTERNE du dossier, que seule une session du même espace peut
   * ouvrir — chaque destinataire y voit ce que SES propres droits autorisent
   * (permissions, contacts privés…), jamais un instantané figé au moment du
   * partage. #2125.23/.24 (jamais public par défaut / vérifier l'appartenance
   * avant partage) ne s'appliquent donc pas ici : rien n'est rendu public, et
   * l'appartenance est déjà celle de la session qui ouvrira le lien.
   */
  const shareInTeam = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/accounts/${account.id}`)
      toast.success(t('deliverables.share.copied'))
    } catch {
      toast.error(t('deliverables.share.error'))
    }
  }

  return (
    <Box className="space-y-2 rounded-xl border border-[var(--bellum-border)] p-4">
      <Text weight="medium" size="sm">
        {t('deliverables.title')}
      </Text>
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {t('deliverables.subtitle')}
      </Text>
      <Box className="flex flex-wrap gap-2 pt-1">
        {formats.map(format => (
          <Button key={format.key} size="sm" variant="outline" icon={Eye} onClick={() => setPreviewKey(format.key)}>
            {t(`deliverables.format.${format.key}`)}
          </Button>
        ))}
      </Box>

      {previewFormat && (
        <Dialog open onOpenChange={open => !open && closePreview()}>
          <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-lg border-[var(--border-subtle)]">
            <DialogHeader>
              <DialogTitle className="text-[var(--text-primary)]">
                {t(`deliverables.format.${previewFormat.key}`)}
              </DialogTitle>
              <DialogDescription className="text-[var(--bellum-text-secondary)]">
                {t('deliverables.previewDescription')}
              </DialogDescription>
            </DialogHeader>

            <DeliverableDescriptorList
              account={account}
              entries={buildDeliverableDescriptors(previewFormat.key, {
                companyName: account.company_name,
                brandName: brand.name,
                status: account.status,
                gated: previewFormat.gated,
                hasGroupLinks,
              })}
            />

            {error ? (
              <Text size="xs" className="text-[var(--danger-soft-text)]">
                {error}
              </Text>
            ) : null}

            <DialogFooter>
              {canExportToCrm && (
                <Button size="sm" variant="outline" icon={Upload} disabled={crmBusy} onClick={() => void exportToCrm()}>
                  {t('deliverables.crm.exportButton')}
                </Button>
              )}
              <Button size="sm" variant="outline" icon={Users} onClick={() => void shareInTeam()}>
                {t('deliverables.share.team')}
              </Button>
              <Button
                size="sm"
                variant="violet"
                icon={busy === previewFormat.key ? undefined : Download}
                disabled={busy !== null}
                onClick={() => void run(previewFormat)}
              >
                {busy === previewFormat.key ? t('deliverables.preparing') : t('common:actions.download')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Box>
  )
}
