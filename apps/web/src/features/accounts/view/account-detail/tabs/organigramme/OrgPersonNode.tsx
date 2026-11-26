import { readOrgFreshness, type Contact } from '@bellum/contracts'
import { RoleHint } from '@/components/contacts/RoleHint'
import { Badge, Text, cn } from '@bellum/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatCalendarDate } from '@/lib/deadline'
import { EstimatedBadge } from '@/components/primitives/EstimatedBadge'
import { OrgCardCoordinates } from './OrgCardCoordinates'
import { OrgCrmMatchBadge } from './OrgCrmMatchBadge'
import type { CrmMatchStatus } from './organigrammeData'
import { OrgKnownMarker } from './OrgKnownMarker'
import { OrgLinkMarker } from './OrgLinkMarker'
import { OrgSourceChips } from './OrgSourceChips'
import type { FocalPersonCard } from './focalOrgData'

/**
 * LA CARTE D'UNE PERSONNE, telle que la maquette Hiérarchie la dessine.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE SEULE CARTE POUR DEUX VUES
 * ─────────────────────────────────────────────────────────────────────────
 * La vue Hiérarchie la rend en lecture ; le mode Édition rend la MÊME carte,
 * avec un pied de carte qui porte les gestes de réarrangement. Deux composants
 * auraient divergé au premier ajout de champ — et la loi 4 du tome 7 dit
 * exactement cela : rien n'apparaît deux fois sous la même forme.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES DEUX AXES, ET POURQUOI ILS NE SE MÉLANGENT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * · La POSITION de la carte vient de son niveau L0-L4, décidée par la rangée
 *   qui la contient — jamais par un rôle (GA-100).
 * · Les RÔLES sont des étiquettes posées dessus. Ce sont les huit rôles bruts du
 *   contrat (`orgDecisionRoleSchema`), ceux que la maquette 02 affiche, et pas
 *   un second vocabulaire : la carte les transporte depuis `focalOrgData`.
 *
 * ⚠️ **Aucun critère protégé n'entre ici.** Ni photo, ni âge, ni genre, ni
 * nationalité — et la question n'est pas seulement « est-ce affiché ? » mais
 * « est-ce que ça ORDONNE des gens ? ». La carte ne porte que l'identité, la
 * fonction, l'entité, le niveau, les rôles et les preuves ; l'ordre des cartes
 * est celui de `focalOrgData` (niveau, puis confiance, puis nom).
 */
export function OrgPersonNode({
  person,
  footer,
  selected = false,
  className,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  onOpen,
  opens = 'contact',
  contact,
  crmMatch,
}: {
  person: FocalPersonCard
  /** AM.27 — correspondance CRM de la personne ; `null`/absent = contacts non chargés, aucun badge. */
  crmMatch?: CrmMatchStatus | null
  /** Louis 22/10 (carte personne enrichie) — la fiche réelle derrière la carte : ses coordonnées se lisent en un coup d'œil. */
  contact?: Contact
  /** #4049.1 — ouvre la fiche du contact réel derrière la carte (même geste que la vue focale, #3019).
   *  Absent = carte inerte : jamais un clic qui mène nulle part. */
  onOpen?: () => void
  /** #4061 — ce que le geste ouvre : la fiche du contact, ou le panneau personne d'un nœud sans fiche. */
  opens?: 'contact' | 'person'
  /** Les gestes du mode Édition. Absent en lecture : la carte reste inerte. */
  footer?: ReactNode
  selected?: boolean
  className?: string
  draggable?: boolean
  onDragStart?: () => void
  onDragOver?: (event: { preventDefault: () => void }) => void
  onDrop?: () => void
}) {
  const { t } = useTranslation('accountOrg')
  // #2553.3 — un fait périmé redevient inconnu AVEC SA DATE (doctrine
  // « on archive, on ne supprime pas »). `stale` seulement : `fresh` n'a rien
  // à dire, et `never_verified` est l'état par défaut de tout contact que
  // personne n'a déclaré — l'afficher partout noierait le signal que ce lot
  // ajoute (un organigramme importé daté, devenu ancien).
  const freshness = readOrgFreshness(person.lastVerifiedAt, new Date())
  return (
    <div
      data-org-person={person.id}
      draggable={draggable || undefined}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      // #4049.1 — la carte entière s'ouvre, au clic comme au clavier (Entrée / Espace).
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={
        onOpen
          ? t(opens === 'person' ? 'focal.openPersonAria' : 'focal.openContactAria', { name: person.fullName })
          : undefined
      }
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onOpen()
              }
            }
          : undefined
      }
      className={cn(
        'min-w-[13rem] max-w-[18rem] rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3',
        person.attenuated && 'opacity-60',
        onOpen &&
          'cursor-pointer outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--bellum-text-primary)_4%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]',
        selected && 'border-[var(--bellum-text-accent)] ring-1 ring-[var(--bellum-text-accent)]',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {/* #2515 — même défaut que `FocalOrgView.PersonCard` : la pilule
            (`w-fit whitespace-nowrap`) sortait de la carte (`max-w-[18rem]`)
            dès qu'un nom d'entité était long. `max-w-full truncate` la borne ;
            le nom entier reste lisible au survol. */}
        {person.entityName ? (
          <Badge variant="outline" title={person.entityName} className="max-w-full truncate">
            {person.entityName}
          </Badge>
        ) : null}
        {/* Le niveau est écrit sur la carte EN PLUS d'être sa rangée : sur un
            écran étroit, la colonne des libellés se replie et la position seule
            ne dirait plus rien. Une personne sans niveau n'en affiche aucun —
            « non rangée » n'est pas « rangée en bas ». */}
        {person.level ? <Badge variant="outline">{person.level}</Badge> : null}
      </div>
      <Text size="sm" weight="semibold" className="mt-1.5 text-[var(--bellum-text-primary)]">
        {person.fullName}
      </Text>
      {person.title ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {person.title}
        </Text>
      ) : null}

      <OrgRoleChips person={person} />

      {/* Louis 22/10 — coordonnées en un coup d'œil (icônes) ; sans fiche réelle, aucune icône. */}
      {contact ? <OrgCardCoordinates contact={contact} /> : null}

      <OrgKnownMarker known={person.known} />
      {/* AM.27 — le même repère CRM que la vue focale : connue / incertaine / détectée, non retrouvée.
          Absent (contacts non chargés) = aucun badge. */}
      <OrgCrmMatchBadge status={crmMatch} />

      {/* « Aucun trait : relation non prouvée. Le silence est un état correct. »
          On n'écrit donc RIEN quand le graphe ne porte pas de rattachement. */}
      {person.reporting ? (
        <>
          <OrgLinkMarker origin={person.reporting.linkOrigin} sources={person.reporting.sources} />
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {person.reporting.origin === 'inferred'
              ? t('focal.reportsToInferred', { name: person.reporting.managerName })
              : person.reporting.origin === 'hypothesis'
                ? t('focal.reportsToAssumed', { name: person.reporting.managerName })
                : person.reporting.verified
                  ? t('focal.reportsToVerified', { name: person.reporting.managerName })
                  : t('focal.reportsToProbable', {
                      name: person.reporting.managerName,
                      confidence: person.reporting.confidence,
                    })}
          </Text>
          {/* #4016 L4.2 — une arête déduite des intitulés se BADGE, toujours. */}
          {person.reporting.origin === 'inferred' ? <EstimatedBadge kind="probable" /> : null}
        </>
      ) : null}

      {person.attenuated ? (
        <Text size="xs" className="mt-1 text-[var(--danger-soft-text)]">
          {t('focal.blockerKeptInStructure')}
        </Text>
      ) : null}

      {person.sources.length > 0 ? (
        <OrgSourceChips sources={person.sources} max={2} />
      ) : (
        <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]" title={t('focal.noSourceReason')}>
          {t('focal.noSource')}
        </Text>
      )}

      {/* Louis 22/10 — la date de vérification du poste, toujours dite quand on l'a ; périmée, elle l'est en alerte. */}
      {freshness.state !== 'stale' && person.lastVerifiedAt ? (
        <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
          {t('focal.verifiedOn', {
            date: formatCalendarDate(person.lastVerifiedAt.slice(0, 10)) ?? person.lastVerifiedAt.slice(0, 10),
          })}
        </Text>
      ) : null}

      {freshness.state === 'stale' ? (
        <Text size="xs" className="mt-1 text-[var(--bellum-warning-text)]">
          {/* #3434 (recette prod 26755bbac3, lot C1, 30/09) — jamais la date
              ISO brute : la même mise en forme que partout ailleurs. */}
          {t('focal.staleInfo', {
            date: formatCalendarDate(freshness.lastVerifiedAt!.slice(0, 10)) ?? freshness.lastVerifiedAt!.slice(0, 10),
          })}
        </Text>
      ) : null}

      {footer}
    </div>
  )
}

/**
 * Les RÔLES BRUTS, en étiquettes — les huit du contrat, ceux de la maquette 02.
 *
 * ⚠️ `unknown` est un rôle NOMMÉ (« le générateur n'a rien pu établir »), pas un
 * rôle de décision : l'afficher à côté de « champion » le ferait lire comme une
 * posture. Il est donc rendu à part, en toutes lettres, plutôt que masqué —
 * masquer effacerait la seule chose que le graphe affirme sur cette personne.
 *
 * Aucun rôle du tout ⇒ on le DIT. Une carte silencieuse se lirait « rôle neutre »,
 * là où la vérité est « ce rôle n'a pas été établi ».
 */
function OrgRoleChips({ person }: { person: FocalPersonCard }) {
  const { t } = useTranslation('accountOrg')
  const known = person.roles.filter(role => role !== 'unknown')
  if (known.length === 0) {
    return (
      <Text size="xs" className="mt-1.5 text-[var(--bellum-text-muted)]">
        {t('hierarchy.roleUnknown')}
      </Text>
    )
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {known.map(role => (
        // Le libellé vient du catalogue de correction — LE vocabulaire des rôles
        // de ce produit, celui que le tiroir propose et que l'API accepte.
        <RoleHint key={role} role={role}>
          <Badge variant={role === 'blocker' ? 'danger' : 'outline'}>{t(`correction.roles.${role}`)}</Badge>
        </RoleHint>
      ))}
      {/* « ✓ si inféré », toujours : un rôle lu sur un titre n'est pas un rôle
          observé, et « Sponsor » posé sans mention se lit comme un fait. */}
      {person.roleInferred ? (
        <Badge variant="outline" title={t('focal.roleInferredHelp')}>
          {t('focal.roleInferred')}
        </Badge>
      ) : null}
    </div>
  )
}
