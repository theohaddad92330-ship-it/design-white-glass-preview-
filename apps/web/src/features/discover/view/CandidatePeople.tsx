import { useTranslation } from 'react-i18next'
import { UserRound } from 'lucide-react'
import type { DiscoverPerson } from '@bellum/contracts'

/* ------------------------------------------------------------------ */
/*  #2544.2 — LES PERSONNES QU'UNE SOURCE A NOMMÉES sur ce candidat.    */
/*                                                                     */
/*  À ne pas confondre avec « Rôles à identifier » juste au-dessus dans */
/*  la carte : celui-là liste des FONCTIONS écrites par un modèle,      */
/*  celui-ci des personnes qu'une source a PUBLIÉES, chaque fait avec   */
/*  sa provenance et sa date.                                          */
/*                                                                     */
/*  ⚠️ CE QUE CE BLOC NE FAIT JAMAIS :                                  */
/*                                                                     */
/*  - il n'écrit pas un champ inconnu comme une valeur. Pas de tiret,   */
/*    pas de « N/A », pas de « 0 » : ce qui manque est NOMMÉ            */
/*    (gardes GA-18 / GA-19) ;                                         */
/*  - il n'emprunte PAS la ville du candidat pour dire où quelqu'un     */
/*    travaille. La ville du candidat décrit un ÉTABLISSEMENT ; « où    */
/*    travaille cette personne » est une autre question, à laquelle le  */
/*    registre public ne répond pas — il rattache un mandataire au      */
/*    SIREN, jamais à un site ;                                         */
/*  - il ne nomme AUCUN fournisseur. La provenance est une FAMILLE.     */
/* ------------------------------------------------------------------ */

function formatDate(iso: string, locale: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
}

interface CandidatePeopleProps {
  people?: DiscoverPerson[]
  /**
   * La ville de l'établissement retenu par la recherche. Elle n'est PAS
   * affichée ici : elle est reçue pour que la frontière soit lisible dans le
   * code appelant, et le test vérifie qu'elle ne fuit pas dans ce bloc.
   */
  candidateCity: string | null
}

export function CandidatePeople({ people }: CandidatePeopleProps) {
  const { t, i18n } = useTranslation('discover')
  // Clé absente ou liste vide : RIEN. Jamais « 0 personne » — un compteur à
  // zéro se lirait « cette entreprise n'a pas de dirigeant », là où la vérité
  // est « aucune source n'en a nommé ».
  if (!people || people.length === 0) return null

  return (
    <div className="mb-2">
      <p className="mb-1 flex items-center gap-1.5">
        <UserRound className="h-3 w-3" aria-hidden />
        <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {t('card.peopleTitle')}
        </span>
      </p>
      <ul className="flex flex-col gap-1">
        {people.map(person => {
          return (
            <li key={`${person.name.value}-${person.name.observedAt}`} className="text-xs">
              <span style={{ color: 'var(--text-primary)' }}>{person.name.value}</span>
              {/* Le mandat, SEULEMENT quand il est attesté. Absent, il n'écrit
                  rien ici — il est nommé plus bas. */}
              {person.role && <span style={{ color: 'var(--text-secondary)' }}> · {person.role.value}</span>}
              {/* Le lieu de travail, SEULEMENT quand une source l'a constaté.
                  Aujourd'hui jamais depuis le registre public. */}
              {person.workplace && <span style={{ color: 'var(--text-secondary)' }}> · {person.workplace.city}</span>}
              <span className="block" style={{ color: 'var(--text-ghost)' }}>
                {t('card.peopleSeenAt', {
                  origin: t(`card.peopleOrigin.${person.name.origin}`),
                  date: formatDate(person.name.observedAt, i18n.language),
                })}
              </span>
              {/* #2613 — la ligne « Non su : … » est RETIRÉE : décision de Louis
                  du 20/09/2026, une absence ne fait pas une ligne dans une
                  liste. Ce qui est attesté est dit ; le reste se tait. */}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
