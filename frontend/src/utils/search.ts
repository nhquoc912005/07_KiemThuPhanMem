export function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
}

export function matchesSearchQuery(query: string, ...values: unknown[]): boolean {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return true

  const haystack = normalizeSearchText(values.map((value) => String(value ?? '')).join(' '))
  return haystack.includes(normalizedQuery)
}

