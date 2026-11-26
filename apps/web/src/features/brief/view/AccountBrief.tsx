import { Badge, Box, Button, Card, CardContent, Tabs, TabsList, TabsTrigger, Text, cn } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { angleProofState, firstMove } from '@bellum/contracts'
import { buildFirstMoveInput } from '../lib/first-move-input'
import { BRIEF_MODES, DEFAULT_BRIEF_MODE, type BriefMode } from '../lib/brief-modes'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { useAccount } from '@/features/accounts/hooks/useAccount'
import { buildAccountWatchData } from '@/features/accounts/model/watchData'
import { formatSignalDateIfKnown } from '@/lib/signal-date'
import { briefUnknowns } from '../lib/brief-unknowns'

/**
 * Le brief d'avant-rendez-vous (tome 5, partie M) — une page, quatre minutes.
 *
 * Le plan complet fait trois à cinq pages ; personne ne le lit dans un taxi.
 * Huit blocs, dans un ordre qui n'est pas décoratif :
 *
 * 1. ce qu'on retient si on ne lit rien d'autre ;
 * 2. pourquoi maintenant — l'accroche de la conversation ;
 * 3. ce qu'IL fait, lui — on parle de lui avant de parler de nous ;
 * 4. les questions, dans l'ordre d'usage ;
 * 5. les objections qui vont arriver ;
 * 6. ce qu'on peut prouver, une seule fois ;
 * 7. ce qu'on ne sait pas — les questions à poser en priorité ;
 * 8. l'interdit, en DERNIER : c'est ce qu'on lit juste avant d'entrer.
 *
 * Aucune donnée n'est produite ici : le brief REORDONNE le dossier. Un brief
 * qui calculerait quelque chose de son côté finirait par contredire l'écran.
 *
 * #2125.29-.33 — le rendez-vous n'est pas toujours le même : les questions et
 * les objections probables changent selon le CONTEXTE (premier rendez-vous,
 * point client, partenaire, renouvellement, soutenance). Le reste du brief
 * (les 30 secondes, les signaux, l'interlocuteur, la preuve, les inconnues,
 * l'interdit) ne varie pas — ce sont des FAITS du dossier, pas des angles de
 * conversation.
 *
 * #2125.7 — le format PDF s'appuie sur `window.print()` plutôt que sur
 * `@react-pdf/renderer` : les classes `print:` de cet écran existent déjà
 * pour ça, et un document qui imprimerait autre chose que ce qui est affiché
 * contredirait la doctrine « chaque export reflète le dossier visible à
 * l'écran » (#2125.68) — ici, il n'y a littéralement rien d'autre à générer.
 */
export function AccountBrief({ accountId }: { accountId: string }) {
  const { t } = useTranslation('brief')
  const [mode, setMode] = useState<BriefMode>(DEFAULT_BRIEF_MODE)
  const { account, contacts, loading } = useAccount(accountId)
  // Le classement d'entités vient de l'onglet Accès — le même qui décide « ne
  // pas attaquer le siège ». En recalculer un second ici donnerait deux portes
  // d'entrée différentes pour le même compte.
  const access = useQuery({
    queryKey: ['accounts', accountId, 'access'],
    queryFn: () => apiFetch<{ entities: { name: string; score: number }[] }>({ path: `/accounts/${accountId}/access` }),
    enabled: accountId.length > 0,
  })
  const entities = access.data?.entities ?? []

  if (loading) return <Text size="sm">{t('loading')}</Text>
  if (!account) return <Text size="sm">{t('missing')}</Text>

  const raw = (account.raw_analysis ?? {}) as Record<string, unknown>
  // #3928.1 — recette prod 14/10, SNCF RESEAU : « Aucun signal récent » ici alors que
  // l'onglet Opportunités en comptait 7. Cette section lisait `raw_analysis.recent_signals`
  // directement, une seconde lecture du même fait (GA-26) qui ratait les signaux posés sur
  // `account.recent_signals` (la colonne) et toute autre source que `buildAccountWatchData`
  // fusionne déjà. Même lecteur que `TabSignal` (onglet Opportunités), sans les signaux CRM
  // (#3918, hors périmètre de ce point).
  const signals = buildAccountWatchData(account).signals
  const angles = Array.isArray(raw['angles']) ? (raw['angles'] as Record<string, unknown>[]) : []
  // #4543 — UN lecteur pour les inconnues (`brief-unknowns.ts`) : posées + ce que l'analyse n'a pas relevé.
  const unknowns = briefUnknowns(raw).map(u => (u.gap ? t(`unknownGaps.${u.gap}`, { count: u.count }) : (u.text ?? '')))
  const decisionMaker = contacts.find(contact => contact.decision_role === 'economic') ?? contacts[0] ?? null

  // Le premier mouvement est nourri par le DOSSIER, pas par des `null` : c'est
  // ce qui fait la différence entre un anti-conseil allumé et un anti-conseil
  // qui ne se déclenche jamais.
  const move = firstMove(buildFirstMoveInput(account, contacts, entities))
  // L'état de la preuve du play de tête. `angles[0]` absent ⇒ `non_verifie`,
  // ce qui est exact : sans angle, rien n'a été vérifié.
  const proofState = angleProofState(angles[0])

  const decisionMakerIsEconomic = decisionMaker?.decision_role === 'economic'

  // Refonte Théo (grammaire de `a/comptes-fiche`) — le retour à la fiche en tête, l'identité du compte
  // (pastille d'initiales, nom, sous-titre) avec son geste à droite, les modes en vrais onglets, puis
  // DEUX colonnes : ce qu'on dira (30 secondes, pourquoi maintenant, questions, objections, preuve) et,
  // à côté, ce qu'on doit savoir en entrant (qui, ce qu'on ignore, ce qu'il ne faut pas faire).
  return (
    <Box display="flex" className="w-full flex-col gap-5 print:gap-2" data-testid="account-brief">
      <Link
        to="/accounts/$id"
        params={{ id: accountId }}
        className="inline-flex min-h-11 items-center self-start text-sm text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)] print:hidden"
      >
        <ArrowLeft className="mr-1.5 size-4" aria-hidden />
        {t('backToAccount')}
      </Link>

      <Box display="flex" className="flex-wrap items-start justify-between gap-4">
        <Box display="flex" className="min-w-0 items-center gap-4">
          {/* Les initiales, teintées : le repère visuel d'un compte, comme dans la liste des comptes. */}
          <span
            aria-hidden
            className="inline-flex size-14 shrink-0 items-center justify-center rounded-card bg-[var(--accent-soft-bg)] text-lg font-semibold text-[var(--accent-soft-text)]"
          >
            {account.company_name.trim().slice(0, 2).toUpperCase()}
          </span>
          <Box className="min-w-0 space-y-1">
            <Text element="h2" size="2xl" weight="semibold" className="truncate tracking-tight">
              {account.company_name}
            </Text>
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('headSubtitle')}
            </Text>
          </Box>
        </Box>
        <Box display="flex" className="items-center gap-3 print:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={Download}
            className="min-h-11"
            onClick={() => window.print()}
          >
            {t('downloadPdf')}
          </Button>
        </Box>
      </Box>

      <Tabs value={mode} onValueChange={value => setMode(value as BriefMode)} className="print:hidden">
        <TabsList variant="underline" aria-label={t('modes.label')} className="max-w-full overflow-x-auto">
          {BRIEF_MODES.map(item => (
            <TabsTrigger key={item} value={item}>
              {t(`modes.${item}.label`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Box className="grid gap-4 lg:grid-cols-3 print:block print:space-y-2">
        <Box display="flex" className="min-w-0 flex-col gap-4 lg:col-span-2" data-testid="brief-main">
          <Section title={t('blocks.thirtySeconds')}>
            <Text size="sm">
              {[account.sector, account.employees, account.headquarters].filter(Boolean).join(' · ') || t('empty')}
            </Text>
            {account.priority_justification && <Text size="sm">{account.priority_justification}</Text>}
          </Section>

          <Section title={t('blocks.whyNow')}>
            {signals.length === 0 ? (
              <Text size="sm" color="text-[var(--bellum-text-muted)]">
                {t('noSignal')}
              </Text>
            ) : (
              <BulletList>
                {signals.slice(0, 4).map(signal => {
                  const knownDate = formatSignalDateIfKnown(signal.date)
                  return (
                    <li key={signal.id} className="flex flex-wrap items-center gap-2">
                      <span>{signal.signal}</span>
                      {knownDate ? <Badge variant="default">{knownDate}</Badge> : null}
                    </li>
                  )
                })}
              </BulletList>
            )}
          </Section>

          <Section title={t('blocks.questions')}>
            <BulletList>
              {(t(`modes.${mode}.questions`, { returnObjects: true }) as string[]).map(question => (
                <li key={question}>{question}</li>
              ))}
            </BulletList>
          </Section>

          <Section title={t('blocks.objections')}>
            <BulletList>
              {(t(`modes.${mode}.objections`, { returnObjects: true }) as string[]).map(objection => (
                <li key={objection}>{objection}</li>
              ))}
            </BulletList>
          </Section>

          <Section title={t('blocks.proof')}>
            {/* Quatre états, pas deux (tome 5 §32.2) : rien à dire, une phrase que rien n'étaye, et un
                dossier qu'on n'a pas encore regardé — ce dernier est le seul où « aucune preuve » serait
                un mensonge, parce qu'il affirmerait qu'on a vérifié. */}
            <Text size="sm">{move.message.proof ?? t(`proofAbsence.${proofState}`)}</Text>
          </Section>
        </Box>

        <Box display="flex" className="min-w-0 flex-col gap-4" data-testid="brief-aside">
          <Section title={t('blocks.whoTheyAre')}>
            {decisionMaker ? (
              <Box display="flex" className="flex-col gap-1">
                <Box display="flex" className="flex-wrap items-center gap-2">
                  <Text size="sm" weight="semibold">
                    {decisionMaker.full_name}
                  </Text>
                  {/* Le décideur se repère : badge teinté, seulement quand son rôle de décision est établi. */}
                  {decisionMakerIsEconomic ? <Badge variant="primary">{t('decisionMaker')}</Badge> : null}
                </Box>
                {[decisionMaker.title, decisionMaker.entity].filter(Boolean).length > 0 ? (
                  <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                    {[decisionMaker.title, decisionMaker.entity].filter(Boolean).join(' — ')}
                  </Text>
                ) : null}
              </Box>
            ) : (
              <Text size="sm" color="text-[var(--bellum-text-muted)]">
                {t('noContact')}
              </Text>
            )}
          </Section>

          {/* #4543 — UNE source pour les inconnues (`raw_analysis.unknowns`). Vide, le bloc dit « non renseigné »,
              jamais « rien d'inconnu » : la synthèse du même écran peut en nommer (GA-18 / GA-19). */}
          <Section title={t('blocks.unknowns')} tone="warning">
            {unknowns.length === 0 ? (
              <Text size="sm" color="text-[var(--bellum-text-muted)]">
                {t('unknownsFallback')}
              </Text>
            ) : (
              <BulletList>
                {unknowns.slice(0, 5).map(unknown => (
                  <li key={unknown}>{unknown}</li>
                ))}
              </BulletList>
            )}
          </Section>

          {/* L'INTERDIT en dernier, comme dans le document d'origine : c'est ce qu'on lit juste avant
              d'entrer. Vide tant que l'anti-conseil n'a pas été jugé sur un jeu de comptes réels. */}
          {move.antiAdvice.length > 0 && (
            <Section title={t('blocks.doNot')} tone="danger">
              {move.antiAdvice.map(item => (
                <Box key={item.kind}>
                  <Text size="sm">{item.label}</Text>
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {item.reason}
                  </Text>
                </Box>
              ))}
            </Section>
          )}
        </Box>
      </Box>
    </Box>
  )
}

const SECTION_TONE = {
  neutral: '',
  warning: 'border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)]',
  danger: 'border-[var(--danger-soft-border)] bg-[var(--danger-soft-bg)]',
} as const

const SECTION_TITLE_TONE = {
  neutral: 'text-[var(--bellum-text-muted)]',
  warning: 'text-[var(--warning-soft-text)]',
  danger: 'text-[var(--danger-soft-text)]',
} as const

function Section({
  title,
  tone = 'neutral',
  children,
}: {
  title: string
  tone?: keyof typeof SECTION_TONE
  children: React.ReactNode
}) {
  return (
    <Card className={cn('rounded-card print:break-inside-avoid', SECTION_TONE[tone])}>
      <CardContent className="flex flex-col gap-2 p-5 print:p-3">
        <Text size="xs" weight="semibold" className={cn('uppercase tracking-wider', SECTION_TITLE_TONE[tone])}>
          {title}
        </Text>
        {children}
      </CardContent>
    </Card>
  )
}

/** Une liste à puces lisible : le texte courant garde sa taille de lecture. */
function BulletList({ children }: { children: React.ReactNode }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm marker:text-[var(--bellum-text-muted)]">{children}</ul>
  )
}
