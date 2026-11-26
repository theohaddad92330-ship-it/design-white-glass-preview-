import type { ConnectedTool } from '@bellum/contracts'
import { PreConsent } from './PreConsent'
import { Box, Button, Text } from '@bellum/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Trash2, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { TOAST_PROBLEM_MS } from '@/lib/toast-duration'
import { isConnectorCardConnected, type ConnectorId, type ConnectorState } from '../../lib/connectors'
import { CardShell, ConnectedBadge, ReconnectBadge } from './CardShell'
import { ConnectorBenefits } from './ConnectorBenefits'
import { hasConnectorDetails } from './connector-benefits'

/** L'état qu'expose chaque module OAuth (`GET /<provider>/status`). */
type ProviderStatus = {
  configured: boolean
  connected: boolean
  accountLabel?: string | null
}

/**
 * La déconnexion réussit TOUJOURS côté Bellum (la ligne locale est effacée) ;
 * `warning` dit — quand le fournisseur le rend — qu'il n'a pas confirmé la
 * révocation server-side (Salesforce, Pipedrive : commit d97ba6b1). Un
 * fournisseur qui rend encore un 204 vide (Attio et les autres, à ce jour)
 * résout `disconnect()` en `undefined` : voir la garde `result?.warning`
 * ci-dessous, qui ne prête jamais un avertissement à un 204.
 */
type ProviderApi = {
  connectUrl: () => Promise<{ url: string }>
  disconnect: () => Promise<{ warning: string | null } | void>
}

/**
 * Carte de connexion OAuth générique — HubSpot, Salesforce, Pipedrive, Attio,
 * Notion, Microsoft 365, Google Workspace ne varient que par leur nom, leur
 * icône et le module appelé.
 *
 * Elle ne décide PLUS de sa propre visibilité. C'est l'écran qui masque, depuis
 * le registre serveur, ce que cette instance n'offre pas ; laisser les deux
 * juger produisait exactement le désaccord qu'on vient de supprimer — le centre
 * affichait « Non branché » là où les réglages ne montraient rien.
 */
export function OAuthProviderCard({
  icon,
  connector,
  name,
  description,
  api,
  statusKey,
  status,
  isLoading,
  accountFallback,
  state,
  children,
  tools,
  connectOptions,
}: {
  icon: LucideIcon
  /** #1614 — l'outil dont la carte parle, pour aller chercher SON logo. */
  connector?: ConnectorId
  name: string
  description: string
  api: ProviderApi
  statusKey: readonly unknown[]
  status: ProviderStatus | undefined
  isLoading: boolean
  accountFallback: string
  /**
   * L'état vu par le REGISTRE serveur, qui seul sait qu'un jeton a expiré : le
   * `/status` du module rend `connected: true` jusqu'au premier appel qui
   * échoue. Sans cette prop, l'écran comptait « 1 à reconnecter » en en-tête
   * sans qu'aucune carte ne le montre — un problème annoncé et introuvable.
   */
  state?: ConnectorState
  /** Contenu additionnel affiché sous l'entête quand le compte est connecté. */
  children?: ReactNode
  /** Les lignes de registre du connecteur — ce que le pré-consentement énumère. */
  tools?: readonly ConnectedTool[]
  /**
   * #2078.22 — ce qui se choisit AVANT de connecter (le niveau d'accès), montré
   * au-dessus du bouton et du pré-consentement. `api.connectUrl` lit le choix.
   */
  connectOptions?: ReactNode
}) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations' })
  const { t: tCommon } = useTranslation('common')
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<'connect' | 'disconnect' | null>(null)
  /**
   * L'écran de PRÉ-CONSENTEMENT (PDF 7 §6.1) — « il vient AVANT la redirection,
   * pas après ».
   *
   * La redirection était immédiate : `connectUrl()` puis `window.location.href`.
   * L'utilisateur arrivait donc sur l'écran de consentement du fournisseur, qui
   * énumère des portées techniques (« Consulter, modifier et supprimer… »), sans
   * avoir jamais lu ce que BellumAI, lui, compte en faire — ni ce qu'il ne fera
   * jamais. C'est le moment où les gens refusent, et ils ont raison de refuser
   * une demande qu'ils ne comprennent pas.
   *
   * Ce qui s'affiche vient des CAPACITÉS déclarées, pas d'un texte marketing :
   * il ne peut donc pas mentir plus longtemps que le code.
   */
  const [pending, setPending] = useState(false)

  const connect = async () => {
    setBusy('connect')
    try {
      const { url } = await api.connectUrl()
      window.location.href = url
    } catch {
      toast.error(t('providerConnectError', { name }))
      setBusy(null)
    }
  }

  const disconnect = async () => {
    setBusy('disconnect')
    try {
      const result = await api.disconnect()
      // ⚠️ P13 — la réponse était jetée : deux fournisseurs (Salesforce,
      // Pipedrive) disent désormais si le fournisseur a confirmé la
      // révocation server-side, sans que l'écran ne le montre jamais. Ce
      // n'est PAS une erreur — la déconnexion a RÉUSSI côté Bellum, la ligne
      // locale est effacée — donc jamais `toast.error` : ça ferait croire à
      // un échec et pousserait à recommencer une action déjà faite. Un
      // fournisseur qui rend encore un 204 vide (`result` est `undefined`,
      // voir `apiFetch`) ne se voit jamais prêter un avertissement inventé.
      if (result?.warning) {
        toast.warning(result.warning, { duration: TOAST_PROBLEM_MS })
      } else {
        toast.success(t('providerDisconnectedToast', { name }))
      }
      queryClient.invalidateQueries({ queryKey: statusKey })
      // Le registre porte l'état affiché par l'écran : sans cette invalidation,
      // la carte redeviendrait « à brancher » alors que le bandeau de tête
      // continuerait de compter l'outil comme branché.
      queryClient.invalidateQueries({ queryKey: ['tool-registry'] })
    } catch {
      toast.error(t('providerDisconnectError'))
    } finally {
      setBusy(null)
    }
  }

  const connected = isConnectorCardConnected(state, status?.connected)
  // Un jeton mort n'est pas une connexion : le geste attendu est de REFAIRE le
  // consentement, pas de débrancher puis rebrancher.
  const expired = connected && state === 'action_required'

  return (
    <CardShell
      icon={icon}
      connector={connector}
      name={name}
      description={description}
      badge={expired ? <ReconnectBadge /> : connected ? <ConnectedBadge /> : undefined}
      /* #1442 / #1447 — le détail est DÉPLIÉ sur un connecteur branché, REPLIÉ
         sinon. Un outil branché soulève « est-ce que ça marche ? », et la
         réponse est là ; un outil à brancher n'en soulève qu'une, « qu'est-ce
         que ça m'apporte ? », et elle tient dans le repli. */
      expanded={connected}
      /* #1443 — le BÉNÉFICE, tiré des actions que le registre autorise sur CET
         outil, rangé en trois niveaux (#1444). Avant de brancher, c'est la
         raison de le faire ; après, c'est ce à quoi on a droit.
         ⚠️ Pas pendant le pré-consentement, qui répond déjà à la même question
         juste en dessous, dans son propre vocabulaire — « rien n'apparaît deux
         fois sous la même forme avec le même contenu » (loi 4 du tome 7). */
      details={pending || !hasConnectorDetails(tools) ? undefined : <ConnectorBenefits tools={tools} />}
    >
      {isLoading ? null : connected ? (
        <Box className="space-y-3">
          <Box display="flex" className="items-center gap-2">
            <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="min-w-0 truncate">
              {status?.accountLabel ?? accountFallback}
            </Text>
            {expired ? (
              <Button
                variant="default"
                size="sm"
                isLoading={busy === 'connect'}
                onClick={connect}
                className="ml-auto shrink-0"
              >
                {t('providerReconnectButton')}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              isLoading={busy === 'disconnect'}
              onClick={disconnect}
              className={expired ? 'shrink-0' : 'ml-auto shrink-0'}
            >
              {tCommon('actions.disconnect')}
            </Button>
          </Box>
          {expired ? (
            <Text size="xs" className="text-[var(--danger-soft-text)]">
              {t('providerExpiredHint')}
            </Text>
          ) : null}
          {/* #4431.2 — c'est À LA RECONNEXION qu'on a besoin du domaine de l'organisation (et du sandbox) : le champ
              reste visible et modifiable sur une autorisation expirée, sans rien déclencher avant « Reconnecter ». */}
          {expired ? connectOptions : null}
          {children}
        </Box>
      ) : (
        <Box className="space-y-2">
          {connectOptions}
          {pending ? (
            <PreConsent
              tools={tools}
              name={name}
              onCancel={() => setPending(false)}
              onConfirm={() => {
                setPending(false)
                void connect()
              }}
              connecting={busy === 'connect'}
            />
          ) : (
            <Box display="flex" className="justify-end">
              <Button
                variant="default"
                size="sm"
                isLoading={busy === 'connect'}
                onClick={() => (tools && tools.length > 0 ? setPending(true) : void connect())}
              >
                {t('providerConnectButton', { name })}
              </Button>
            </Box>
          )}
        </Box>
      )}
    </CardShell>
  )
}
