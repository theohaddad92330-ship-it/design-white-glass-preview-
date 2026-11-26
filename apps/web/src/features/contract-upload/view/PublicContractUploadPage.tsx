import { BrandMark } from '@/features/brand/BrandMark'
import type { LegalContractUploadLinkPublicStatus } from '@bellum/contracts'
import { resolveBrand } from '@bellum/contracts'
import { Badge, BrailleLoader, Box, Button, Logo, Text } from '@bellum/ui'
import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { depositContractUploadFile, readFileAsBase64 } from '@/features/contract-upload/api'

const PRODUCT_BRAND = resolveBrand(null)

function PoweredByFooter() {
  const { t } = useTranslation('contractUpload')
  if (PRODUCT_BRAND.isCustom) return null
  return (
    <Box as="footer" className="border-t border-[var(--bellum-border)] px-4 py-6 md:px-8">
      <Box display="flex" className="items-center justify-center gap-1 text-xs text-muted-foreground">
        <span>{t('footer.poweredBy')}</span>
        <Logo aria-label={PRODUCT_BRAND.name} className="h-6 w-6" />
        <Text element="span" size="xs" weight="semibold" color="text-foreground">
          {PRODUCT_BRAND.name}
        </Text>
      </Box>
    </Box>
  )
}

export function PublicContractUploadLoading() {
  return (
    <Box display="flex" className="relative min-h-full items-center justify-center bg-[var(--bellum-bg)]">
      <BrailleLoader variant="grid-searching" dotSize={4} dotGap={2} />
    </Box>
  )
}

export function PublicContractUploadNotFound() {
  const { t } = useTranslation('contractUpload')
  return (
    <Box display="flex" className="relative min-h-full flex-col bg-[var(--bellum-bg)] text-foreground">
      <TopBar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-4 md:px-8 md:pt-6">
        <PageHeading kicker={t('kicker')} title={t('notFound.title')} lead={t('notFound.message')} />
      </main>
      <PoweredByFooter />
    </Box>
  )
}

/** Barre haute d'`onboarding-accueil` : la marque, sans fond ni filet. */
function TopBar() {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center bg-[var(--bellum-bg)] px-4 md:px-8">
      <BrandMark />
    </header>
  )
}

/** `.ob23-heading` : surtitre d'accent, h1, phrase(s) — hors de la carte. */
function PageHeading({ kicker, title, lead }: { kicker: string; title: string; lead: ReactNode }) {
  return (
    <Box data-testid="upload-heading" className="mb-6 mt-2">
      <span className="block text-xs font-semibold uppercase tracking-widest text-[var(--bellum-text-accent)]">
        {kicker}
      </span>
      <Text element="h1" size="3xl" weight="semibold" className="mt-3 tracking-tight md:text-4xl">
        {title}
      </Text>
      <Box className="mt-3 space-y-1 text-sm text-[var(--bellum-text-secondary)]">{lead}</Box>
    </Box>
  )
}

/**
 * #2422.6 (épopée #2869, lot R24 07/10/2026) — LA PAGE PUBLIQUE DE DÉPÔT.
 *
 * Anonyme — aucune session, aucun en-tête de produit, aucune donnée au-delà
 * de ce que le lien nomme (le docblock du schéma, côté contrats, explique le
 * pourquoi). DÉPÔT SEULEMENT : aucune lecture des autres pièces du contrat
 * n'est rendue ici, ni même possible — la réponse publique ne les porte pas.
 */
export function PublicContractUploadPage({
  token,
  status,
}: {
  token: string
  status: Extract<LegalContractUploadLinkPublicStatus, { status: 'valid' }>
}) {
  const { t } = useTranslation('contractUpload')
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function submit(): Promise<void> {
    if (!pendingFile) {
      setError(t('form.fileRequired'))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const fileB64 = await readFileAsBase64(pendingFile)
      const result = await depositContractUploadFile(token, {
        fileName: pendingFile.name,
        contentType: pendingFile.type,
        fileB64,
      })
      setDone(result.fileName)
      setPendingFile(null)
      setFileName(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('form.failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box display="flex" className="relative min-h-full flex-col bg-[var(--bellum-bg)] text-foreground">
      <TopBar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-4 md:px-8 md:pt-6">
        <PageHeading
          kicker={t('kicker')}
          title={t('context.title', { account: status.accountName })}
          lead={
            <>
              <p>{t('context.subtitle', { contract: status.contractLabel })}</p>
              {status.missionLabel ? <p>{t('context.mission', { mission: status.missionLabel })}</p> : null}
            </>
          }
        />

        <Box
          data-testid="upload-card"
          className="max-w-2xl space-y-4 rounded-card border border-[var(--bellum-border)] bg-card p-6 md:p-9"
        >
          {done ? (
            <Box className="space-y-2">
              <Badge variant="success">{t('form.done.badge')}</Badge>
              <Text element="h2" size="2xl" weight="semibold" className="tracking-tight">
                {t('form.done.title')}
              </Text>
              <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
                {t('form.done.message', { fileName: done })}
              </Text>
            </Box>
          ) : (
            <>
              <Box display="flex" className="flex-wrap items-center gap-2.5">
                <Button variant="outline" disabled={submitting} onClick={() => inputRef.current?.click()}>
                  {fileName ?? t('form.chooseFile')}
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  accept={status.acceptedExtensions}
                  className="hidden"
                  aria-label={t('form.chooseFile')}
                  onChange={event => {
                    const file = event.target.files?.[0] ?? null
                    setPendingFile(file)
                    setFileName(file?.name ?? null)
                    setError(null)
                  }}
                />
                <Button variant="violet" disabled={!pendingFile || submitting} onClick={() => void submit()}>
                  {submitting ? t('form.submitting') : t('form.submit')}
                </Button>
              </Box>
              <Text
                element="p"
                size="xs"
                className="border-t border-[var(--bellum-border)] pt-4 text-[var(--bellum-text-muted)]"
              >
                {t('form.accepted', { formats: status.acceptedExtensions })}
              </Text>
              {error ? (
                <Text
                  element="p"
                  size="sm"
                  role="alert"
                  className="rounded-control bg-[var(--danger-soft-bg)] px-3 py-2 text-[var(--danger-soft-text)]"
                >
                  {error}
                </Text>
              ) : null}
            </>
          )}
        </Box>
      </main>
      <PoweredByFooter />
    </Box>
  )
}
