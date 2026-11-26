export declare function declaredJobs(ciYml: string): { id: string; name: string }[]
export declare function jobsWithoutSuccess(
  declared: readonly { id: string; name: string }[],
  runs: readonly { jobs: readonly { name: string; conclusion: string | null }[] }[],
): { never: string[]; unobserved: string[] }
