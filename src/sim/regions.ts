import list from '../../regions.json'

/** A game server. Its rooms' codes start with its `id`, so a code alone says which server to ask. */
export interface Region {
  /** Two capital letters. */
  id: string
  name: string
  /** Where the server answers `/ws`, `/ping` and `/health`. */
  url: string
}

/** Every game server, from `regions.json`. The first is the default. */
export const REGIONS: readonly Region[] = list
export const REGION_ID_LENGTH = 2

export const regionById = (id: string) => REGIONS.find((r) => r.id === id) ?? null
export const regionOfCode = (code: string) => regionById(code.slice(0, REGION_ID_LENGTH))
