import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Mail, Phone } from 'lucide-react'
import { Button } from '@bellum/ui'
import type { PersonNameSearchHit, PersonNameSourceFamily } from '@bellum/contracts'
import { contactsApi } from '@/features/contacts/api'
import { CreateContactDialog } from '@/features/crm-core/view/CreateContactDialog'
import type { PersonNameQuery } from '@/features/discover/lib/discover-person-name-query'

/**
 * #4574 — la DEMANDE de recherche par nom : ce que le champ libre du rail a lu (« Marion Sagnard chez Bedrock »).
 * `nonce` change à chaque « Explorer » : la même phrase relancée relance la recherche.
 */
export interface PersonNameRequest {
  query: PersonNameQuery
  nonce: number
}

/**
 * #2727 — « je tape un nom, je vois les homonymes, je choisis ».
 * #4574 — revient sur #2727 : plus de carte ni de formulaire à part ; le nom se tape dans le champ libre
 * du rail, et ce composant n'en rend que les RÉSULTATS.
 *
 * Mesuré le 22/09/2026 (call Loïc Inacio) : Découvrir ne cherche que des
 * entreprises ; aucun champ ne part d'un nom de personne, et le parcours
 * essayé plusieurs fois pour retrouver Marion Sagnard a échoué.
 *
 * Recherche GRATUITE (tier Apollo People-Search) : un homonyme n'affiche
 * jamais une coordonnée (e-mail/téléphone restent des DISPONIBILITÉS), et
 * `status` dit POURQUOI personne n'apparaît — source non branchée, en panne,
 * limitée — jamais confondu avec « aucun homonyme » (GA-18/19).
 *
 * « Ajouter et enrichir » réutilise le geste EXISTANT (GA-26) : le même
 * dialogue de création manuelle de contact (`CreateContactDialog`, #1317),
 * préremplie mais modifiable, puis la fiche créée ouvre sur l'enrichissement
 * déjà en place — aucune écriture n'a lieu avant le clic du commercial.
 *
 * #4386 — la recherche est une CASCADE (base de contacts → registre des
 * dirigeants → recherche web) : chaque résultat dit sa correspondance EN MOTS et
 * les FAMILLES qui l'ont rendu (jamais un fournisseur, jamais un pourcentage) ;
 * un vide nomme les familles interrogées, celle qui n'a pas répondu, et propose
 * un geste — plus jamais « Aucun homonyme » sec.
 */
/** Le nom PUBLIÉ quand une source le donne (registre, profil public), sinon le nom masqué tel quel. */
function displayName(hit: PersonNameSearchHit): string {
  return [hit.firstName, hit.lastName || hit.lastNameObfuscated].filter(Boolean).join(' ')
}

export function PersonNameResults({ request }: { request: PersonNameRequest | null }) {
  const { t } = useTranslation('discover')
  const navigate = useNavigate()
  const [lastQuery, setLastQuery] = useState('')
  const [lastOrganization, setLastOrganization] = useState<string | undefined>(undefined)
  const [addingHit, setAddingHit] = useState<PersonNameSearchHit | null>(null)

  const search = useMutation({
    mutationFn: (input: { fullName: string; organizationName?: string }) =>
      contactsApi.searchByName(input.fullName, input.organizationName),
  })
  const { mutate, reset } = search

  const run = (name: string, organization: string | undefined) => {
    setLastQuery(name)
    setLastOrganization(organization)
    mutate({ fullName: name, organizationName: organization })
  }

  // Chaque « Explorer » qui désigne une personne lance la recherche ; une phrase qui n'en désigne plus
  // efface les homonymes (jamais ceux d'une recherche d'avant sous une autre demande).
  useEffect(() => {
    if (!request) {
      reset()
      return
    }
    setLastQuery(request.query.fullName)
    setLastOrganization(request.query.organizationName)
    mutate({ fullName: request.query.fullName, organizationName: request.query.organizationName })
  }, [request, mutate, reset])

  // #4386 — le geste du vide : relancer sans l'entreprise citée.
  const retryWithoutOrganization = () => run(lastQuery, undefined)

  const result = search.data
  const showHits = result?.status === 'ok' && result.hits.length > 0
  const showEmpty = Boolean(result) && !showHits && (result?.status === 'ok' || result?.status === 'empty')
  const showUnavailable = Boolean(result) && !showHits && !showEmpty
  const familyLabel = (family: PersonNameSourceFamily) => t(`personNameSearch.family.${family}`)
  const familiesText = (families: readonly PersonNameSourceFamily[]) => families.map(familyLabel).join(', ')
  const queried = result?.sourcesQueried ?? []
  // #4386.4 — le vide NOMME les familles réellement interrogées sans résultat (jamais une liste figée) ;
  // une famille en panne n'a rien « cherché » : elle se dit à part (`down_*`).
  const searchedEmptyFamilies = queried.filter(source => source.outcome === 'empty').map(source => source.family)
  const notFoundIn = searchedEmptyFamilies
    .map(family => t('personNameSearch.notIn', { place: t(`personNameSearch.place_${family}`) }))
    .join(', ')
  const downFamilies = queried.filter(source => source.outcome === 'down').map(source => source.family)

  if (!request) return null

  return (
    <div
      data-testid="person-name-results"
      className="space-y-3 rounded-xl p-4"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
    >
      {/* #4386 — pendant la recherche, dire OÙ elle cherche (un seul appel : l'ordre
          de la cascade, jamais une progression inventée). */}
      {search.isPending && (
        <p role="status" className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('personNameSearch.searching')}
        </p>
      )}

      {search.isError && (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t('personNameSearch.error')}
        </p>
      )}

      {showEmpty && (
        <div className="flex flex-col gap-1">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {
              // #4386.4 — « Je n'ai trouvé X ni dans ta base, ni dans les registres publics… »
              searchedEmptyFamilies.length > 0
                ? t('personNameSearch.emptyIn', { name: lastQuery, where: notFoundIn })
                : t('personNameSearch.empty', { name: lastQuery })
            }
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {lastOrganization
              ? t('personNameSearch.tipWithOrganization')
              : t('personNameSearch.tipWithoutOrganization')}
          </p>
          {lastOrganization && (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-coarse:min-h-11"
                onClick={retryWithoutOrganization}
              >
                {t('personNameSearch.retryWithoutOrganization')}
              </Button>
            </div>
          )}
        </div>
      )}

      {showUnavailable && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('personNameSearch.unavailable')}
        </p>
      )}

      {/* #4386 — une famille en panne se DIT, jamais maquillée en « 0 ». */}
      {result &&
        downFamilies.map(family => (
          <p key={family} className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t(`personNameSearch.down_${family}`)}
          </p>
        ))}

      {showHits && (
        <div className="flex flex-col gap-2">
          {/* LOIC-FIX O.5 — le compte des homonymes se dit ICI, à côté de la liste qu'il compte :
              le compteur de la liste de l'espace, plus bas, compte une AUTRE liste. */}
          <p data-testid="person-name-count" className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('personNameSearch.count', { count: result.hits.length })}
          </p>
          {result.hits.map(hit => (
            <div
              key={hit.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2"
              style={{ border: '1px solid var(--border-subtle)' }}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {displayName(hit)}
                </span>
                {hit.match && (
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {t(`personNameSearch.match.${hit.match}`)}
                  </span>
                )}
                {/* Un champ absent ne fait aucune ligne ni aucune ponctuation : ni « , » orphelin
                    (ville et pays vides joints), ni ligne vide. */}
                {[hit.title, hit.organizationName, [hit.city, hit.country].filter(Boolean).join(', ')]
                  .filter(line => typeof line === 'string' && line.trim() !== '')
                  .map(line => (
                    <span key={line} className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {line}
                    </span>
                  ))}
                {hit.sources && hit.sources.length > 0 && (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t('personNameSearch.foundIn', { families: familiesText(hit.sources) })}
                  </span>
                )}
                {hit.linkedinUrl && (
                  <a
                    href={hit.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('personNameSearch.publicProfileOf', { name: displayName(hit) })}
                    className="inline-flex items-center text-xs underline pointer-coarse:min-h-11"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {t('personNameSearch.publicProfile')}
                  </a>
                )}
                <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {/* Disponibilité du canal, jamais sa valeur (même discipline que ContactResultRow). */}
                  {hit.hasEmail && (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-[10px] w-[10px]" aria-hidden />
                      {t('contactsResult.channelAvailable.email')}
                    </span>
                  )}
                  {hit.hasPhone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-[10px] w-[10px]" aria-hidden />
                      {t('contactsResult.channelAvailable.phone')}
                    </span>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-coarse:min-h-11"
                onClick={() => setAddingHit(hit)}
              >
                {t('personNameSearch.addAndEnrich')}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* #2727 — geste EXISTANT réutilisé (GA-26) : préremplie, modifiable, et
          la création n'a lieu que sur le clic du commercial dans ce dialogue. */}
      <CreateContactDialog
        key={addingHit?.id ?? 'none'}
        open={addingHit !== null}
        onOpenChange={openState => {
          if (!openState) setAddingHit(null)
        }}
        initialValues={
          addingHit
            ? {
                fullName: displayName(addingHit),
                title: addingHit.title,
                entity: addingHit.organizationName,
              }
            : undefined
        }
        onCreated={contact => {
          setAddingHit(null)
          // Même porte que ContactResultRow (#2150.37) : la fiche canonique,
          // où le geste d'enrichissement EXISTANT vit déjà.
          navigate({ to: '/contacts/$id', params: { id: contact.id } })
        }}
      />
    </div>
  )
}
