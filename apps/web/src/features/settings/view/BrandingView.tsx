import { Badge, Box, Button, Input, Text, BrandMark as UiBrandMark } from '@bellum/ui'
import { SettingsBlock, SettingsFields, SettingsFormActions, SettingsNote } from '../components/SettingsBlocks'
import { DEFAULT_BRAND_ACCENT, DEFAULT_BRAND_NAME, resolveScreenState } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ScreenState } from '@/components/primitives/ScreenState'
import { brandApi } from '@/features/brand/api'
import { SettingsViewHeader } from '@/features/settings/components/SettingsViewHeader'

/**
 * LA MARQUE DE L'ESPACE — marque blanche, palier P2 (décision de Louis, 01/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN REND POSSIBLE
 * ─────────────────────────────────────────────────────────────────────────
 * Les six colonnes existaient, la route `PATCH /workspaces/brand` répondait, et
 * personne ne pouvait s'en servir : c'est le défaut n°1 du dépôt — du code
 * juste, calculé, testé, que personne n'appelle. Sans cet écran, poser une
 * marque demandait un accès à la base.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS CHOIX QUI SE JUSTIFIENT
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **Un seul bouton pour les six champs.** Une marque est un ENSEMBLE : un
 *    nom posé sans son logo est un état intermédiaire que personne ne veut
 *    montrer. Six enregistrements séparés le rendraient visible six fois.
 *
 * 2. **La validation est LOCALE avant d'être serveur.** Le serveur refuse déjà
 *    un accent mal formé (contrainte SQL) et un domaine pris (409), mais son
 *    refus arrive après un aller-retour et parle en anglais de Postgres. Les
 *    règles écrites ici sont les MÊMES — un hexadécimal à six chiffres, un
 *    domaine sans schéma ni port — et c'est assumé : la garde ne peut pas être
 *    l'écran, l'écran ne peut pas être la garde.
 *
 * 3. **`isCustom` n'est pas un champ.** Il se DÉDUIT de « au moins un champ
 *    posé », côté serveur. L'offrir en interrupteur laisserait un espace se
 *    déclarer en marque blanche sans avoir rien posé — et faire disparaître le
 *    pied « propulsé par » de sa page de partage sans rien mettre à la place.
 */

/** Le même motif que la contrainte SQL de `brand_accent`. */
const ACCENT = /^#[0-9a-fA-F]{6}$/
/** Le même motif que `normalizeHost` côté API — sans schéma, sans port. */
const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Les mêmes bornes que le DTO et que les CHECK SQL (`workspaces_document_signature_len`, `…_footer_len`). */
const SIGNATURE_MAX = 600
const FOOTER_MAX = 300

type Draft = {
  brandName: string
  brandLogoUrl: string
  brandAccent: string
  customDomain: string
  brandEmailFrom: string
  documentSignature: string
  documentFooter: string
}

const EMPTY: Draft = {
  brandName: '',
  brandLogoUrl: '',
  brandAccent: '',
  customDomain: '',
  brandEmailFrom: '',
  documentSignature: '',
  documentFooter: '',
}

export function BrandingView() {
  const { t } = useTranslation('branding')
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['brand', 'settings'],
    queryFn: () => brandApi.brand(),
    staleTime: 60_000,
  })

  // Théo D settings-espace.N5 — la signature proposée et le pied de document : lus à part (route authentifiée, jamais
  // dans la marque publique) puis posés dans le MÊME brouillon, pour qu'un « Enregistrer » ne les efface pas.
  const documents = useQuery({
    queryKey: ['brand', 'documents'],
    queryFn: () => brandApi.documentIdentity(),
    staleTime: 60_000,
  })

  /*
   * ⚠️ Le brouillon part de ce que l'espace a POSÉ, pas de la marque résolue.
   *
   * `brand()` rend `name: 'Bellum'` quand rien n'est posé — recopier ça dans le
   * champ ferait qu'un simple « Enregistrer » ÉCRIRAIT notre nom comme le nom
   * du client, et l'espace basculerait en `isCustom` sans que personne ne l'ait
   * demandé. On ne pré-remplit donc que ce qui distingue la marque du repli.
   */
  const current: Draft =
    draft ??
    (data
      ? {
          brandName: data.isCustom ? data.name : '',
          brandLogoUrl: data.logoUrl ?? '',
          brandAccent: data.accent === DEFAULT_BRAND_ACCENT ? '' : data.accent,
          customDomain: '',
          brandEmailFrom: '',
          documentSignature: documents.data?.signature ?? '',
          documentFooter: documents.data?.footer ?? '',
        }
      : EMPTY)

  const set = (key: keyof Draft) => (value: string) => setDraft({ ...current, [key]: value })

  const errors = {
    brandLogoUrl:
      current.brandLogoUrl && !/^https:\/\/\S+$/.test(current.brandLogoUrl) ? t('identity.logoInvalid') : '',
    brandAccent: current.brandAccent && !ACCENT.test(current.brandAccent) ? t('identity.accentInvalid') : '',
    customDomain: current.customDomain && !DOMAIN.test(current.customDomain.toLowerCase()) ? t('domain.invalid') : '',
    brandEmailFrom: current.brandEmailFrom && !EMAIL.test(current.brandEmailFrom) ? t('domain.emailInvalid') : '',
    documentSignature:
      current.documentSignature.length > SIGNATURE_MAX ? t('documents.tooLong', { max: SIGNATURE_MAX }) : '',
    documentFooter: current.documentFooter.length > FOOTER_MAX ? t('documents.tooLong', { max: FOOTER_MAX }) : '',
  }
  const hasError = Object.values(errors).some(Boolean)

  const save = useMutation({
    mutationFn: (next: Draft) =>
      brandApi.update({
        // `''` veut dire « efface » côté serveur — c'est ce qui permet de
        // retirer un logo sans autre geste que vider son champ.
        brandName: next.brandName,
        brandLogoUrl: next.brandLogoUrl,
        brandAccent: next.brandAccent,
        customDomain: next.customDomain,
        brandEmailFrom: next.brandEmailFrom,
        documentSignature: next.documentSignature,
        documentFooter: next.documentFooter,
      }),
    onSuccess: result => {
      queryClient.setQueryData(['brand', 'settings'], result)
      // Les deux clés que `BrandProvider` observe : sans ça l'entête garderait
      // l'ancienne marque jusqu'au prochain rechargement complet.
      void queryClient.invalidateQueries({ queryKey: ['brand'] })
      void queryClient.invalidateQueries({ queryKey: ['brand', 'documents'] })
      setDraft(null)
      toast.success(t('saved'))
    },
    onError: (error: Error) => {
      // Trois refus qui se DISENT, plutôt qu'un « échec » unique : un domaine
      // pris (409), la salle de démonstration (403), le reste.
      if (error.message.includes('409')) return void toast.error(t('domain.taken'))
      if (error.message.includes('403')) return void toast.error(t('demoBlocked'))
      toast.error(t('saveFailed'))
    },
  })

  const screenState = resolveScreenState({
    isLoading,
    failed: isError,
    canRead: true,
    needsIntegration: false,
    integrationConnected: true,
    awaitingApproval: false,
    // Cet écran a toujours quelque chose à montrer : la marque du produit est
    // une réponse, pas un vide.
    everHadRows: true,
    visibleRows: 1,
    isNarrowed: false,
    missingParts: [],
    computedAt: null,
    freshForDays: null,
    now: new Date(),
  })

  if (screenState !== 'success') {
    return (
      <ScreenState
        state={screenState}
        title={t('title')}
        message={screenState === 'error' ? t('loadFailed') : undefined}
        action={screenState === 'error' ? { label: t('actions.retry'), onClick: () => void refetch() } : undefined}
      />
    )
  }

  // Maquette `settings-espace` (Marque & documents) : « Identité des documents » — les champs à gauche, l'aperçu à
  // droite —, puis « Domaine & expédition », puis le pied « état d'enregistrement + Enregistrer ».
  return (
    <Box className="flex flex-col gap-5">
      <SettingsViewHeader scope="space" title={t('title')} subtitle={t('subtitle')} />
      <SettingsBlock title={t('documents.title')} description={t('documents.description')} testId="brand-identity">
        <Box className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <Box className="flex min-w-0 flex-col gap-4">
            <Field
              label={t('identity.nameLabel')}
              help={t('identity.nameHelp')}
              value={current.brandName}
              placeholder={t('identity.namePlaceholder')}
              onChange={set('brandName')}
            />
            {/* Théo D settings-espace.N5 — la signature proposée et le pied de document, lus par les dossiers de compétences. */}
            <Field
              label={t('documents.signatureLabel')}
              help={t('documents.signatureHelp')}
              error={errors.documentSignature}
              value={current.documentSignature}
              placeholder={t('documents.signaturePlaceholder')}
              multiline
              onChange={set('documentSignature')}
            />
            <Field
              label={t('documents.footerLabel')}
              help={t('documents.footerHelp')}
              error={errors.documentFooter}
              value={current.documentFooter}
              placeholder={t('documents.footerPlaceholder')}
              onChange={set('documentFooter')}
            />
            <SettingsFields>
              <Field
                label={t('identity.logoLabel')}
                help={t('identity.logoHelp')}
                error={errors.brandLogoUrl}
                value={current.brandLogoUrl}
                placeholder={t('identity.logoPlaceholder')}
                onChange={set('brandLogoUrl')}
              />
              <Field
                label={t('identity.accentLabel')}
                help={t('identity.accentHelp')}
                error={errors.brandAccent}
                value={current.brandAccent}
                placeholder={DEFAULT_BRAND_ACCENT}
                onChange={set('brandAccent')}
              />
            </SettingsFields>
          </Box>

          <Box
            role="group"
            aria-label={t('preview.title')}
            className="min-w-0 rounded-overlay border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-4"
          >
            <Text
              element="p"
              size="xs"
              weight="bold"
              color="text-[var(--bellum-text-accent)]"
              className="uppercase tracking-widest"
            >
              {t('preview.title')}
            </Text>
            <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
              {t('preview.description')}
            </Text>
            <Box display="flex" className="mt-3 flex-wrap items-center justify-between gap-2">
              {/*
               * ⚠️ Le composant du PAQUET, pas `@/features/brand/BrandMark` — et
               * c'est le seul endroit du produit où c'est juste. L'aperçu doit
               * montrer le BROUILLON, pas la marque enregistrée : lire `useBrand()`
               * ici ferait un aperçu qui ne change qu'APRÈS avoir enregistré, ce
               * qui est exactement l'inverse d'un aperçu. GA-253 laisse passer
               * l'import ailleurs que dans les neuf écrans du mot-symbole.
               */}
              <UiBrandMark
                brand={{ name: current.brandName || DEFAULT_BRAND_NAME, logoUrl: current.brandLogoUrl || null }}
              />
              <Badge variant={current.brandName || current.brandLogoUrl || current.brandAccent ? 'success' : 'default'}>
                {current.brandName || current.brandLogoUrl || current.brandAccent
                  ? t('preview.custom')
                  : t('preview.default')}
              </Badge>
            </Box>
            <DocumentPreview
              brandName={current.brandName || DEFAULT_BRAND_NAME}
              signature={current.documentSignature}
              footer={current.documentFooter}
            />
          </Box>
        </Box>
        <SettingsNote className="mt-5">{t('identity.description')}</SettingsNote>
      </SettingsBlock>

      <SettingsBlock title={t('domain.title')} description={t('domain.description')} testId="brand-domain">
        <SettingsFields>
          <Field
            label={t('domain.label')}
            help={t('domain.help')}
            error={errors.customDomain}
            value={current.customDomain}
            placeholder={t('domain.placeholder')}
            onChange={set('customDomain')}
          />
          <Field
            label={t('domain.emailLabel')}
            help={t('domain.emailHelp')}
            error={errors.brandEmailFrom}
            value={current.brandEmailFrom}
            placeholder={t('domain.emailPlaceholder')}
            onChange={set('brandEmailFrom')}
          />
        </SettingsFields>
      </SettingsBlock>

      <SettingsFormActions
        dirty={draft !== null}
        status={draft !== null ? t('actions.pending') : t('actions.noPending')}
      >
        <Button
          variant="ghost"
          className="min-h-11"
          disabled={save.isPending}
          onClick={() => {
            // Une remise à zéro efface SIX champs d'un coup et change ce que
            // toute l'équipe voit : elle se confirme.
            if (!window.confirm(t('actions.resetConfirm'))) return
            save.mutate(EMPTY)
          }}
        >
          {t('actions.reset')}
        </Button>
        <Button className="min-h-11" onClick={() => save.mutate(current)} disabled={hasError || save.isPending}>
          {save.isPending ? t('actions.saving') : t('actions.save')}
        </Button>
      </SettingsFormActions>

      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('restricted')}
      </Text>
    </Box>
  )
}

/**
 * L'aperçu du dossier de compétences tel que le client le recevra : en-tête de marque, signature en fin de document,
 * pied en bas de page. Il montre le BROUILLON (comme l'aperçu de marque) ; une signature ou un pied absents ne
 * laissent AUCUNE ligne — rien n'est inventé.
 */
function DocumentPreview({ brandName, signature, footer }: { brandName: string; signature: string; footer: string }) {
  const { t } = useTranslation('branding')
  const signatureLines = signature
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  return (
    <Box
      role="img"
      aria-label={t('documents.previewLabel')}
      className="mt-3 flex min-h-40 flex-col justify-between rounded-control border border-[var(--bellum-border)] bg-card p-4"
    >
      <Box className="space-y-1">
        <Text size="xs" color="text-muted-foreground">
          {brandName}
        </Text>
        <Text size="sm" weight="semibold">
          {t('documents.previewTitle')}
        </Text>
        {signatureLines.map((line, index) => (
          <Text key={`${index}-${line}`} size="sm" color="text-[var(--bellum-text-secondary)]">
            {line}
          </Text>
        ))}
      </Box>
      {footer.trim() ? (
        <Text size="xs" color="text-muted-foreground" className="mt-3 border-t border-[var(--bellum-border)] pt-2">
          {footer.trim()}
        </Text>
      ) : null}
    </Box>
  )
}

function Field({
  label,
  help,
  error,
  value,
  placeholder,
  multiline = false,
  onChange,
}: {
  label: string
  help: string
  error?: string
  value: string
  placeholder: string
  multiline?: boolean
  onChange: (value: string) => void
}) {
  return (
    <Box className="flex min-w-0 flex-col gap-2">
      <Text element="label" size="xs" weight="medium">
        {label}
      </Text>
      {multiline ? (
        <textarea
          value={value}
          rows={3}
          placeholder={placeholder}
          aria-label={label}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3 text-sm"
        />
      ) : (
        <Input value={value} placeholder={placeholder} aria-label={label} onChange={e => onChange(e.target.value)} />
      )}
      <Text size="xs" color={error ? 'text-[var(--danger-soft-text)]' : 'text-muted-foreground'}>
        {error || help}
      </Text>
    </Box>
  )
}
