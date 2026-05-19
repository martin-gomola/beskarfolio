export type ImportType = 'standard' | 'ibkr'
export type ImportMode = 'append' | 'replace'

export interface ImportResult {
  imported_count: number
  skipped_count: number
  deleted_count: number
  mode: ImportMode
  stats?: {
    sold_count?: number
    open_count?: number
    cash_count?: number
    skipped_currency?: number
    mapped_symbols?: number
  }
}

export interface PasteValidation {
  buy: string | null
  sell: string | null
}
