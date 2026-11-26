import { Box, Button, Text, Textarea } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useMailboxSignature, useSaveMailboxSignature } from '../api'

/** Le serveur borne à 2 000 caractères (`updateSignatureSchema`). Le dire ici
 *  évite d'apprendre la règle par un 422 après avoir tout tapé. */
const MAX_LENGTH = 2000

/**
 * La signature apposée aux brouillons — saisie, et surtout RELUE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN RÉPARE
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET/PUT /mailbox/signature` existaient. Aucun appelant. Et `MailboxPage`
 * passait `signature={null}` EN DUR à la boîte de dialogue de brouillon : la
 * phrase « aucune signature ne sera ajoutée » s'affichait pour TOUT LE MONDE,
 * y compris pour qui en avait une chez son fournisseur de messagerie — l'envoi,
 * lui, l'apposait quand même. L'écran contredisait le serveur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX PROPRIÉTÉS
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **La résolution reste au serveur.** Il choisit entre ce qui est saisi ici
 *    et ce que la messagerie connectée stocke ; refaire ce choix dans le client
 *    donnerait deux vérités sur une même signature. On affiche ce qu'il rend.
 * 2. **« Pas encore lu » n'est pas « aucune ».** Tant que la lecture court, la
 *    carte n'affirme rien — c'est exactement l'erreur que le `null` en dur
 *    faisait, en permanence.
 *
 * ⚠️ Une seule porte d'écriture pour ce réglage (GA-26) : `mailboxApi.setSignature`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX FORMES, UN SEUL ÉDITEUR (#1397.2)
 * ─────────────────────────────────────────────────────────────────────────────
 * `variant="editor"` — la saisie, dans Réglages › Profil. C'est un réglage, et
 * les réglages vivent aux Réglages.
 *
 * `variant="status"` — une ligne et un lien, sur `/mailbox`. L'écran de triage
 * doit pouvoir dire « tes brouillons partiront sans signature », parce que c'est
 * lui qui les prépare ; il n'a pas à porter la zone de saisie, qui occupait le
 * haut de la page avant la moindre ligne de conversation.
 *
 * GA-26 n'est pas entamée : l'écriture garde UNE porte, et la SAISIE n'existe
 * qu'à un seul endroit. Le statut ne fait que lire.
 */
export function MailboxSignatureCard({ variant = 'editor' }: { variant?: 'editor' | 'status' } = {}) {
  const { t } = useTranslation('mailbox')
  const { data, isLoading } = useMailboxSignature()
  const save = useSaveMailboxSignature()
  const resolved = data?.signature ?? null
  const [draft, setDraft] = useState('')
  const [touched, setTouched] = useState(false)

  // La valeur du serveur reprend la main tant que personne n'a tapé : sans ça,
  // le champ resterait vide après le premier chargement.
  useEffect(() => {
    if (!touched) setDraft(resolved ?? '')
  }, [resolved, touched])

  if (variant === 'status') {
    return (
      <Box className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* « Pas encore lu » n'est pas « aucune » : tant que la lecture court,
            la ligne n'affirme rien. C'est l'erreur que le `null` en dur faisait
            en permanence, et elle ne doit pas revenir par la porte du résumé. */}
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {isLoading ? t('signature.checking') : resolved ? t('signature.detected') : t('signature.toConfigure')}
        </Text>
        <Link
          to="/settings/profile/identity"
          className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-[var(--bellum-text-accent)] hover:underline"
        >
          {t('signature.manage')}
          <ArrowRight className="size-3 shrink-0" aria-hidden />
        </Link>
      </Box>
    )
  }

  return (
    <Box className="flex flex-col gap-2 rounded-lg border border-[var(--bellum-border)] p-4">
      <Text element="h2" size="sm" weight="medium">
        {t('signature.title')}
      </Text>
      {isLoading ? null : (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {resolved ? t('signature.willBeAdded') : t('signature.none')}
        </Text>
      )}
      <Textarea
        aria-label={t('signature.label')}
        value={draft}
        rows={4}
        maxLength={MAX_LENGTH}
        placeholder={t('signature.placeholder')}
        onChange={event => {
          setTouched(true)
          setDraft(event.target.value)
        }}
      />
      <Box className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={save.isPending}
          onClick={() =>
            save.mutate(draft, {
              onSuccess: () => {
                setTouched(false)
                toast.success(t('signature.saved'))
              },
              onError: () => toast.error(t('signature.failed')),
            })
          }
        >
          {t('signature.save')}
        </Button>
        {/* Ce que fait un champ vidé, annoncé AVANT le clic : il ne « supprime »
            pas la signature, il rend la main à celle de la messagerie. */}
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('signature.emptyMeaning')}
        </Text>
      </Box>
    </Box>
  )
}
