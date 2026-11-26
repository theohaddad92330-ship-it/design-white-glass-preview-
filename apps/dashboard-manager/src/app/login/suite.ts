/**
 * Valide la cible de redirection post-connexion `?suite=` (finding pentest #9).
 *
 * Vit dans un module à part et NON dans `page.tsx` : un fichier de page Next ne
 * peut exporter que ses symboles réservés (`default`, `metadata`, `dynamic`…),
 * et l'exporter depuis la page casse le typecheck généré de Next.
 *
 * Le filtre d'origine `startsWith('/') && !startsWith('//')` laissait passer
 * `/\evil.com` : il commence par `/`, pas par `//`, mais un navigateur traite
 * `\` comme `/` pour un schéma spécial → `//evil.com`, une URL protocol-relative
 * qui quitte le domaine. On normalise `\`→`/` AVANT de refuser un double slash
 * en tête — même logique que `known-routes.ts` de l'app principale.
 */
export function suiteInterne(suiteBrute: string): string {
  const trimmed = suiteBrute.trim()
  if (!trimmed.startsWith('/')) return '/'
  const normalise = trimmed.replace(/\\/g, '/')
  if (normalise.startsWith('//')) return '/'
  return trimmed
}
