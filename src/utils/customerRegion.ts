/** 与生产页大连客户选项一致：Siemens Sensors＆Communication Ltd. */
export const DALIAN_CONTRACT_CUSTOMER = 'Siemens Sensors＆Communication Ltd.'

function normalizeCustomerName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/＆/g, '&')
}

export function isDalianContractCustomer(name?: string | null): boolean {
  if (!name) return false
  return normalizeCustomerName(name) === normalizeCustomerName(DALIAN_CONTRACT_CUSTOMER)
}
