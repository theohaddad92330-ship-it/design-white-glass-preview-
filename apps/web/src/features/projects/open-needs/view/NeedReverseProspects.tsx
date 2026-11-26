import { Badge, Card, Text } from '@bellum/ui'
import { Compass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { useReverseProspects } from '../hooks/useReverseProspects'
import type { ReverseProspectMatch } from '../api'

/**
 * « UN BESOIN SANS CANDIDAT OUVRE UNE PISTE » — l'écran s'arrêtait là.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `ReverseProspectsSection` (`features/accounts/.../plan/`) existe déjà et
 * porte le même NOM de famille — mais elle répond à une autre question : qui a
 * TRAVAILLÉ chez CE compte et est ailleurs aujourd'hui (des personnes). Ici, la
 * question est : quels AUTRES COMPTES cherchent la MÊME compétence dans la
 * MÊME zone (des pistes de vente). Deux données, deux périmètres, aucun code
 * commun au-delà du nom — voir le docblock de `reverse-need-prospects.ts`
 * côté serveur pour le détail.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ, ET POURQUOI PAS DANS LE TIROIR DE RAPPROCHEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le tiroir (`MatchDrawer`, module `matching`) est un `Sheet` — portalé,
 * plein écran, hors périmètre de ce lot. Rien rendu à côté de lui n'est
 * visible tant qu'il reste ouvert. Cette section vit donc sur l'onglet « Vue
 * d'ensemble », déclenchée par le MÊME signal que la troisième porte
 * (`NeedConsultantDoor`) : `shortlist_count === 0`, l'alerte du §16 — « la
 * requête a compté les positionnements, elle a trouvé personne ». Les deux
 * réponses à « personne n'est présenté » restent ainsi voisines : en
 * connaître un·e (la porte), ou regarder ailleurs (cette section).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE LISTE VIDE N'EST PAS UN ÉCHEC
 * ─────────────────────────────────────────────────────────────────────────────
 * `unavailableReason` distingue deux vides qui NE se ressemblent PAS : le
 * croisement n'a pas pu tourner (zone ou compétences absentes du besoin — une
 * dimension manquante rendrait une liste au hasard) contre le croisement A
 * tourné et n'a trouvé personne (une vraie réponse : personne d'autre ne
 * cherche ce profil ici, pour l'instant).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN COMPTE DÉJÀ CONNU LE DIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `already_in_portfolio` (portefeuille = `accounts.assigned_to`, voir le
 * docblock du champ côté entité) s'affiche TOUJOURS quand il est vrai. Un
 * commercial qui clique sur une « piste » et retombe sur son propre client
 * perd confiance dans tout l'écran.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE GESTE S'ARRÊTE À OUVRIR UN COMPTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un lien, rien de plus — pas d'envoi, pas d'écriture. Une lecture cassée ne
 * se rend PAS comme « personne d'autre » : elle ne dit rien plutôt que
 * d'inventer un silence, et le bloc reste discret sur un raté — il est une
 * piste supplémentaire, pas le cœur de la fiche.
 */
export function NeedReverseProspects({ needId }: { needId: string }) {
  const { t } = useTranslation('projects')
  const { data, isPending, isError } = useReverseProspects(needId, true)

  if (isPending) {
    return (
      <Card className="p-4" data-testid="need-reverse-prospects">
        <Header t={t} />
        <Text size="sm" className="mt-1 text-[var(--bellum-text-muted)]">
          {t('needReverseProspects.loading')}
        </Text>
      </Card>
    )
  }

  if (isError || !data) return null

  if (data.unavailableReason) {
    return (
      <Card className="p-4" data-testid="need-reverse-prospects">
        <Header t={t} />
        <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t(`needReverseProspects.unavailable.${data.unavailableReason}`)}
        </Text>
      </Card>
    )
  }

  return (
    <Card className="p-4" data-testid="need-reverse-prospects">
      <Header t={t} />
      <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('needReverseProspects.subtitle', { skills: data.skillTerms.join(' · '), location: data.location })}
      </Text>

      {data.matches.length === 0 ? (
        <Text size="sm" className="mt-2 text-[var(--bellum-text-secondary)]">
          {t('needReverseProspects.empty')}
        </Text>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--bellum-border)]">
          {data.matches.map(match => (
            <ProspectRow key={match.need_id} match={match} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function Header({ t }: { t: (key: string) => string }) {
  return (
    <div className="flex items-center gap-2">
      <Compass className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
      <Text element="h3" size="sm" weight="semibold">
        {t('needReverseProspects.title')}
      </Text>
    </div>
  )
}

function ProspectRow({ match }: { match: ReverseProspectMatch }) {
  const { t } = useTranslation('projects')
  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/accounts/$id"
          params={{ id: match.account_id }}
          className="min-w-0 truncate text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
        >
          {match.account_name}
        </Link>
        {match.already_in_portfolio ? (
          <Badge variant="outline">{t('needReverseProspects.alreadyInPortfolio')}</Badge>
        ) : null}
      </div>
      <Text size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
        {match.need_title}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('needReverseProspects.sharedSkill', {
          count: match.shared_skills.length,
          skills: match.shared_skills.join(' · '),
        })}
      </Text>
    </li>
  )
}
