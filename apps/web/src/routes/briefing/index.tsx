import { createFileRoute } from '@tanstack/react-router'
import type { AgendaViewMode } from '@/features/agenda/agenda-view'
import { parseAgendaMode } from '@/features/briefing/lib/briefing-search'
import { useContact } from '@/features/contacts/hooks/useContact'
import { BriefingPage } from '@/features/briefing/view/BriefingPage'

/** « Ma journée » — le brief du matin. Pas de gating de palier : c'est la
 *  première chose qu'un commercial ouvre, et elle ne coûte aucun crédit. */
export const Route = createFileRoute('/briefing/')({
  /**
   * #2994 (#2112 : « les filtres pertinents survivent au retour ») — la vue
   * jour/semaine du plateau agenda voyage dans l'URL, jamais dans
   * `localStorage` (décision du jour) : un retour en arrière du navigateur
   * doit retrouver la MÊME vue, et le lien copié par « Partager » doit ouvrir
   * la vue exacte qu'il a copiée.
   *
   * `day` reste IMPLICITE (absent de l'URL) : c'est la vue par défaut, et
   * l'omettre garde les liens `/briefing` déjà en circulation valides.
   */
  validateSearch: (search: Record<string, unknown>): { mode?: AgendaViewMode; plan?: string; vue?: 'agenda' } => {
    const mode = parseAgendaMode(search.mode)
    // #3693.6 — `plan` = le contact pour qui l'on pose un rendez-vous (fiche contact).
    const plan = typeof search.plan === 'string' && search.plan.length > 0 ? search.plan : undefined
    // Refonte Théo — `vue=agenda` ouvre l'onglet « Mon agenda ». `mode=week` (liens d'avant)
    // l'ouvre aussi ; `mode=day` n'a de sens que DANS l'onglet (la grille horaire du jour).
    const vue = search.vue === 'agenda' ? ('agenda' as const) : undefined
    return {
      ...(mode === 'week' || (mode === 'day' && vue) ? { mode } : {}),
      ...(plan ? { plan } : {}),
      ...(vue ? { vue } : {}),
    }
  },
  component: BriefingRoute,
})

function BriefingRoute() {
  const { mode, plan, vue } = Route.useSearch()
  const navigate = Route.useNavigate()
  const planContact = useContact(plan ?? '').data
  return (
    <BriefingPage
      view={vue === 'agenda' || mode === 'week' || plan ? 'agenda' : 'activity'}
      onViewChange={next =>
        navigate({ search: prev => ({ ...prev, vue: next === 'agenda' ? 'agenda' : undefined, mode: undefined }) })
      }
      agendaMode={mode ?? 'week'}
      onAgendaModeChange={next =>
        navigate({ search: prev => ({ ...prev, vue: 'agenda', mode: next === 'day' ? 'day' : undefined }) })
      }
      planFor={
        plan && planContact
          ? { name: planContact.full_name, email: planContact.email || null, accountName: planContact.entity || null }
          : undefined
      }
      onPlanned={() => navigate({ search: prev => ({ ...prev, plan: undefined }) })}
    />
  )
}
