import type { NeedVerdictProfile } from '@bellum/contracts'
import { Button, Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useNeedVerdict } from '../hooks/useNeedVerdict'
import { matchInClearLabel } from '../model/match-in-clear-label'

/**
 * LES PROFILS QUI PASSENT LE SEUIL — trois cartes, et leur LECTURE D'ACCEPTATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QUI CLASSE CES PERSONNES, ET CE QUI NE LES CLASSE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ordre est celui du rapprochement (`match_run_entries.rank`), produit par un
 * moteur qui ne reçoit AUCUNE identité — ni nom, ni photo, ni date de
 * naissance, ni adresse (`matchCandidateSchema`). Le nom arrive APRÈS le
 * classement, uniquement pour DÉSIGNER la personne : c'est l'une des deux
 * exceptions nommées de `c58_criteres_proteges`.
 *
 * L'initiale de l'avatar est tirée du nom déjà affiché — elle n'ajoute aucune
 * donnée, et surtout ce n'est pas une photo : une photo s'affiche sur une fiche,
 * elle n'ordonne pas des gens, et il n'y en a aucune ici.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LE CONSENTEMENT S'AFFICHE, IL NE BLOQUE PAS ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * La nuance a été tranchée le 28/08 (`c45_consentement_positionnement`) :
 *
 *  - un consentement **EXPIRÉ** refuse un positionnement — le seul refus dur du
 *    produit ;
 *  - un consentement **JAMAIS RECUEILLI** AVERTIT et laisse passer, avec
 *    l'avertissement visible et la décision journalisée.
 *
 * Cet écran n'est ni l'un ni l'autre : il PRÉPARE. La porte reste
 * `submissionPreflight`, au moment du positionnement, et ces cartes ne font que
 * la rendre lisible en amont — « Expire dans 28 j » est un AVERTISSEMENT, pas
 * un blocage. Aucun profil n'est masqué à cause de son consentement : le cacher
 * ferait disparaître quelqu'un sans dire pourquoi, quand le geste utile est de
 * relancer la demande d'accord.
 */
export function NeedVerdictProfiles({ needId, onCompare }: { needId: string; onCompare: () => void }) {
  const { t } = useTranslation('projects')
  const { profiles, isLoading, isError } = useNeedVerdict(needId)

  if (isLoading || isError || profiles.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <Text element="h2" size="sm" weight="semibold">
        {t('needVerdict.profilesTitle', { count: profiles.length })}
      </Text>
      {/* GA-28 : une colonne au téléphone, la grille ne se fige qu'au-delà. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {profiles.map(profile => (
          <ProfileCard key={profile.consultantId} profile={profile} onCompare={onCompare} />
        ))}
      </div>
    </section>
  )
}

function ProfileCard({ profile, onCompare }: { profile: NeedVerdictProfile; onCompare: () => void }) {
  const { t } = useTranslation('projects')
  const { t: tMatching } = useTranslation('matching')
  const consentTone = profile.consentState === 'valid' ? 'success' : 'warning'
  const inClear = profile.inClear
    ? matchInClearLabel(
        profile.inClear,
        axis => tMatching(`axes.${axis}`),
        (key, list) => t(`needSheet.inClear.${key}`, { list }),
      )
    : null

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        {/* Une initiale, pas une photo — et `aria-hidden` : le nom qui suit la
            porte déjà, la relire ferait entendre « S Sophie Martin ». */}
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--bellum-surface-2)] text-sm text-[var(--bellum-text-secondary)]"
        >
          {profile.fullName.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <Text size="sm" weight="semibold" className="block truncate">
            {profile.fullName}
          </Text>
          {/* Refonte Théo (décision Louis, 23/10) — plus AUCUN score en points : la correspondance s'écrit
              en mots, lue sur les axes du même rapprochement. Sans lecture (API plus ancienne), on se tait. */}
          {inClear ? (
            <Text
              size="xs"
              className="block text-[var(--bellum-text-secondary)]"
              data-testid="verdict-profile-in-clear"
            >
              {inClear}
            </Text>
          ) : null}
        </div>
      </div>

      <div>
        <Text size="xs" weight="medium" className="block text-[var(--bellum-text-muted)]">
          {t('needVerdict.acceptanceReading')}
        </Text>
        {/* Des FAITS, chacun tiré d'une donnée qu'on peut montrer. Une lecture
            vide reste VIDE : on n'écrit pas « rien à signaler », qui affirmerait
            qu'on a regardé. */}
        <Text size="sm" className="mt-1 block">
          {profile.acceptance.length === 0
            ? t('needVerdict.acceptanceUnknown')
            : profile.acceptance
                .map(item =>
                  // ⚠️ `count` n'est passé QUE lorsqu'il existe. Un `?? 0` de
                  // repli mettrait « Déjà acceptée 0 fois ici » sur un fait qui
                  // n'a jamais eu de compte — et c'est précisément le geste que
                  // GA-19 compte, à juste titre : le zéro serait une
                  // affirmation, pas une absence.
                  item.count === null
                    ? t(`needVerdict.fact.${item.fact}`)
                    : t(`needVerdict.fact.${item.fact}`, { count: item.count }),
                )
                .join(' · ')}
        </Text>
      </div>

      <span
        className={`self-start rounded-full px-2 py-0.5 text-xs ${
          consentTone === 'success'
            ? 'bg-[var(--success-soft-bg)] text-[var(--success-soft-text)]'
            : 'bg-[var(--warning-soft-bg)] text-[var(--warning-soft-text)]'
        }`}
      >
        {profile.consentState === 'expiring' && profile.consentDaysLeft !== null
          ? t('needVerdict.consent.expiring', { count: profile.consentDaysLeft })
          : t(`needVerdict.consent.${profile.consentState}`)}
      </span>

      <div className="mt-auto flex flex-wrap gap-2">
        {/* « Préparer le dossier » et « Comparer » mènent au MÊME endroit : le
            tiroir de rapprochement, qui porte déjà les deux gestes (dossier de
            compétences, tableau de comparaison). Les recoder ici ferait deux
            chemins d'écriture pour un seul objet — et le tiroir est le seul à
            demander le consentement au bon moment. */}
        <Button size="sm" className="pointer-coarse:min-h-11" onClick={onCompare}>
          {t('needVerdict.prepareDossier')}
        </Button>
        <Button size="sm" variant="outline" className="pointer-coarse:min-h-11" onClick={onCompare}>
          {t('needVerdict.compare')}
        </Button>
      </div>
    </Card>
  )
}
