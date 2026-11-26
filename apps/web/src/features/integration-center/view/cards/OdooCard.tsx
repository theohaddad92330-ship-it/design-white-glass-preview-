import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Text,
} from '@bellum/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { odooApi } from '@/features/odoo/api'
import { ODOO_STATUS_KEY, useOdooStatus } from '@/features/odoo/hooks/useOdooStatus'
import { TOAST_PROBLEM_MS } from '@/lib/toast-duration'
import { CardShell, ConnectedBadge } from './CardShell'
import { ConnectorBenefits } from './ConnectorBenefits'
import { CrmReadScope } from './CrmReadScope'
import { hasConnectorDetails } from './connector-benefits'
import { ConnectorDiagnostics } from './ConnectorDiagnostics'
import { CONNECTOR_ICONS } from './connector-icons'
import type { ConnectorCardProps } from './connector-card-map'
import { ConnectorSyncStatus } from '../ConnectorSyncStatus'

/**
 * La carte Odoo — la seule du centre d'intégrations qui porte un FORMULAIRE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE N'UTILISE PAS `OAuthProviderCard`
 * ─────────────────────────────────────────────────────────────────────────
 * Cette carte générique sert HubSpot, Salesforce, Pipedrive, Attio, Notion,
 * Microsoft et Google : tous rendent une URL de consentement, et son bouton
 * « Connecter » y redirige le navigateur. Odoo n'a pas de consentement — il
 * s'authentifie par base + identifiant + clé d'API, et son instance peut vivre
 * à n'importe quelle adresse.
 *
 * Faire entrer un formulaire de quatre champs dans la carte générique
 * l'aurait forcée à porter une branche « ou alors, un formulaire » sur sept
 * connecteurs qui n'en veulent pas. Elle garde donc sa forme (`CardShell`, le
 * badge, les diagnostics) et sa propre saisie.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE L'ÉCRAN DIT, ET CE QU'IL NE DIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ On demande une **clé d'API**, pas un mot de passe. Odoo accepte les deux
 * au même endroit, ce qui est exactement le piège : une clé se révoque depuis
 * le profil sans changer le mot de passe du compte, et elle n'ouvre pas
 * l'interface. Le libellé et l'aide le disent ; le champ est en `password`
 * pour qu'elle ne reste pas lisible à l'écran d'un open space.
 *
 * ⚠️ Le refus d'identifiants n'est PAS une panne : il s'affiche sous le
 * formulaire, avec la raison rendue par l'instance, et la saisie SURVIT. Vider
 * les champs sur un échec ferait retaper quatre valeurs pour une faute de
 * frappe sur une seule.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA SAISIE A QUITTÉ LA GRILLE — #1446
 * ─────────────────────────────────────────────────────────────────────────
 * *« Ne pas afficher directement quatre champs techniques dans la grille
 * principale. »* Quatre libellés, quatre champs et une aide au milieu de quinze
 * cartes de trois lignes : cette carte faisait à elle seule la hauteur de trois
 * voisines, et le catalogue entier se lisait de travers à cause d'un seul
 * connecteur.
 *
 * La carte prend donc la forme des autres — icône, bénéfices, état, un bouton
 * « Connecter Odoo » — et la saisie vit dans une boîte de dialogue. Les trois
 * décisions ci-dessus la suivent telles quelles : c'est une clé et pas un mot de
 * passe, le champ est masqué, et un refus ne vide rien.
 *
 * ⚠️ Pas de bouton « tester » en plus du bouton « connecter » : la soumission
 * EST le test — l'instance accepte ou refuse, et le refus s'affiche avec sa
 * raison. Deux boutons dont l'un teste ce que l'autre fait déjà font douter des
 * deux.
 */
export function OdooCard({ tools }: ConnectorCardProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations' })
  // « Connecter » / « Déconnecter » vivent dans `common:actions`, comme sur les
  // cartes OAuth : ce sont les libellés de l'action, pas du connecteur. Sous le
  // `keyPrefix: 'integrations'`, `t('disconnect')` cherchait
  // `settings:integrations.disconnect` — une clé qui n'existe pas, et i18next
  // rend alors la clé BRUTE : l'écran affichait « integrations.disconnect ».
  const { t: tCommon } = useTranslation('common')
  const queryClient = useQueryClient()
  const { data, isLoading } = useOdooStatus()

  const [baseUrl, setBaseUrl] = useState('')
  const [db, setDb] = useState('')
  const [login, setLogin] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [pending, setPending] = useState(false)
  /** La raison du DERNIER refus. `null` tant qu'on n'a rien tenté. */
  const [refusal, setRefusal] = useState<string | null>(null)
  /** La boîte de saisie (#1446) — fermée tant qu'on n'a pas demandé à brancher. */
  const [formOpen, setFormOpen] = useState(false)

  const connected = data?.connected === true

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setPending(true)
    setRefusal(null)
    try {
      const result = await odooApi.connect({ baseUrl: baseUrl.trim(), db: db.trim(), login: login.trim(), apiKey })
      if (result.ok) {
        toast.success(t('odooConnected'))
        // La clé quitte la mémoire de l'écran dès qu'elle est enregistrée : la
        // garder dans un état React la laisserait dans un instantané de débogage.
        setApiKey('')
        setFormOpen(false)
        await queryClient.invalidateQueries({ queryKey: ODOO_STATUS_KEY })
        return
      }
      setRefusal(result.reason)
    } catch (error) {
      setRefusal(error instanceof Error ? error.message : t('odooConnectFailed'))
    } finally {
      setPending(false)
    }
  }

  const disconnect = async () => {
    setPending(true)
    try {
      const result = await odooApi.disconnect()
      // On répète l'avertissement du serveur plutôt que d'annoncer une
      // révocation qui n'a pas eu lieu.
      toast.success(result.warning, { duration: TOAST_PROBLEM_MS })
      await queryClient.invalidateQueries({ queryKey: ODOO_STATUS_KEY })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('odooDisconnectFailed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <CardShell
      // #1447 — cette carte et une autre de la MÊME section portaient l'icône
      // `Boxes`. Deux outils rigoureusement identiques à l'œil dans une grille
      // qu'on parcourt du regard : l'icône ne servait plus à rien. Le choix vit
      // maintenant dans UNE table, et une garde tient son unicité.
      icon={CONNECTOR_ICONS.odoo}
      connector="odoo"
      name="Odoo"
      description={t('odooDescription')}
      badge={connected ? <ConnectedBadge /> : undefined}
      /* #1442 / #1447 — déplié une fois branché, replié sinon. Cette carte était
         la plus haute du catalogue : quatre champs ET les bénéfices ET les
         diagnostics, tout ouvert, sur un connecteur que personne n'avait
         demandé. */
      expanded={connected}
      details={
        !hasConnectorDetails(tools) ? undefined : (
          <>
            {/* #1443 — ce que le registre autorise sur cet outil, en clair, rangé
              en trois niveaux (#1444). */}
            <ConnectorBenefits tools={tools} />
            {/* Les diagnostics du registre serveur — dernière preuve, dernière
              erreur, portée manquante. Rendus ici plutôt qu'importés du fichier
              des cartes OAuth : celui-ci n'exporte QUE des composants, c'est la
              condition du rechargement à chaud de Vite. */}
            {(tools ?? []).map(tool => (
              <ConnectorDiagnostics key={tool.provider} tool={tool} hideLastSync />
            ))}
          </>
        )
      }
    >
      {isLoading ? null : connected ? (
        <Box display="flex" className="flex-col gap-2">
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {/* La base ET l'adresse : deux instances peuvent porter la même
                base, et deux bases la même adresse. L'une sans l'autre ne
                suffit pas à savoir sur quoi on est branché. */}
            {data?.accountLabel ?? t('odooAccountFallback')}
            {data?.instanceUrl ? ` · ${data.instanceUrl}` : ''}
          </Text>
          <Button variant="outline" size="sm" onClick={disconnect} disabled={pending} className="gap-1.5 self-start">
            <Trash2 className="size-4" />
            {tCommon('actions.disconnect')}
          </Button>
          {/* #3918.3 / #4189 — ce qui est lu, et ce qui ne devient jamais un signal. Les ventes servent aussi les missions. */}
          <CrmReadScope connector="odoo" connected />
          <ConnectorSyncStatus provider="odoo" name="Odoo" tools={tools} />
        </Box>
      ) : (
        /* La carte a la forme des autres : un bouton, pas un formulaire (#1446). */
        <Box display="flex" className="justify-end">
          <Button size="sm" onClick={() => setFormOpen(true)}>
            {t('odooConnectButton')}
          </Button>
        </Box>
      )}

      {/* LA SAISIE, hors de la grille. Le contenu est celui d'avant, aux mêmes
          règles : clé d'API et non mot de passe, champ masqué, refus qui ne vide
          rien — seul son EMPLACEMENT change. */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent closeLabel={tCommon('actions.close')} className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('odooDialogTitle')}</DialogTitle>
            <DialogDescription>{t('odooDialogDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Box display="flex" className="flex-col gap-1">
              <Label htmlFor="odoo-url" className="text-xs">
                {t('odooUrlLabel')}
              </Label>
              <Input
                id="odoo-url"
                className="h-9"
                type="url"
                required
                placeholder="https://exemple.odoo.com"
                value={baseUrl}
                onChange={event => setBaseUrl(event.target.value)}
              />
              <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                {t('odooUrlHint')}
              </Text>
            </Box>
            <Box display="flex" className="flex-col gap-1">
              <Label htmlFor="odoo-db" className="text-xs">
                {t('odooDbLabel')}
              </Label>
              <Input id="odoo-db" className="h-9" required value={db} onChange={event => setDb(event.target.value)} />
              <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                {t('odooDbHint')}
              </Text>
            </Box>
            <Box display="flex" className="flex-col gap-1">
              <Label htmlFor="odoo-login" className="text-xs">
                {t('odooLoginLabel')}
              </Label>
              <Input
                id="odoo-login"
                className="h-9"
                required
                autoComplete="username"
                value={login}
                onChange={event => setLogin(event.target.value)}
              />
            </Box>
            <Box display="flex" className="flex-col gap-1">
              <Label htmlFor="odoo-key" className="text-xs">
                {t('odooKeyLabel')}
              </Label>
              <Input
                id="odoo-key"
                className="h-9"
                type="password"
                required
                autoComplete="off"
                value={apiKey}
                onChange={event => setApiKey(event.target.value)}
              />
              <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                {t('odooKeyHint')}
              </Text>
              {/* « Où trouver ma clé d'API ? » (#1446) — la réponse, pas un lien
                  vers une documentation d'éditeur qui peut déménager. */}
              <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                {t('odooKeyWhere')}
              </Text>
            </Box>

            {refusal ? (
              /* Un refus d'identifiants n'est pas une panne : il s'affiche ICI,
                 sous les champs, et la saisie survit. */
              <Text element="p" size="xs" className="text-[var(--danger-soft-text)]">
                {t('odooRefused', { reason: refusal })}
              </Text>
            ) : null}

            <Box display="flex" className="justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
                {tCommon('actions.cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {tCommon('actions.connect')}
              </Button>
            </Box>
          </form>
        </DialogContent>
      </Dialog>
    </CardShell>
  )
}
