import { ranWithOlderProfile } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { History, UserCheck, UserX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useFirstName } from '@/hooks/useFirstName'
import { useProfileProvenance } from '@/features/accounts/hooks/useProfileProvenance'
import { useRefreshDimension } from '@/features/accounts/hooks/useRefreshDimension'

/**
 * Avec quel profil ce dossier a été produit (recette finale §6 et §13).
 *
 * Le §6 demande deux choses que cette ligne fait ensemble : nommer l'utilisateur
 * (« Théo, … ») et nommer son ESN (« avec le profil de Bellum »). Le §13 en
 * impose la contrepartie : « une analyse sans profil doit être marquée générique
 * et ne doit pas prétendre être personnalisée ».
 *
 * Le prénom vient de la SESSION, pas du dossier. C'est délibéré : un dossier est
 * lu par toute l'équipe, et un texte figé qui dirait « Théo » à sa collègue
 * nommerait la mauvaise personne. Le nom de l'ESN, lui, est bien porté par le run
 * — il appartient à l'espace de travail, il est donc vrai pour tous ses lecteurs.
 *
 * Rien ne s'affiche quand la provenance est inconnue : un dossier antérieur à la
 * traçabilité ne peut pas prouver sa personnalisation, et l'annoncer quand même
 * serait exactement la faute que le rapport reproche.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1816 — cette ligne n'a jamais eu son propre cadre bordé ; elle vivait déjà
 * SANS bordure ni fond, juste sous les deux cartes.
 * #3051 (retour bêta, 26/09/2026) — l'appel depuis `AccountContextBand` a été
 * retiré ce jour-là ; `AccountContextBand` elle-même a depuis disparu (#3161,
 * 28/09/2026). `AccountProfileProvenance` (plus bas) reste le point d'entrée
 * AUTONOME — exactement le même rendu, pour qui l'utilise seul.
 */
export function useAccountProfileProvenanceBand(accountId: string): React.ReactNode | null {
  const { t } = useTranslation('accountDetail', { keyPrefix: 'profileProvenance' })
  const { data } = useProfileProvenance(accountId)
  // Tous les hooks AVANT le premier retour conditionnel : `useFirstName` avait
  // été posé après, et l'ordre d'appel aurait changé d'un rendu à l'autre.
  const firstName = useFirstName()
  // #2306.25 — décision Louis 19/09 : PROPOSER le recalcul, coût affiché.
  // `useRefreshDimension` débite `targeted_refresh` sur une SEULE dimension
  // (`strategy` : angles, plan) — c'est elle que le profil ESN conditionne,
  // jamais les faits du compte, que rien n'a rendus périmés.
  const refreshStrategy = useRefreshDimension(accountId)

  if (!data) return null

  // ⚠️ Ce dossier a-t-il été produit avec un profil qui a changé depuis ?
  //
  // `esnProfileVersion` était figé sur chaque run depuis le premier jour et
  // n'avait AUCUN consommateur. Un dossier produit avec un ancien positionnement
  // se lisait donc exactement comme un dossier à jour — alors que ses angles,
  // ses contacts prioritaires et son plan viennent d'un profil qui n'est plus
  // celui de l'entreprise.
  //
  // Ce n'est PAS une erreur : le dossier reste valable. #2306.25 — PROPOSER le
  // recalcul avec son coût, jamais le lancer seul : le clic sur le bouton est
  // le SEUL geste qui débite (« rien ne part sans geste »).
  if (ranWithOlderProfile(data)) {
    const message = t('staleProfile', { firstName })
    const cta = t('staleProfileCta')
    return (
      // #2351 — `min-w-0` sur la ligne : enfant d'un cadre qui doit pouvoir
      // rétrécir dans la rangée compacte du dossier (`account-context-row`).
      <div className="flex min-w-0 items-start gap-2">
        <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warning-soft-text)]" />
        {/* #2351 — tronque en ellipse (jamais de retour à la ligne forcé de
            la recherche) ; le texte ENTIER reste accessible au survol
            (`title`), rien n'est retiré. */}
        <Text size="xs" noWrap title={`${message} ${cta}`} className="min-w-0 text-[var(--bellum-text-secondary)]">
          {message}{' '}
          <button
            type="button"
            className="underline hover:no-underline disabled:opacity-60 disabled:no-underline"
            disabled={refreshStrategy.isPending}
            onClick={() => refreshStrategy.mutate('strategy')}
          >
            {refreshStrategy.isPending ? t('staleProfileCtaPending') : cta}
          </button>
        </Text>
      </div>
    )
  }

  if (data.mode === 'personalised') {
    // Sans nom d'ESN sur le run, on ne fabrique pas « ton ESN » : on dit qu'un
    // profil a servi, sans prétendre savoir lequel.
    const label = data.esnName
      ? t('personalisedNamed', { firstName, esnName: data.esnName })
      : t('personalised', { firstName })
    return (
      <div className="flex min-w-0 items-start gap-2">
        <UserCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--success-soft-text)]" />
        {/* #2351 — mesuré en prod : c'est CETTE ligne (« Théo, ce dossier a
            été construit avec le profil de Bellum ») qui poussait la
            recherche à la ligne suivante sur un dossier avec bandeau de
            provenance. */}
        <Text size="xs" noWrap title={label} className="min-w-0 text-[var(--bellum-text-secondary)]">
          {label}
        </Text>
      </div>
    )
  }

  // #2453.7 / #2453.8 — générique PAR LE MODE du lancement : le libellé suit le
  // mode (brief de mission / critères neutres) et rien ne pousse à « compléter »
  // un profil qui a été écarté exprès, pas oublié.
  if (data.reason === 'context_mode' && data.contextMode && data.contextMode !== 'my_activity') {
    const byMode = t(`byMode.${data.contextMode}`, { firstName })
    return (
      <div className="flex min-w-0 items-start gap-2">
        <UserX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--bellum-text-secondary)]" />
        <Text size="xs" noWrap title={byMode} className="min-w-0 text-[var(--bellum-text-secondary)]">
          {byMode}
        </Text>
      </div>
    )
  }

  const message = t(`generic.${data.reason ?? 'no_profile'}`, {
    firstName,
    answered: data.answered,
    required: data.required,
  })
  const cta = t('completeCta')
  return (
    <div className="flex min-w-0 items-start gap-2">
      <UserX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warning-soft-text)]" />
      <Text size="xs" noWrap title={`${message} ${cta}`} className="min-w-0 text-[var(--bellum-text-secondary)]">
        {message}{' '}
        <Link to="/settings/profile" className="underline hover:no-underline">
          {cta}
        </Link>
      </Text>
    </div>
  )
}

/** Point d'entrée AUTONOME — même rendu que le hook, pour qui l'utilise seul. */
export function AccountProfileProvenance({ accountId }: { accountId: string }) {
  return useAccountProfileProvenanceBand(accountId)
}
