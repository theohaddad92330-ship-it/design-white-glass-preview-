/** Une relecture react-query : un échec réseau se LÈVE, pour que « revérifié » ne soit jamais affirmé à tort. */
export async function recheckFrom(refetch: () => Promise<{ isError: boolean; error: unknown }>): Promise<void> {
  const result = await refetch()
  if (result.isError) throw result.error
}
