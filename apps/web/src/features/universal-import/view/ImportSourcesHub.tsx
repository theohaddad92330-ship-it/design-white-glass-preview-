import { UNIVERSAL_IMPORT_TYPES, type UniversalImportType } from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import {
  BookUser,
  Briefcase,
  Building2,
  ClipboardList,
  ClipboardPaste,
  FileStack,
  FileUp,
  GitMerge,
  GraduationCap,
  Plug,
  Plus,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CONTEXT_PACK_ANCHOR } from './ContextPackDropzone'
import { UniversalImportDialog } from './UniversalImportDialog'
import { UniversalImportHistory } from './UniversalImportHistory'

type Assistant = { source: 'file' | 'paste'; type: UniversalImportType }
type SourceId = 'file' | 'paste' | 'addressBook' | 'crm' | 'laura'

/** Les bénéfices dits sur la page : les mêmes trois que la maquette (C3.A7), aucun n'est promis sans écran qui le montre. */
const BENEFITS: readonly { id: 'portfolio' | 'laura' | 'noDuplicate'; icon: LucideIcon }[] = [
  { id: 'portfolio', icon: Building2 },
  { id: 'laura', icon: Sparkles },
  { id: 'noDuplicate', icon: GitMerge },
]

/** « Que veux-tu importer ? » (C3.A1) — les types que le moteur d'import ÉCRIT ; aucun type sans import n'y figure. */
const TYPE_ICON: Record<UniversalImportType, LucideIcon> = {
  contact: Users,
  account: Building2,
  need: ClipboardList,
  mission: Briefcase,
  talent: GraduationCap,
}
const TYPE_ORDER: readonly UniversalImportType[] = ['contact', 'account', 'need', 'mission', 'talent']

const CARD =
  'flex min-h-11 w-full items-start gap-4 rounded-card border border-[var(--bellum-border)] bg-card p-5 text-left transition-colors duration-immediate ease-bellum-out hover:border-[var(--bellum-text-accent)]'
const ICON_BOX =
  'flex size-9 shrink-0 items-center justify-center rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-[var(--bellum-text-secondary)]'

/**
 * Théo B C3 — « Imports & sources », sur la maquette `b/c3-imports-sources.html`, de haut en bas : le titre de section et
 * « Nouvel import » (qui demande d'abord « Que veux-tu importer ? »), les sources en cartes (trois colonnes), les deux
 * imports qui se font ailleurs (documents de cadrage, CV en masse), « Ce que ces données vont débloquer », puis
 * l'historique des imports en tableau. Les cartes de source ouvrent l'assistant plein écran (C4) SUR LA MÊME ROUTE.
 *
 * Aucune inscription automatique en séquence, aucun enrichissement payant : la mention est sur toute la page.
 */
export function ImportSourcesHub({ children }: { children?: ReactNode }) {
  const { t } = useTranslation('importWizard')
  const [assistant, setAssistant] = useState<Assistant | null>(null)
  const [choosingType, setChoosingType] = useState(false)

  if (assistant) {
    return (
      <UniversalImportDialog
        layout="page"
        fixedType={assistant.type}
        initialSource={assistant.source}
        onClose={() => setAssistant(null)}
      />
    )
  }

  const open = (source: Assistant['source']) => () => setAssistant({ source, type: 'contact' })

  return (
    <div className="space-y-8" data-testid="import-sources-hub">
      <section aria-labelledby="hub-sources-title" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h2 id="hub-sources-title" className="text-xl font-semibold text-[var(--bellum-text-primary)]">
              {t('hub.title')}
            </h2>
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('hub.subtitle')}
            </Text>
            <Text size="sm" className="text-[var(--bellum-text-muted)]" data-testid="hub-nothing-automatic">
              {t('hub.nothingAutomatic')}
            </Text>
          </div>
          <Button icon={Plus} className="min-h-11" onClick={() => setChoosingType(true)}>
            {t('hub.newImport')}
          </Button>
        </div>

        <div
          role="group"
          aria-label={t('hub.sourcesLabel')}
          className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-4"
          data-testid="hub-sources"
        >
          <SourceCard icon={FileUp} id="file" onClick={open('file')} />
          <SourceCard icon={ClipboardPaste} id="paste" onClick={open('paste')} />
          <SourceCard icon={BookUser} id="addressBook" onClick={open('file')} />
          <SourceCard icon={Plug} id="crm" to="/integrations" />
          <SourceCard icon={Sparkles} id="laura" to="/chat" search={{ prompt: t('hub.sources.laura.prompt') }} />
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(22rem,1fr))] gap-4" data-testid="hub-elsewhere">
          <a href={`#${CONTEXT_PACK_ANCHOR}`} className={CARD}>
            <CardBody icon={FileStack} id="framing" />
          </a>
          <Link to="/consultants" className={CARD}>
            <CardBody icon={GraduationCap} id="cv" />
          </Link>
        </div>
      </section>

      <section
        aria-labelledby="hub-benefits-title"
        className="rounded-card border border-[var(--bellum-border)] bg-card p-5 sm:p-6"
        data-testid="hub-benefits"
      >
        <h2 id="hub-benefits-title" className="text-lg font-semibold text-[var(--bellum-text-primary)]">
          {t('hub.benefitsLabel')}
        </h2>
        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-6">
          {BENEFITS.map(({ id, icon: Icon }) => (
            <div key={id} className="space-y-2">
              <Icon className="size-5 text-[var(--bellum-text-accent)]" aria-hidden />
              <h3 className="text-base font-semibold text-[var(--bellum-text-primary)]">
                {t(`hub.benefits.${id}.title`)}
              </h3>
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {t(`hub.benefits.${id}.body`)}
              </Text>
            </div>
          ))}
        </div>
      </section>

      <UniversalImportHistory />

      {children}

      <Dialog open={choosingType} onOpenChange={setChoosingType}>
        <DialogContent closeLabel={t('hub.what.cancel')} className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('hub.what.title')}</DialogTitle>
            <DialogDescription>{t('hub.what.description')}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-3" data-testid="hub-what-types">
            {TYPE_ORDER.filter(type => UNIVERSAL_IMPORT_TYPES.includes(type)).map(type => {
              const Icon = TYPE_ICON[type]
              return (
                <button
                  key={type}
                  type="button"
                  className={CARD}
                  onClick={() => {
                    setChoosingType(false)
                    setAssistant({ source: 'file', type })
                  }}
                >
                  <span className={ICON_BOX}>
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-base font-semibold text-[var(--bellum-text-primary)]">
                      {t(`universal.types.${type}`)}
                    </span>
                    <span className="mt-1 block text-sm text-[var(--bellum-text-secondary)]">
                      {t(`hub.what.types.${type}`)}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          <Text
            size="sm"
            className="rounded-control bg-[var(--bellum-surface-2)] p-3 text-[var(--bellum-text-secondary)]"
          >
            {t('hub.cvNote')}{' '}
            <Link to="/consultants" className="underline underline-offset-2">
              {t('hub.cvLink')}
            </Link>
          </Text>
          <DialogFooter>
            <Button variant="ghost" className="min-h-11" onClick={() => setChoosingType(false)}>
              {t('hub.what.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CardBody({ icon: Icon, id }: { icon: LucideIcon; id: SourceId | 'framing' | 'cv' }) {
  const { t } = useTranslation('importWizard')
  return (
    <>
      <span className={ICON_BOX}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-base font-semibold text-[var(--bellum-text-primary)]">
          {t(`hub.sources.${id}.title`)}
        </span>
        <span className="mt-1 block text-sm text-[var(--bellum-text-secondary)]">{t(`hub.sources.${id}.body`)}</span>
        <span className="mt-3 block text-xs text-[var(--bellum-text-muted)]">{t(`hub.sources.${id}.meta`)}</span>
      </span>
    </>
  )
}

function SourceCard({
  icon,
  id,
  onClick,
  to,
  search,
}: {
  icon: LucideIcon
  id: SourceId
  onClick?: () => void
  to?: '/integrations' | '/chat'
  search?: { prompt: string }
}) {
  const body = <CardBody icon={icon} id={id} />
  if (to === '/chat') {
    return (
      <Link to="/chat" search={search} className={CARD}>
        {body}
      </Link>
    )
  }
  if (to === '/integrations') {
    return (
      <Link to="/integrations" className={CARD}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={CARD}>
      {body}
    </button>
  )
}
