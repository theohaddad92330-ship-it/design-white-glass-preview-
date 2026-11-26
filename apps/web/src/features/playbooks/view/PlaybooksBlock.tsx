import type { PlaybookSubscription } from '@bellum/contracts'
import { PLAYBOOK_DAILY_CAP, QUIET_HOURS_END, QUIET_HOURS_START } from '@bellum/contracts'
import { Badge, Box, Button, Card, Input, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlaybookDryRun, usePlaybooks, useUpdatePlaybook } from '../api'

/**
 * LES RELANCES AUTOMATIQUES — leur RÉGLAGE, et il vit dans Réglages › Routines.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE BLOC A DÉMÉNAGÉ (#1438)
 * ─────────────────────────────────────────────────────────────────────────────
 * *« Le bloc complet Relances automatiques avec seuil en jours, Simuler et Armer
 * est une interface de configuration d'automatisation. Il ne doit pas occuper la
 * page Décisions. »* — et c'est juste : Pilotage répond à « qu'est-ce qui
 * décroche et que dois-je décider », pas à « comment je règle ce qui part tout
 * seul ». Le produit avait déjà un endroit pour la seconde question, avec la
 * bonne promesse écrite dessus : *« Ce que {{brand}} fait pour toi, sans que tu
 * le demandes — chaque routine est visible, réglable et désactivable. »*
 *
 * Deux endroits pour régler ce qui part tout seul, c'était un endroit de trop.
 * Ce qui reste sur Pilotage est une SYNTHÈSE (`PlaybooksSummary`), qui ne règle
 * rien et ouvre la porte d'ici.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE BLOC PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est le seul endroit du produit d'où part un e-mail sans clic humain.
 * L'écran est donc écrit pour qu'on ne puisse pas armer sans comprendre ce qu'on
 * arme : les garde-fous sont ÉNONCÉS à côté de l'interrupteur, avec leurs
 * chiffres réels lus dans le contrat — un texte qui dirait « 8 h – 19 h »
 * pendant que le code enverrait à 7 h serait pire que pas de texte du tout.
 */

export function PlaybooksBlock() {
  const { t } = useTranslation('playbooks')
  const { data: playbooks, isError, isLoading } = usePlaybooks()

  return (
    <Card className="p-4">
      <Text element="p" size="sm" weight="semibold">
        {t('playbooks.title')}
      </Text>
      <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
        {t('playbooks.intro')}
      </Text>
      {/* Les garde-fous, avec leurs vrais chiffres : armer sans les lire ne doit
          pas être possible, et les recopier à la main les ferait diverger du
          code au premier changement. */}
      <Text element="p" size="xs" className="mt-2 text-[var(--bellum-text-secondary)]">
        {t('playbooks.guardrails', { start: QUIET_HOURS_START, end: QUIET_HOURS_END, cap: PLAYBOOK_DAILY_CAP })}
      </Text>

      <Box className="mt-3 space-y-2">
        {isLoading ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('common.loading')}
          </Text>
        ) : isError ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('playbooks.loadError')}
          </Text>
        ) : (
          playbooks?.map(playbook => <PlaybookRow key={playbook.playbook} playbook={playbook} />)
        )}
      </Box>
    </Card>
  )
}

function PlaybookRow({ playbook }: { playbook: PlaybookSubscription }) {
  const { t } = useTranslation('playbooks')
  const update = useUpdatePlaybook()
  const [silence, setSilence] = useState(String(playbook.silenceDays))
  const [simulating, setSimulating] = useState(false)
  const dryRun = usePlaybookDryRun(playbook.playbook, simulating)

  const parsed = Number.parseInt(silence, 10)
  const validSilence = Number.isInteger(parsed) && parsed >= 1 && parsed <= 90

  return (
    <Box className="rounded-md border border-border p-3">
      <Box display="flex" className="flex-wrap items-center justify-between gap-2">
        <Box className="min-w-0">
          <Box display="flex" className="items-center gap-2">
            <Text element="span" size="sm" weight="medium">
              {t(`playbooks.keys.${playbook.playbook}.title`)}
            </Text>
            <Badge variant={playbook.enabled ? 'success' : 'outline'}>
              {playbook.enabled ? t('playbooks.on') : t('playbooks.off')}
            </Badge>
          </Box>
          <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
            {t(`playbooks.keys.${playbook.playbook}.description`)}
          </Text>
        </Box>

        <Box display="flex" className="items-center gap-2">
          <Input
            value={silence}
            onChange={event => setSilence(event.target.value)}
            aria-label={t('playbooks.silenceLabel')}
            className="w-16"
            inputMode="numeric"
          />
          <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('playbooks.silenceUnit')}
          </Text>
          {/* Simuler AVANT d'armer. Le bouton est à gauche de l'interrupteur
              parce que c'est l'ordre dans lequel on veut que ça se fasse : voir
              qui recevrait un e-mail, puis décider. */}
          <Button variant="ghost" size="sm" onClick={() => setSimulating(value => !value)}>
            {simulating ? t('playbooks.dryRun.hide') : t('playbooks.dryRun.show')}
          </Button>
          <Button
            variant={playbook.enabled ? 'ghost' : 'black'}
            size="sm"
            disabled={!validSilence}
            isLoading={update.isPending}
            onClick={() =>
              update.mutate({ playbook: playbook.playbook, enabled: !playbook.enabled, silenceDays: parsed })
            }
          >
            {playbook.enabled ? t('playbooks.stop') : t('playbooks.arm')}
          </Button>
        </Box>
      </Box>
      {!validSilence ? (
        <Text element="p" size="xs" className="mt-1 text-[var(--warning-soft-text)]">
          {t('playbooks.silenceInvalid')}
        </Text>
      ) : null}

      {simulating ? <DryRunBlock query={dryRun} /> : null}
    </Box>
  )
}

/**
 * Le résultat d'une simulation.
 *
 * Trois choses, dans cet ordre : combien partiraient, qui, et POURQUOI les
 * autres ne partiraient pas. Le troisième est le plus utile — « 2 sur 30 »
 * sans les motifs laisse croire à une panne alors que vingt-huit clients ont
 * simplement déjà répondu.
 */
function DryRunBlock({ query }: { query: ReturnType<typeof usePlaybookDryRun> }) {
  const { t } = useTranslation('playbooks')
  const { data, isLoading, isError } = query

  if (isLoading) {
    return (
      <Text element="p" size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
        {t('common.loading')}
      </Text>
    )
  }
  // Une erreur de lecture n'est PAS « rien ne partirait » : afficher zéro sur un
  // serveur en panne inviterait à armer sur une simulation qui n'a rien vu.
  if (isError || !data) {
    return (
      <Text element="p" size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
        {t('playbooks.dryRun.error')}
      </Text>
    )
  }

  const blocked = Object.entries(data.blocked).filter(([, count]) => count > 0)

  return (
    <Box className="mt-2 rounded-md border border-border bg-[var(--bellum-surface-2)] p-3">
      <Text element="p" size="xs" weight="medium">
        {t('playbooks.dryRun.summary', { count: data.wouldSend, total: data.entries.length })}
      </Text>
      <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
        {t('playbooks.dryRun.noSend')}
      </Text>

      {data.entries.length === 0 ? (
        <Text element="p" size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
          {t('playbooks.dryRun.empty')}
        </Text>
      ) : (
        <Box className="mt-2 space-y-1">
          {data.entries.map(entry => (
            <Box key={entry.targetId} display="flex" className="flex-wrap items-center gap-2">
              <Badge variant={entry.wouldSend ? 'success' : 'outline'}>
                {entry.wouldSend ? t('playbooks.dryRun.would') : t(`playbooks.dryRun.reasons.${entry.reason}`)}
              </Badge>
              <Text element="span" size="xs">
                {entry.label}
              </Text>
              {/* L'adresse EXACTE : c'est elle qui recevrait le message, et la
                  seule façon de repérer qu'on viserait la mauvaise personne. */}
              <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                {entry.recipient ?? t('playbooks.dryRun.noRecipient')}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {blocked.length > 0 ? (
        <Text element="p" size="xs" className="mt-2 text-[var(--bellum-text-secondary)]">
          {blocked.map(([reason, count]) => `${t(`playbooks.dryRun.reasons.${reason}`)} : ${count}`).join(' · ')}
        </Text>
      ) : null}
    </Box>
  )
}
