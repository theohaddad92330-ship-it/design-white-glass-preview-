import {
  PO_AMENDMENT_ALERT_PERCENT,
  poAmendmentFacts,
  poConsumptionAlert,
  type MissionCommercialTerms,
  type PoAmendmentFacts,
} from '@bellum/contracts'
import { Box, Button, Text, UsageBar } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'

/**
 * LA BARRE DE CONSOMMATION D'UN BON DE COMMANDE — « 28 / 50 jours » (PDF-22 §7),
 * et son ALERTE D'ANTICIPATION (PDF-06 §1.3, PDF-07 §2.6).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX HÔTES, UN SEUL RENDU (01/09/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * Monté par `MissionDetailPanel.tsx` (panneau de la planification) ET par
 * `MissionDetailTabs.tsx` (le contenu guardé par GA-83 — tiroir et dossier).
 * Il portait à l'origine sa PROPRE copie (`PoConsumptionBlock`), écrite parce
 * que `MissionDetailTabs.tsx` était hors périmètre d'un lot antérieur et que
 * cette copie n'y était pas exportée. Le lot suivant a ajouté le seuil
 * d'anticipation ICI sans le reporter là-bas — loi 4 du tome 7 violée en
 * pratique : les deux mirroirs ne disaient plus la même chose de la même
 * mission, le tiroir/dossier restant aux trois états d'origine. Corrigé en
 * import direct : il n'y a maintenant plus qu'UN rendu, monté aux deux
 * endroits.
 *
 * Ce composant ne RECALCULE rien : `poVolumeDays`, `poConsumedDays` et
 * `poConsumption` arrivent déjà calculés depuis `GET /delivery/missions/:id/terms`
 * (`poConsumption()`, `staffing.ts`), lu via `useMissionTerms`. Les deux rendus
 * partagent donc la même DONNÉE et la même DÉRIVATION (GA-26).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT : L'ANTICIPATION
 * ─────────────────────────────────────────────────────────────────────────
 * Les trois états d'origine se lisent tous APRÈS coup — quand la barre annonce
 * un dépassement, les jours ont déjà été travaillés hors bon de commande et la
 * conversation avec le client se tient en position de demandeur. Le seuil de
 * {@link PO_AMENDMENT_ALERT_PERCENT} % ajoute le seul état qui vaut de
 * l'argent : **prévenir avant**.
 *
 * ⚠️ Le seuil ne vit PAS ici. Un `0.9` au milieu d'un composant est un réglage
 * sans nom, qu'on retrouve à deux endroits sur trois le jour où quelqu'un veut
 * 85 %. Il vit dans `mission-po-alert.ts`, avec sa raison (GA-26).
 *
 * ⚠️ Et un bon de commande sans volume connu N'EST PAS « à 0 % ». C'est le
 * piège que `poConsumptionAlert` refuse : le zéro tomberait du bon côté — vert,
 * rassurant — sur exactement le cas où personne ne sait rien.
 */
export function PoConsumptionBar({ terms }: { terms: MissionCommercialTerms | null | undefined }) {
  const { t } = useTranslation('missions')
  const volumeDays = terms?.poVolumeDays ?? null
  const consumedDays = terms?.poConsumedDays ?? null
  const consumption = terms?.poConsumption ?? null
  const alert = poConsumptionAlert({ volumeDays, consumption })

  if (volumeDays === null) {
    return <UnknownValue reason={t('finance.po.volumeUnknown')} />
  }
  if (consumedDays === null || !consumption) {
    return <UnknownValue reason={t('finance.po.consumptionUnmeasured')} />
  }

  const facts = poAmendmentFacts({
    missionLabel: null,
    poNumber: terms?.poNumber,
    volumeDays,
    consumedDays,
    consumption,
  })

  return (
    <Box className="space-y-1">
      <UsageBar
        label={t('finance.po.consumedLabel', { percent: consumption.percent })}
        current={consumedDays}
        max={volumeDays}
        size="sm"
      />
      {alert === 'overrun' ? (
        <Text element="p" size="xs" color="text-[var(--danger-soft-text)]">
          {t('finance.po.overrun', { count: Math.abs(consumption.remainingDays) })}
        </Text>
      ) : null}
      {alert === 'approaching' ? (
        // Le fait, puis le geste. « Il reste 4 jours » sans « demande l'avenant »
        // est une réponse juste sans chemin — un défaut déjà payé ici.
        <Text element="p" size="xs" color="text-[var(--warning-soft-text)]">
          {t('finance.po.approaching', {
            threshold: PO_AMENDMENT_ALERT_PERCENT,
            count: consumption.remainingDays,
          })}
        </Text>
      ) : null}
      {(alert === 'approaching' || alert === 'overrun') && facts ? <AmendmentRequest facts={facts} /> : null}
      <OtherPoMissions terms={terms} />
    </Box>
  )
}

/**
 * #2422.7 — LES AUTRES MISSIONS DU MÊME BON DE COMMANDE.
 *
 * Une LISTE, jamais une ligne « aucune autre mission » : `poOtherMissions`
 * DÉRIVE déjà à `[]` côté serveur quand rien ne le partage, et la doctrine
 * « on n'affiche pas ce qu'on n'a pas » veut qu'une liste vide ne rende AUCUNE
 * ligne — pas de bandeau qui répète l'absence.
 */
function OtherPoMissions({ terms }: { terms: MissionCommercialTerms | null | undefined }) {
  const { t } = useTranslation('missions')
  const others = terms?.poOtherMissions ?? []
  if (others.length === 0) return null

  return (
    <Box className="space-y-1">
      <Text element="p" size="xs" color="text-muted-foreground">
        {t('finance.po.otherMissions.title')}
      </Text>
      <ul className="space-y-0.5">
        {others.map(other => (
          <li key={other.missionId}>
            <Text element="span" size="xs">
              {t('finance.po.otherMissions.item', { missionLabel: other.missionLabel, accountName: other.accountName })}
            </Text>
          </li>
        ))}
      </ul>
    </Box>
  )
}

/**
 * « DEMANDER L'AVENANT » — qui PRÉPARE, et n'envoie rien.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ AUCUN CHEMIN D'ÉCRITURE, ET CE N'EST PAS UNE CONVENTION
 * ─────────────────────────────────────────────────────────────────────────
 * Ce composant n'appelle AUCUNE mutation, n'ouvre AUCUNE route, n'écrit nulle
 * part. Il compose un texte à partir de chiffres déjà calculés et le donne à
 * copier. Le produit prépare, le commercial envoie — et il n'y a pas de code
 * capable de faire autrement.
 *
 * ⚠️ Le produit sait déjà REPÉRER un avenant qui arrive par e-mail
 * (`mail-query.ts`, `routine-catalog.ts`). Ce n'est pas la même capacité, et
 * rien de cette lecture n'est recodé ici.
 *
 * ⚠️ Le texte se compose depuis les catalogues i18n, jamais dans le contrat :
 * une phrase française rendue par le serveur ne se traduirait jamais, et le
 * produit parle deux langues.
 */
function AmendmentRequest({ facts }: { facts: PoAmendmentFacts }) {
  const { t } = useTranslation('missions')
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const body = [
    t('finance.po.amendment.line1', {
      consumed: facts.consumedDays,
      volume: facts.volumeDays,
      percent: facts.percent,
    }),
    // La référence du bon de commande n'est PAS inventée : sans elle, la phrase
    // le dit plutôt que d'écrire « bon de commande n° — ».
    facts.poNumber
      ? t('finance.po.amendment.line2', { poNumber: facts.poNumber })
      : t('finance.po.amendment.line2NoNumber'),
    facts.remainingDays < 0
      ? t('finance.po.amendment.line3Overrun', { count: Math.abs(facts.remainingDays) })
      : t('finance.po.amendment.line3', { count: facts.remainingDays }),
    t('finance.po.amendment.line4'),
  ].join('\n')

  return (
    <Box className="space-y-1">
      {/* Un `<button>`, jamais un `<div onClick>` : ce qui se clique se tabule,
          s'active à Entrée et s'annonce (GA-35). */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="pointer-coarse:min-h-11"
        onClick={() => setOpen(v => !v)}
      >
        {open ? t('finance.po.amendment.hide') : t('finance.po.amendment.prepare')}
      </Button>
      {open ? (
        <Box className="rounded-md border border-border bg-card p-2">
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('finance.po.amendment.hint')}
          </Text>
          <Text element="p" size="xs" className="mt-1 whitespace-pre-line">
            {body}
          </Text>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 pointer-coarse:min-h-11"
            onClick={() => {
              // Un presse-papiers indisponible (contexte non sécurisé, refus du
              // navigateur) ne se rend pas comme un succès : le libellé ne
              // change que si la copie a réellement eu lieu.
              void navigator.clipboard
                ?.writeText(body)
                .then(() => setCopied(true))
                .catch(() => setCopied(false))
            }}
          >
            {copied ? t('finance.po.amendment.copied') : t('finance.po.amendment.copy')}
          </Button>
        </Box>
      ) : null}
    </Box>
  )
}
