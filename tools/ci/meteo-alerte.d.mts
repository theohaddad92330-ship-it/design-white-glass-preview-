// Types de `meteo-alerte.mjs`, pour le test qui le garde (`apps/web/src/test/ci-quarantaine.test.ts`).
export interface Slo {
  key: string
  label: string
  max?: number
  min?: number
}
export declare const SLO: Slo[]
export declare function sloMisses(metrics: Record<string, number | null> | null | undefined): Slo[]
export declare function repeatedMisses(
  current: Record<string, number | null>,
  previous: Record<string, number | null>,
): Slo[]
export declare const MARKER: RegExp
export declare function marker(metrics: unknown): string
export declare function previousFromBody(body: string | null | undefined): Record<string, number | null> | null
export declare function alertBody(
  misses: Slo[],
  current: Record<string, number | null>,
  previous: Record<string, number | null>,
): string
