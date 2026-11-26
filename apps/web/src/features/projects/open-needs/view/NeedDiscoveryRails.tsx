import type { OpenNeedRow } from '@bellum/contracts'
import { Card, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { CheckCircle2, Circle, Compass, MinusCircle, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  buildNeedDiscoveryRails,
  buildNeedRailStates,
  CLIENT_RAIL_KEYS,
  CONSULTANT_RAIL_KEYS,
  needReadyToStart,
  type ClientRailKey,
  type ConsultantRailKey,
  type RailFactState,
} from '../model/need-discovery-rails'

/** #2175.30 — ce qui MANQUE : à vérifier ou bloquant. « Non applicable » n'est pas un manque. */
function openKeys<K extends string>(keys: readonly K[], states: Record<K, RailFactState>): K[] {
  return keys.filter(key => states[key] === 'to_verify' || states[key] === 'blocking')
}

/**
 * #2067.18-.30 — LES DEUX RAILS D'UNE AFFAIRE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE BLOC NE RÉ-AFFICHE AUCUNE VALEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * Le contexte, le budget, les exigences… sont DÉJÀ affichés plus haut sur cette
 * fiche (« LE POSTE », « CE QUE LE POSTE EXIGE »). Ce bloc ne les répète pas —
 * il dit seulement ce qui est MESURÉ et ce qui NE L'EST PAS, sur les deux
 * moitiés d'une affaire : ce qu'on sait du client, ce qu'on sait du
 * consultant. Voir le docblock de `need-discovery-rails.ts` pour la source de
 * chaque champ et pourquoi certains sont structurellement absents aujourd'hui.
 *
 * #2067.30 — LA CONCLUSION, PAS LA LISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un rail est un révélateur de trous » : la phrase qui compte est celle qui
 * nomme ce qui manque, pas celle qui coche ce qui est là. La checklist reste
 * visible (elle est ce qui rend la conclusion vérifiable), mais la conclusion
 * est écrite en clair sous chaque rail.
 *
 * #2175.30 / #2175.32 (épopée #2880, lot V33) — chaque fait porte l'un des
 * QUATRE états nommés (Confirmé / À vérifier / Bloquant / Non applicable),
 * écrit en toutes lettres à côté de son icône ; sous les deux conclusions, un
 * verdict unique : « prêt à démarrer » seulement si les DEUX rails sont
 * sécurisés, sinon ce qui reste, compté (`buildNeedRailStates`,
 * `needReadyToStart`).
 */
export function NeedDiscoveryRails({ need, now = new Date() }: { need: OpenNeedRow; now?: Date }) {
  const { t } = useTranslation('projects')
  const rails = buildNeedDiscoveryRails(need, now)
  const states = buildNeedRailStates(need, now)
  const missingClient = openKeys(CLIENT_RAIL_KEYS, states.client)
  const missingConsultant = openKeys(CONSULTANT_RAIL_KEYS, states.consultant)
  const readiness = needReadyToStart(states)
  const positioned = rails.positionedConsultant
  const othersCount = Math.max(0, rails.positionedConsultantsCount - (positioned ? 1 : 0))

  // #2067.25-.29 — le TITRE du rail consultant nomme le POSITIONNÉ, quand il y
  // en a un. `titleAnonymous` couvre la fiche sans nom (D366) : le rail existe
  // quand même, il ne peut simplement pas dire QUI.
  const consultantTitle = positioned
    ? t(
        positioned.consultantName
          ? 'needSheet.discoveryRails.consultant.titleNamed'
          : 'needSheet.discoveryRails.consultant.titleAnonymous',
        { name: positioned.consultantName },
      )
    : t('needSheet.discoveryRails.consultant.title')

  return (
    <Card className="p-4" data-testid="need-discovery-rails">
      <Text element="h2" size="sm" weight="semibold">
        {t('needSheet.discoveryRails.title')}
      </Text>
      <Text size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
        {t('needSheet.discoveryRails.subtitle')}
      </Text>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Rail
          titleKey="needSheet.discoveryRails.client.title"
          keys={CLIENT_RAIL_KEYS}
          states={states.client}
          labelKey={key => `needSheet.discoveryRails.client.${key}`}
        />
        <div>
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
            {consultantTitle}
          </Text>
          {othersCount > 0 && (
            <Text size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
              {t('needSheet.discoveryRails.consultant.andOthers', { count: othersCount })}
            </Text>
          )}
          {/* #2152.49 — « Reverse Market accessible depuis un besoin ». L'écran
              existe déjà pour un consultant précis (`/consultants/$id/reverse-market`,
              même lien que `RenewalDecisionPanel.tsx` / `VivierTableRow.tsx`) ;
              seul le POSITIONNÉ est un candidat non ambigu depuis une fiche de
              besoin — un simple shortlisté n'en est pas un (voir le docblock
              de `need-discovery-rails.ts`). */}
          {positioned && (
            <Link
              to="/consultants/$id/reverse-market"
              params={{ id: positioned.consultantId }}
              className="mt-1 inline-flex items-center gap-1.5 text-sm text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
            >
              <Compass className="size-3.5 shrink-0" aria-hidden="true" />
              {t('needSheet.discoveryRails.consultant.reverseMarket', {
                name: positioned.consultantName ?? t('needSheet.discoveryRails.consultant.titleAnonymous'),
              })}
            </Link>
          )}
          <RailList
            keys={CONSULTANT_RAIL_KEYS}
            states={states.consultant}
            labelKey={key => `needSheet.discoveryRails.consultant.${key}`}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1 border-t border-[var(--bellum-border)] pt-3">
        <Conclusion
          missing={missingClient}
          labelKey={key => t(`needSheet.discoveryRails.client.${key}`)}
          completeKey="needSheet.discoveryRails.conclusionClientComplete"
          missingKey="needSheet.discoveryRails.conclusionClient"
        />
        {/* #2067.25-.29 — DÉCISION Louis 17/09 : « aucun positionné » se dit EN
            CLAIR, distinct du « manque » générique qui suppose un consultant
            déjà sur l'affaire. */}
        {positioned == null ? (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('needSheet.discoveryRails.consultant.noPositioned')}
          </Text>
        ) : (
          <Conclusion
            missing={missingConsultant}
            labelKey={key => t(`needSheet.discoveryRails.consultant.${key}`)}
            completeKey="needSheet.discoveryRails.conclusionConsultantComplete"
            missingKey="needSheet.discoveryRails.conclusionConsultant"
          />
        )}
        <Text
          size="sm"
          weight="medium"
          className={readiness.ready ? 'text-[var(--success-soft-text)]' : 'text-[var(--bellum-text-secondary)]'}
        >
          {readiness.ready
            ? t('needSheet.discoveryRails.readiness.ready')
            : t('needSheet.discoveryRails.readiness.notReady', {
                // Un compte vide ne s'écrit pas : seules les parties non nulles sont dites.
                details: [
                  readiness.toVerify > 0
                    ? t('needSheet.discoveryRails.readiness.toVerify', { count: readiness.toVerify })
                    : null,
                  readiness.blocking > 0
                    ? t('needSheet.discoveryRails.readiness.blocking', { count: readiness.blocking })
                    : null,
                ]
                  .filter(Boolean)
                  .join(', '),
              })}
        </Text>
      </div>
    </Card>
  )
}

function Rail<K extends string>({
  titleKey,
  keys,
  states,
  labelKey,
}: {
  titleKey: string
  keys: readonly K[]
  states: Record<K, RailFactState>
  labelKey: (key: K) => string
}) {
  const { t } = useTranslation('projects')
  return (
    <div>
      <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
        {t(titleKey)}
      </Text>
      <RailList keys={keys} states={states} labelKey={labelKey} />
    </div>
  )
}

/** #2067.25-.29 — la LISTE seule, sans son titre : le rail consultant compose
 *  son titre à part (nom du positionné + « et N autres »), le rail client
 *  garde `Rail` tel quel. */
function RailList<K extends string>({
  keys,
  states,
  labelKey,
}: {
  keys: readonly K[]
  states: Record<K, RailFactState>
  labelKey: (key: K) => string
}) {
  const { t } = useTranslation('projects')
  return (
    <ul className="mt-1.5 flex flex-col gap-1">
      {keys.map(key => {
        const state = states[key]
        const done = state === 'confirmed' || state === 'not_applicable'
        return (
          <li key={key} className="flex items-center gap-1.5">
            <RailStateIcon state={state} />
            <Text size="sm" className={done ? 'text-[var(--bellum-text-primary)]' : 'text-[var(--bellum-text-muted)]'}>
              {t(labelKey(key))}
            </Text>
            <Text
              size="xs"
              className={
                state === 'blocking' ? 'text-[var(--warning-soft-text)]' : 'text-[var(--bellum-text-secondary)]'
              }
            >
              {t(`needSheet.discoveryRails.state.${state}`)}
            </Text>
          </li>
        )
      })}
    </ul>
  )
}

/** L'icône double l'état écrit, elle ne le remplace jamais (d'où `aria-hidden`). */
function RailStateIcon({ state }: { state: RailFactState }) {
  if (state === 'confirmed')
    return <CheckCircle2 className="size-3.5 shrink-0 text-[var(--success-soft-text)]" aria-hidden />
  if (state === 'blocking') return <XCircle className="size-3.5 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />
  if (state === 'not_applicable')
    return <MinusCircle className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
  return <Circle className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
}

function Conclusion<K extends ClientRailKey | ConsultantRailKey>({
  missing,
  labelKey,
  completeKey,
  missingKey,
}: {
  missing: K[]
  labelKey: (key: K) => string
  completeKey: string
  missingKey: string
}) {
  const { t } = useTranslation('projects')
  if (missing.length === 0) {
    return (
      <Text size="sm" className="text-[var(--success-soft-text)]">
        {t(completeKey)}
      </Text>
    )
  }
  return (
    <Text size="sm" className="text-[var(--warning-soft-text)]">
      {t(missingKey, { fields: missing.map(labelKey).join(', ') })}
    </Text>
  )
}
