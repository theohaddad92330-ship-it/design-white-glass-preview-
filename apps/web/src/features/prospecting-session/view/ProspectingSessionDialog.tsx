import {
  Badge,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
} from '@bellum/ui'
import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, CheckCircle2, User } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { activitiesApi } from '../../activities/api'
import { LogActivityDialog } from '../../activities/view/LogActivityDialog'
import { contactsApi } from '../../contacts/api'
import type { DiscoverCallListRow } from '../../discover/lib/discover-call-list'
import { prospectingSessionsApi } from '../api'
import {
  buildProspectingSession,
  mergeSessionCollisions,
  PROSPECTING_SESSION_MODES,
  prospectingSessionCsv,
  type ProspectingSession,
  type ProspectingSessionMode,
} from '../lib/prospecting-session'
import { prospectingThreadNextLink } from '../lib/prospecting-thread'

/**
 * #2375 — « Prépare-moi une heure de prospection. »
 *
 * Deux temps, jamais fondus : le FORMULAIRE (durée, objectif, mode — #2375.2)
 * puis la SESSION générée (#2375.1). L'audience (`rows`) est celle déjà
 * chargée par l'écran Découvrir (liste d'appels) — la session elle-même est
 * une TRANSFORMATION, pas une collecte. #2386.6 ajoute UN aller-retour (pas
 * un par contact) pour la collision entre commerciaux : best-effort, une
 * fois la session bâtie — son échec ne doit jamais empêcher de l'afficher.
 * #2386.A/.7 — « Capturer chaque outcome » (scénario A, étape 11) : chaque
 * contact IDENTIFIÉ (`contactId`) rouvre le MÊME formulaire que la fiche
 * contact (`LogActivityDialog`, déjà mobile-compatible, déjà branché sur
 * l'écriture CRM depuis #2386.A) — jamais un second formulaire dédié à la
 * session (doctrine c75, un formulaire générique).
 */
export function ProspectingSessionDialog({
  open,
  onOpenChange,
  rows,
  onExport,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rows: readonly DiscoverCallListRow[]
  /** Absent = export non autorisé pour cet espace (même règle #2081.14 que la liste d'appels) : le bouton reste masqué. */
  onExport?: (csv: string, filename: string) => void
}) {
  const { t } = useTranslation('discover')
  const [mode, setMode] = useState<ProspectingSessionMode>('appels')
  const [durationMinutes, setDurationMinutes] = useState('60')
  const [objective, setObjective] = useState('')
  const [session, setSession] = useState<ProspectingSession | null>(null)
  const [onlyReady, setOnlyReady] = useState(false)
  // #2386.A/.7 — le contact dont on consigne l'issue, et ceux déjà consignés
  // (par `key` de ligne — stable pour l'affichage, jamais l'identité). Un
  // Set local, pas un champ du domaine pur (`ProspectingSession`) : c'est un
  // fait d'ÉCRAN (« déjà fait dans CETTE session »), pas une donnée reprise
  // ailleurs.
  const [outcomeTarget, setOutcomeTarget] = useState<{ key: string; contactId: string; fullName: string } | null>(null)
  const [loggedKeys, setLoggedKeys] = useState<ReadonlySet<string>>(new Set())
  const logOutcome = useMutation({
    mutationFn: activitiesApi.log,
    onSuccess: () => {
      if (!outcomeTarget) return
      setLoggedKeys(current => new Set(current).add(outcomeTarget.key))
      setOutcomeTarget(null)
    },
  })

  const generate = () => {
    const parsed = Number.parseInt(durationMinutes, 10)
    const built = buildProspectingSession(rows, {
      mode,
      durationMinutes: Number.isFinite(parsed) && parsed > 0 ? parsed : 60,
      objective: objective.trim(),
    })
    setSession(built)
    setOnlyReady(false)

    // #2386.9 — LA SESSION PERSISTÉE, l'appelant réel de `prospecting_sessions`
    // (migration `1796322207425`). Best-effort, comme la collision juste en
    // dessous : son échec n'empêche jamais d'afficher la session déjà
    // construite. `journey` = le mode choisi — TEXT libre côté contrat
    // (`prospecting-session-telemetry.ts`), jamais un second vocabulaire.
    const started = prospectingSessionsApi.start({ journey: mode }).catch(() => null)

    // #2386.6 — UN aller-retour groupé, jamais un par contact. Best-effort :
    // affiché quand il revient, jamais un blocage de la session déjà là.
    const contactIds = built.contacts.flatMap(contact => (contact.contactId ? [contact.contactId] : []))
    if (contactIds.length > 0) {
      contactsApi
        .solicitations(contactIds)
        .then(collisions => {
          setSession(current => (current ? mergeSessionCollisions(current, collisions) : current))
          // #2386.9 — le COMPTE déjà affiché (`duplicatesAvoided` ci-dessous)
          // rejoint désormais l'agrégat PAR PARCOURS : jamais un second calcul,
          // le même nombre que celui rendu à l'écran.
          const avoidedCount = Object.keys(collisions).length
          if (avoidedCount > 0) {
            void started.then(session => {
              if (!session) return
              void prospectingSessionsApi
                .recordEvent(session.id, { kind: 'duplicates_avoided', count: avoidedCount })
                .catch(() => {})
            })
          }
        })
        .catch(() => {
          // Confort d'affichage — une collision non résolue reste `undefined`
          // (non vérifiée), jamais un blocage de la session.
        })
    }
  }

  const displayedContacts = session
    ? onlyReady
      ? session.contacts.filter(contact => contact.ready)
      : session.contacts
    : []

  // #2386.9 (#3010.8) — UNE des quatre mesures de performance demandées par
  // #2386 : « doublons évités ». Pas une mesure neuve — `contact.collision`
  // est déjà calculé par `mergeSessionCollisions` (#2386.6) et affiché par
  // contact ; ceci n'en est qu'un COMPTE, jamais un second calcul. Les trois
  // autres (temps au premier message, taux de messages modifiés, succès
  // connecteur) n'ont toujours AUCUN capteur qui les alimente — cette session
  // n'a ni horodatage persisté, ni champ de message éditable, ni appel
  // connecteur — mais « donnée fictive » n'est jamais une raison de taire un
  // axe : elles restent NOMMÉES à l'écran, « non mesuré », plutôt qu'inventées
  // ou omises (FINIR-V2, doctrine « on n'affiche pas ce qu'on n'a pas » lue
  // pour un SCORE : l'axe se nomme, il ne disparaît pas).
  const duplicatesAvoided = session ? session.contacts.filter(contact => contact.collision).length : 0

  // #2386.1 — LE FIL, une fois la session prête : « étape suivante » vers
  // Séquences (l'envoi PAR LE COMMERCIAL), avec le contexte réel en
  // paramètres. `accountId` ne porte QUE si toute la session vise un seul
  // compte — une liste d'appels multi-comptes ne porte aucun compte deviné
  // (GA-18/19, `prospecting-thread.ts`).
  const sessionAccountIds = new Set(rows.flatMap(row => (row.accountId ? [row.accountId] : [])))
  const threadLink = session
    ? prospectingThreadNextLink('prepare', {
        accountId: sessionAccountIds.size === 1 ? [...sessionAccountIds][0] : undefined,
        mode,
      })
    : null

  const exportChecklist = () => {
    if (!session || !onExport) return
    const csv = prospectingSessionCsv(session, {
      company: t('prospectingSession.csv.company'),
      fullName: t('prospectingSession.csv.fullName'),
      title: t('prospectingSession.csv.title'),
      channel: t('prospectingSession.csv.channel'),
      pitch: t('prospectingSession.csv.pitch'),
      firstQuestion: t('prospectingSession.csv.firstQuestion'),
      ready: t('prospectingSession.csv.ready'),
    })
    const filename = `${t('prospectingSession.exportFilename')}-${new Date().toISOString().slice(0, 10)}.csv`
    onExport(csv, filename)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-2xl border-[var(--bellum-border)]">
          <DialogHeader>
            <DialogTitle>{t('prospectingSession.title')}</DialogTitle>
            <DialogDescription>{t('prospectingSession.subtitle')}</DialogDescription>
          </DialogHeader>

          <Box className="space-y-4">
            <Box className="space-y-1.5">
              <Text element="span" size="xs" weight="medium">
                {t('prospectingSession.modeLabel')}
              </Text>
              <Box display="flex" className="flex-wrap gap-1">
                {PROSPECTING_SESSION_MODES.map(value => (
                  <Button
                    key={value}
                    variant={mode === value ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setMode(value)}
                  >
                    {t(`prospectingSession.mode.${value}`)}
                  </Button>
                ))}
              </Box>
            </Box>

            <Box className="space-y-1.5">
              <Text element="span" size="xs" weight="medium">
                {t('prospectingSession.durationLabel')}
              </Text>
              <Input
                type="number"
                min={0}
                value={durationMinutes}
                onChange={event => setDurationMinutes(event.target.value)}
                aria-label={t('prospectingSession.durationLabel')}
              />
            </Box>

            <Box className="space-y-1.5">
              <Text element="span" size="xs" weight="medium">
                {t('prospectingSession.objectiveLabel')}
              </Text>
              <Input
                value={objective}
                onChange={event => setObjective(event.target.value)}
                placeholder={t('prospectingSession.objectivePlaceholder')}
                aria-label={t('prospectingSession.objectiveLabel')}
              />
            </Box>

            <Button variant="black" size="sm" onClick={generate}>
              {t('prospectingSession.generate')}
            </Button>

            {session ? (
              <Box className="space-y-3 rounded-md border border-[var(--bellum-border)] p-3">
                <Text element="span" size="sm" weight="medium">
                  {t('prospectingSession.resultTitle')}
                </Text>

                <Text element="p" size="xs" color="text-muted-foreground">
                  {t('prospectingSession.missing', {
                    phones: session.missing.phonesAvailable,
                    emailsOnly: session.missing.emailsOnly,
                    toVerify: session.missing.toVerify,
                  })}
                </Text>

                {session.boundedOut > 0 ? (
                  <Text element="p" size="xs" color="text-muted-foreground">
                    {t('prospectingSession.boundedOut', { count: session.boundedOut })}
                  </Text>
                ) : null}

                {duplicatesAvoided > 0 ? (
                  <Text element="p" size="xs" color="text-muted-foreground">
                    {t('prospectingSession.duplicatesAvoided', { count: duplicatesAvoided })}
                  </Text>
                ) : null}

                {/* #2386.8 (#3010.8) — les TROIS autres mesures demandées par
                    #2386 restent NOMMÉES, jamais tues : « non mesuré » n'est
                    jamais un silence (gardes GA-18/GA-19). Chacune sort du
                    dénominateur d'un éventuel taux global tant qu'elle
                    n'existe pas — voir le commentaire au-dessus de
                    `duplicatesAvoided` pour la raison de chacune. */}
                <Text element="p" size="xs" color="text-muted-foreground">
                  {t('prospectingSession.firstMessageTimeUnmeasured')}
                </Text>
                <Text element="p" size="xs" color="text-muted-foreground">
                  {t('prospectingSession.editedMessageRateUnmeasured')}
                </Text>
                <Text element="p" size="xs" color="text-muted-foreground">
                  {t('prospectingSession.connectorSuccessUnmeasured')}
                </Text>

                <Box display="flex" className="flex-wrap gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setOnlyReady(true)}>
                    {t('prospectingSession.startWithAvailable')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setOnlyReady(false)}>
                    {t('prospectingSession.keepForLinkedin')}
                  </Button>
                  {onExport ? (
                    <Button variant="ghost" size="sm" onClick={exportChecklist}>
                      {t('prospectingSession.export')}
                    </Button>
                  ) : null}
                </Box>

                <Box className="space-y-2">
                  {displayedContacts.map(contact => (
                    <Box key={contact.key} className="space-y-0.5 border-t border-[var(--bellum-border)] pt-2">
                      <Text element="p" size="sm" weight="medium">
                        {contact.fullName}
                      </Text>
                      <Text element="p" size="xs" color="text-muted-foreground">
                        {contact.company}
                        {contact.title ? ` — ${contact.title}` : ''}
                      </Text>
                      <Text element="p" size="xs">
                        {contact.pitch}
                      </Text>
                      <Text element="p" size="xs" color="text-muted-foreground">
                        {contact.firstQuestion}
                      </Text>
                      {!contact.ready ? (
                        <Text element="p" size="xs" color="text-muted-foreground">
                          {t('prospectingSession.notReady')}
                        </Text>
                      ) : null}
                      {contact.collision ? (
                        // #2386.6 — même patron que la fiche contact (#2128.17,
                        // ContactHeader) : un fait DISTINCT, son propre badge.
                        <Badge
                          variant="outline"
                          className="gap-1.5 border-[var(--bellum-warning)] text-[var(--warning-soft-text)]"
                        >
                          <User className="size-3.5 shrink-0" />
                          {t('prospectingSession.collision', {
                            name: contact.collision.colleague.name,
                            date: formatDate(contact.collision.lastTouchOn, { day: '2-digit', month: 'short' }),
                          })}
                        </Badge>
                      ) : null}
                      {contact.contactId ? (
                        loggedKeys.has(contact.key) ? (
                          <Badge variant="outline" className="gap-1.5">
                            <CheckCircle2 className="size-3.5 shrink-0" />
                            {t('prospectingSession.outcomeLogged')}
                          </Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              contact.contactId &&
                              setOutcomeTarget({
                                key: contact.key,
                                contactId: contact.contactId,
                                fullName: contact.fullName,
                              })
                            }
                          >
                            {t('prospectingSession.logOutcome')}
                          </Button>
                        )
                      ) : null}
                    </Box>
                  ))}
                </Box>

                {threadLink ? (
                  <Link
                    to={threadLink.to}
                    search={threadLink.search}
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
                  >
                    {t('prospectingSession.thread.next')}
                    <ArrowRight className="size-3.5 shrink-0" aria-hidden />
                  </Link>
                ) : null}
              </Box>
            ) : null}
          </Box>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {t('common:actions.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* #2386.A/.7 — LE même formulaire que la fiche contact, pas un second
          dédié à la session (doctrine c75), et HORS du `Dialog` ci-dessus —
          deux racines de dialogue imbriquées cassent le focus-trap Radix. */}
      <LogActivityDialog
        open={outcomeTarget !== null}
        onOpenChange={openState => {
          if (!openState) setOutcomeTarget(null)
        }}
        isPending={logOutcome.isPending}
        onSubmit={draft => {
          if (!outcomeTarget) return
          logOutcome.mutate({ ...draft, contactId: outcomeTarget.contactId })
        }}
      />
    </>
  )
}
