import {
  Briefcase,
  Building,
  Building2,
  Clock,
  FileText,
  Link2,
  Map,
  MessageSquare,
  Network,
  Settings,
  ShieldCheck,
  Target,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { ThemeSlug } from '@/features/onboarding/lib/theme-map'

/** Théo O onboarding-catalogue — l'icône de chaque thème (carte du catalogue, liens « Aller plus loin »). */
export const THEME_ICONS: Readonly<Record<ThemeSlug, LucideIcon>> = {
  'ton-entreprise': Building2,
  'ton-role-et-ton-equipe': User,
  'objectifs-et-difficultes': Target,
  'offre-et-expertises': Briefcase,
  'capacite-de-staffing': Users,
  'references-et-economie': ShieldCheck,
  'marches-et-territoires': Map,
  'clients-et-decideurs': Building,
  'reseau-et-voies-dacces': Network,
  'temps-et-methode': Clock,
  'ton-vivier': Users,
  'clients-et-missions': Briefcase,
  'outils-et-donnees': Link2,
  'secteurs-reglementes-et-appels-doffres': FileText,
  'contenu-et-visibilite': MessageSquare,
  'travailler-avec-laura': Settings,
}
