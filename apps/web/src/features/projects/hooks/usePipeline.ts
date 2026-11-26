import { useQuery } from '@tanstack/react-query'
import { i18n } from '@/i18n'
import { projectQueryKeys, projectsApi } from '../api'

/**
 * L'état du pipe : celui de l'ESPACE par défaut (`/projects`, l'état vide de
 * `/missions`), celui du LECTEUR si `scope: 'own'` est demandé (le cockpit,
 * « **Mon** pipe »).
 *
 * ⚠️ `scope` n'est pas décoratif : le serveur rend l'espace quand on ne demande
 * rien. Sans ce mot, le cockpit d'un commercial lisait le pipe de TOUT l'espace
 * sous le titre « Mon pipe » — le serveur savait déjà répondre « le mien »
 * depuis le 28/08 (`a1f30e39b`), aucun appelant web ne le lui demandait.
 */
export function usePipeline(scope?: 'own') {
  const language = i18n.language === 'en' ? 'en' : 'fr'
  return useQuery({
    queryKey: projectQueryKeys.pipeline(language, scope),
    queryFn: () => projectsApi.pipeline(language, scope),
  })
}
