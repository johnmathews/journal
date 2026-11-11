/**
 * Shared tile-layout types for the dashboard's customizable grid.
 *
 * The dashboard owns the canonical implementation; this module
 * exposes the generic types so other pages (currently `/fitness`)
 * can adopt the same `TileGrid` component without re-deriving them.
 *
 * Tile widths can either be plain integer CSS grid-column spans
 * (the dashboard's original 1 = half, 2 = full model) or named
 * widths (`'third' | 'half' | 'full'`) for pages with a 3-width
 * choice on a 6-column grid. Each consumer picks one representation
 * and provides a `getSpan` function to `TileGrid` so the grid only
 * has to know "this tile takes N CSS grid columns".
 */

/**
 * Generic tile definition. `TId` is the page's tile-id union;
 * `TWidth` is whatever the page uses to represent widths.
 *
 * `testId`, when set, is stamped onto the rendered `<section>` so
 * existing dashboard tests that select tiles by data-testid keep
 * working after the extraction.
 */
export interface TileDef<TId extends string, TWidth = number> {
  id: TId
  title: string
  defaultWidth: TWidth
  testId?: string
  /** When true, the tile is only rendered if the consumer says so. */
  conditional?: boolean
}

/**
 * Generic layout state. Mirrors the shape persisted under the
 * preferences key on the server (`dashboard_layout`,
 * `fitness_layout`, …).
 */
export interface TileLayout<TId extends string, TWidth = number> {
  tileOrder: TId[]
  hiddenTiles: TId[]
  tileWidths?: Partial<Record<TId, TWidth>>
}

/**
 * Named widths used by pages that offer more than the dashboard's
 * binary half/full choice. Fitness uses all three on a 6-column
 * grid: third → span 2, half → span 3, full → span 6.
 */
export type NamedWidth = 'third' | 'half' | 'full'
