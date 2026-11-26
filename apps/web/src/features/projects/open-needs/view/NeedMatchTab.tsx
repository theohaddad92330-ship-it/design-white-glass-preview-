import { useEffect, useMemo, useRef } from 'react'
import type { OpenNeedRow } from '@bellum/contracts'
import { Link } from '@tanstack/react-router'
import { Button, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useRunMatch } from '@/features/matching/hooks'
import { MatchDrawer } from '@/features/matching/view/MatchDrawer'
import { MatchDirectionSwitch } from '@/features/matching/view/MatchDirectionSwitch'

/**
 * L'ONGLET RAPPROCHEMENT d'une fiche de besoin.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL MONTE `MatchDrawer`, IL NE LE RÉÉCRIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `MatchDrawer` est DÉJÀ scopé sur un `needId` — c'est le même composant que la
 * liste des besoins ouvre par `?match=…` (`OpenNeedsPage`). Rien à recomposer :
 * seul le DÉCLENCHEMENT change de forme, un paramètre d'URL devient un onglet
 * cliqué.
 *
 * ⚠️ Lancer un matching est une MUTATION qui écrit un JOURNAL (docblock de
 * `useRunMatch`) — elle doit rester déclenchée par l'utilisateur. Ouvrir cet
 * onglet EST ce geste, exactement comme arriver avec `?match=<id>` en est un
 * sur la liste. Le `ref` empêche de la relancer à chaque re-rendu tant que le
 * besoin ne change pas — la même garde que `OpenNeedsPage`.
 *
 * ⚠️ Aucun rapprochement ne se lance sur un besoin sans compétence : le bouton
 * « Lancer le matching » de l'en-tête le refuse déjà (`disabled` + tooltip),
 * et cet onglet dit la MÊME raison plutôt que d'interroger le moteur dans le
 * vide.
 */
export function NeedMatchTab({ need, onClose }: { need: OpenNeedRow; onClose: () => void }) {
  const { t } = useTranslation('matching')
  const runMatch = useRunMatch()
  const launchedFor = useRef<string | null>(null)
  const hasSkills = need.skills.length > 0

  useEffect(() => {
    if (!hasSkills) return
    if (launchedFor.current === need.id) return
    launchedFor.current = need.id
    runMatch.mutate(need.id, { onError: error => toast.error(error.message) })
    // `runMatch` change d'identité à chaque rendu (comme dans `OpenNeedsPage`,
    // qui suit le même patron) : le `ref` ci-dessus est ce qui empêche de
    // relancer la mutation, pas la liste de dépendances.
  }, [need.id, hasSkills, runMatch])

  const identities = useMemo(
    () =>
      new Map(
        (runMatch.data?.identities ?? []).map(entry => [
          entry.consultantId,
          {
            fullName: entry.fullName,
            title: entry.title,
            dailyRateCents: entry.dailyRateCents,
            availableFrom: entry.availableFrom,
            location: entry.location,
            // #2176.55 — présent seulement sous `finance:read` (l'API omet la clé sinon).
            ...(entry.finance ? { finance: entry.finance } : {}),
          },
        ]),
      ),
    [runMatch.data],
  )

  if (!hasSkills) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {t('launch.noSkills')}
      </Text>
    )
  }

  // Théo C projects-rapprochement.HT-7 — l'autre sens (Consultant → besoins) propose les profils DÉJÀ rapprochés par ce run.
  const consultantPicker = [...identities.entries()].slice(0, 8).map(([consultantId, identity]) => (
    <Link key={consultantId} to="/consultants/$id/reverse-market" params={{ id: consultantId }}>
      <Button size="sm" variant="outline">
        {identity.fullName ?? t('direction.unnamed')}
      </Button>
    </Link>
  ))

  return (
    <>
      <MatchDirectionSwitch
        current="need"
        picker={
          consultantPicker.length > 0 ? (
            consultantPicker
          ) : (
            <Text size="sm" className="text-[var(--bellum-text-muted)]">
              {t('direction.noPicker')}
            </Text>
          )
        }
      />
      <MatchDrawer
        run={runMatch.data ?? null}
        needId={need.id}
        identities={identities}
        // #2178.20/.21 — cet onglet connaît déjà le besoin ENTIER (`need`,
        // prop de ce composant) : le geste « Refuser le besoin » du panneau
        // zéro-résultat s'en sert directement, sans un second appel.
        need={need}
        open
        onOpenChange={next => {
          // Fermer le tiroir (croix, Échap, clic hors panneau) ramène à l'onglet
          // par défaut plutôt que de laisser un onglet « Rapprochement » actif
          // au-dessus d'un tiroir fermé — un état que personne ne demande.
          if (!next) onClose()
        }}
      />
    </>
  )
}
