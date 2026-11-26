import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import {
  BUYER_ROLE_FAMILIES,
  contactStatusSchema,
  coverageLevelSchema,
  type DiscoverResultType,
} from '@bellum/contracts'
import { SelectInput, TextInput, ToggleChip } from './filter-controls'
import type { DiscoverContactFilters } from '@/features/discover/lib/discover-contact-rows'
import type { DiscoverCallListFilters } from '@/features/discover/lib/discover-call-list'
import { SIGNAL_NATURES, type DiscoverSignal } from '@/features/discover/lib/discover-types'

/* ------------------------------------------------------------------ */
/*  #4634 (décision Louis 26/10/2026) — LES CRITÈRES DE CONTACTS,        */
/*  BESOINS ET LISTE D'APPELS VIVENT DANS LE VOLET DE RECHERCHE.         */
/*                                                                     */
/*  « Tout ce qui concerne la recherche de contact doit être fait en    */
/*  haut, dans le volet principal de recherche. » Ces rangées vivaient  */
/*  SOUS les onglets de résultats (`ProjectionResults`,                 */
/*  `CallListResults`) : un critère posé sous le résultat n'est pas une */
/*  recherche, et le commercial ne savait pas lequel des deux il        */
/*  manipulait. Elles sont rendues ICI, dans `DiscoverSearchCard`, une  */
/*  seule fois et pour la seule projection affichée (GA-26) ; les       */
/*  listes ne rendent plus aucun contrôle de filtre.                    */
/*                                                                     */
/*  Chaque rangée DIT ce qu'elle fait : ce qui part dans la requête     */
/*  CHERCHE (`peopleSearchCriteria`), le reste AFFINE la liste trouvée  */
/*  — jamais un champ muet dont on ne sait pas s'il cherche.            */
/* ------------------------------------------------------------------ */

/** Les états de relation proposés au filtre #2165.41 — le vocabulaire partagé,
 *  jamais une liste recopiée : recopier ferait diverger les deux écrans. */
const CONTACT_RELATIONS = contactStatusSchema.options

/** #2165.35 — les trois niveaux du référentiel PARTAGÉ (`@bellum/contracts`),
 *  le même que la matrice de couverture des comptes. */
const CONTACT_LEVELS = coverageLevelSchema.options

/** #2165.37 — les onze domaines d'expertise du registre PARTAGÉ des familles
 *  de rôles acheteurs. Libellé FR verbatim (`labelFr`) : le registre ne porte
 *  pas encore de clé EN (`buyer-role-families.ts`, écart déjà nommé). */
const CONTACT_EXPERTISES = BUYER_ROLE_FAMILIES

interface ProjectionSearchFieldsProps {
  resultType: DiscoverResultType
  contacts: {
    filters: DiscoverContactFilters
    onChange: (filters: DiscoverContactFilters) => void
    /** #2621.1 — le pays de l'espace appliqué ; `null` = aucun (marché non résolu, ou entreprises de la recherche). */
    workspaceCountryName: string | null
    /** #4634 — la liste vient de `GET /contacts` : fonction, entreprise, lieu et relation y CHERCHENT. `false` : la
     *  liste vient des entreprises de la recherche (#3819), tous les critères AFFINENT ces personnes-là. */
    searched: boolean
  }
  calls: {
    filters: DiscoverCallListFilters
    onChange: (filters: DiscoverCallListFilters) => void
  }
  needs: {
    /** #2165.47 — texte libre cherché dans l'ENTREPRISE porteuse. */
    company: string
    onCompanyChange: (value: string) => void
    nature: DiscoverSignal['type'] | 'any'
    onNatureChange: (nature: DiscoverSignal['type'] | 'any') => void
    directOnly: boolean
    onDirectOnlyChange: (value: boolean) => void
    /** #4999.1 — la puce « Uniquement freelance », la même que celle du rail Signaux. */
    freelanceOnly: boolean
    onFreelanceOnlyChange: (value: boolean) => void
  }
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
      {children}
    </p>
  )
}

export function ProjectionSearchFields({ resultType, contacts, calls, needs }: ProjectionSearchFieldsProps) {
  const { t } = useTranslation('discover')
  if (resultType === 'contacts') return <ContactsSearchFields {...contacts} />
  if (resultType === 'calls') {
    const { filters, onChange } = calls
    return (
      <fieldset data-testid="projection-search-fields-calls" className="flex flex-col gap-2">
        <legend className="sr-only">{t('projectionFields.callsLegend')}</legend>
        <div className="flex flex-wrap items-center gap-2">
          {/* #3879.2 — « Entreprise » et « Niveau de décision » : les mêmes mots que Comptes, Contacts et Besoins.
              LUDOVIC-C LC.9 — « Entreprise » et « Fonction » côte à côte, pleine largeur sous 640 px. */}
          <div data-testid="call-list-filter-company" className="w-full sm:w-56">
            <TextInput
              value={filters.company}
              onChange={value => onChange({ ...filters, company: value })}
              placeholder={t('filters.company')}
              visibleLabel={t('filters.company')}
              ariaLabel={t('filters.company')}
            />
          </div>
          <div data-testid="call-list-filter-title" className="w-full sm:w-56">
            <TextInput
              value={filters.title}
              onChange={value => onChange({ ...filters, title: value })}
              placeholder={t('contactsResult.filters.title')}
              visibleLabel={t('contactsResult.filters.title')}
              ariaLabel={t('contactsResult.filters.title')}
            />
          </div>
          <SelectInput
            value={filters.level}
            onChange={value => onChange({ ...filters, level: value as DiscoverCallListFilters['level'] })}
            ariaLabel={t('filters.decisionLevel')}
            options={[
              { value: 'any', label: t('filters.decisionLevelAny') },
              ...CONTACT_LEVELS.map(value => ({ value, label: t(`filters.decisionLevelValue.${value}`) })),
            ]}
          />
          <SelectInput
            value={filters.expertise}
            onChange={value => onChange({ ...filters, expertise: value as DiscoverCallListFilters['expertise'] })}
            ariaLabel={t('contactsResult.filters.expertise')}
            options={[
              { value: 'any', label: t('contactsResult.filters.expertiseAny') },
              ...CONTACT_EXPERTISES.map(family => ({ value: family.key, label: family.labelFr })),
            ]}
          />
          <ToggleChip
            active={filters.reachableOnly}
            onClick={() => onChange({ ...filters, reachableOnly: !filters.reachableOnly })}
          >
            {t('contactsResult.filters.reachableOnly')}
          </ToggleChip>
        </div>
        <Note>{t('projectionFields.callsRefine')}</Note>
      </fieldset>
    )
  }
  if (resultType === 'needs') {
    const {
      company,
      onCompanyChange,
      nature,
      onNatureChange,
      directOnly,
      onDirectOnlyChange,
      freelanceOnly,
      onFreelanceOnlyChange,
    } = needs
    return (
      <fieldset data-testid="projection-search-fields-needs" className="flex flex-col gap-2">
        <legend className="sr-only">{t('projectionFields.needsLegend')}</legend>
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            value={company}
            onChange={onCompanyChange}
            placeholder={t('filters.company')}
            visibleLabel={t('filters.company')} // #3879.2
            ariaLabel={t('filters.company')}
          />
          <SelectInput
            value={nature}
            onChange={value => onNatureChange(value as DiscoverSignal['type'] | 'any')}
            ariaLabel={t('filters.signalNature')}
            options={[
              { value: 'any', label: t('filters.signalNatureAny') },
              ...SIGNAL_NATURES.map(value => ({ value, label: t(`signalTypes.${value}`) })),
            ]}
          />
          <ToggleChip active={directOnly} onClick={() => onDirectOnlyChange(!directOnly)}>
            {t('needs.evidenceLevel.direct')}
          </ToggleChip>
          <ToggleChip active={freelanceOnly} onClick={() => onFreelanceOnlyChange(!freelanceOnly)}>
            {t('rail.freelanceOnlyChip')}
          </ToggleChip>
        </div>
        <Note>{t('projectionFields.needsRefine')}</Note>
      </fieldset>
    )
  }
  return null
}

function ContactsSearchFields({
  filters,
  onChange,
  workspaceCountryName,
  searched,
}: ProjectionSearchFieldsProps['contacts']) {
  const { t } = useTranslation('discover')
  const { t: tContacts } = useTranslation('contacts')
  const countryScoped = !filters.worldwide && Boolean(workspaceCountryName)
  return (
    <fieldset data-testid="projection-search-fields-contacts" className="flex flex-col gap-2">
      <legend className="sr-only">{t('projectionFields.contactsLegend')}</legend>
      {/* #4634 — la portée SUIT les champs : ces personnes viennent de l'espace, jamais de dehors. */}
      <Note>{t('contactsResult.scope')}</Note>

      {/* #2151.55 / #2166.49 — arrivée depuis « Chercher les contacts » d'un résultat compte : la portée se DIT,
          et se retire d'un clic. */}
      {filters.company && (
        <p className="flex flex-wrap items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <span>{t('contactsResult.companyScope', { company: filters.company })}</span>
          <button
            type="button"
            onClick={() => onChange({ ...filters, company: '' })}
            className="min-h-11 text-xs font-medium text-[var(--bellum-text-accent)] underline underline-offset-2"
          >
            {t('contactsResult.clearCompanyScope')}
          </button>
        </p>
      )}

      {/* #2166.57 — chaque entreprise d'une SÉLECTION est une puce retirable individuellement. */}
      {filters.companies.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('contactsResult.companiesScopeLabel')}
          </span>
          {filters.companies.map(company => (
            <span
              key={company}
              className="inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1 text-xs"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              {company}
              <button
                type="button"
                onClick={() => onChange({ ...filters, companies: filters.companies.filter(name => name !== company) })}
                aria-label={t('contactsResult.removeCompanyFilter', { company })}
                className="inline-flex items-center justify-center rounded-full pointer-coarse:min-h-11 pointer-coarse:min-w-11"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          value={filters.title}
          onChange={value => onChange({ ...filters, title: value })}
          placeholder={t('contactsResult.filters.title')}
          ariaLabel={t('contactsResult.filters.title')}
        />
        {/* #3879.2 — le champ s'appelle `entity`, le critère est l'ENTREPRISE : même mot que Besoins et Liste
            d'appels (`filters.company`). */}
        <TextInput
          value={filters.entity}
          onChange={value => onChange({ ...filters, entity: value })}
          placeholder={t('filters.company')}
          ariaLabel={t('filters.company')}
        />
        {/* #2165.38 — la LOCALISATION de la personne, sur le lieu de travail COLLECTÉ — jamais le siège de son
            entreprise (`registry.cityLabel` / `rail.regionLabel` visent l'entreprise : ils cohabitent, ne fusionnent pas). */}
        <TextInput
          value={filters.location}
          onChange={value => onChange({ ...filters, location: value })}
          placeholder={t('contactsResult.filters.location')}
          ariaLabel={t('contactsResult.filters.location')}
        />
        <SelectInput
          value={filters.relation}
          onChange={value => onChange({ ...filters, relation: value as DiscoverContactFilters['relation'] })}
          ariaLabel={t('contactsResult.filters.relation')}
          options={[
            { value: 'any', label: t('contactsResult.filters.relationAny') },
            ...CONTACT_RELATIONS.map(value => ({ value, label: tContacts(`status.value.${value}`) })),
          ]}
        />
        {/* #2165.35 — le niveau, déduit UNE FOIS du poste par le référentiel partagé ; jamais deviné. */}
        <SelectInput
          value={filters.level}
          onChange={value => onChange({ ...filters, level: value as DiscoverContactFilters['level'] })}
          ariaLabel={t('filters.decisionLevel')}
          options={[
            { value: 'any', label: t('filters.decisionLevelAny') },
            ...CONTACT_LEVELS.map(value => ({ value, label: t(`filters.decisionLevelValue.${value}`) })),
          ]}
        />
        {/* #2165.37 — l'expertise, déduite UNE FOIS du poste par le registre partagé. */}
        <SelectInput
          value={filters.expertise}
          onChange={value => onChange({ ...filters, expertise: value as DiscoverContactFilters['expertise'] })}
          ariaLabel={t('contactsResult.filters.expertise')}
          options={[
            { value: 'any', label: t('contactsResult.filters.expertiseAny') },
            ...CONTACT_EXPERTISES.map(family => ({ value: family.key, label: family.labelFr })),
          ]}
        />
        <ToggleChip
          active={filters.reachableOnly}
          onClick={() => onChange({ ...filters, reachableOnly: !filters.reachableOnly })}
        >
          {t('contactsResult.filters.reachableOnly')}
        </ToggleChip>
        {/* #2294.2 — le nombre max, une taille de LISTE plafonnée en dernier, jamais un critère qui exclut une
            personne en particulier. */}
        <SelectInput
          value={filters.maxResults === 'any' ? 'any' : String(filters.maxResults)}
          onChange={value => onChange({ ...filters, maxResults: value === 'any' ? 'any' : Number(value) })}
          ariaLabel={t('contactsResult.filters.maxResults')}
          options={[
            { value: 'any', label: t('contactsResult.filters.maxResultsAny') },
            { value: '25', label: '25' },
            { value: '50', label: '50' },
            { value: '100', label: '100' },
          ]}
        />
        {/* #2165.40 — DÉCISION Louis 15/09 : jamais « vérifié », un poste DATÉ (source + date) seulement. */}
        <ToggleChip active={filters.datedOnly} onClick={() => onChange({ ...filters, datedOnly: !filters.datedOnly })}>
          {t('contactsResult.filters.datedOnly')}
        </ToggleChip>
        {/* #2621.1 — la bascule EXPLICITE : rien ne l'active toute seule. N'apparaît que si un pays de workspace est
            réellement à ouvrir — sinon un geste sans effet visible tromperait. */}
        {workspaceCountryName && (
          <ToggleChip
            active={filters.worldwide}
            onClick={() => onChange({ ...filters, worldwide: !filters.worldwide })}
          >
            {t('contactsResult.filters.worldwide')}
          </ToggleChip>
        )}
      </div>

      {/* #2621.1 — le pays du workspace se DIT tant qu'il est appliqué. */}
      {countryScoped && <Note>{t('contactsResult.countryScope', { country: workspaceCountryName })}</Note>}
      {/* #4634 — ce qui cherche et ce qui affine, dit en mots : jamais un champ muet. */}
      <Note>{searched ? t('projectionFields.contactsSearched') : t('projectionFields.contactsRefine')}</Note>
    </fieldset>
  )
}
