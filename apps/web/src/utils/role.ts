export const CUSTOMER_ROLE = 'customer'
export const BACKOFFICE_ROLE = 'backoffice'

export function hasCustomerRole(roles: readonly string[] | undefined): boolean {
  return roles?.includes(CUSTOMER_ROLE) ?? false
}

export function hasBackofficeRole(roles: readonly string[] | undefined): boolean {
  return roles?.includes(BACKOFFICE_ROLE) ?? false
}
