/**
 * Conceptual groupings for the mood dimensions, mirroring the comment block in
 * `server/config/mood-dimensions.toml` (lines 42–46). The toml is the source of
 * truth for the dimensions themselves; the *grouping* lives only in that file's
 * comment, so the webapp keeps its own copy here.
 *
 * Order of `MOOD_GROUPS` and the order of `members` within each group must
 * match the toml's declaration order — the chart renders dimensions in this
 * order, and the toml's leading comment marks ordering as load-bearing.
 *
 * If a new dimension is added to the toml without a matching entry here, it
 * falls through into the trailing `'other'` group at render time so the UI
 * still renders gracefully — see `groupDimensions`.
 */

import type { MoodDimension } from '@/types/dashboard'

export type MoodGroupId = 'affect' | 'needs' | 'negative' | 'stance' | 'other'

export interface MoodGroup {
  id: MoodGroupId
  /** Human-readable label shown above each group's pills. Empty for `'other'`. */
  label: string
  /** Dimension names in this group, in toml order. */
  members: readonly string[]
}

export const MOOD_GROUPS: readonly MoodGroup[] = [
  {
    id: 'affect',
    label: 'Affect axes',
    members: ['joy_sadness', 'energy_fatigue'],
  },
  {
    id: 'needs',
    label: 'Psychological needs',
    members: ['agency', 'fulfillment', 'connection'],
  },
  {
    id: 'negative',
    label: 'Active negative affect',
    members: ['frustration'],
  },
  {
    id: 'stance',
    label: 'Stance',
    members: ['proactive_reactive'],
  },
]

const OTHER_GROUP: MoodGroup = { id: 'other', label: '', members: [] }

export interface GroupedDimensions {
  group: MoodGroup
  members: MoodDimension[]
}

/**
 * Bucket a list of dimensions (as returned by the server, already in toml
 * order) into the four conceptual groups. Returns one entry per group that
 * has at least one matching member; groups with zero matches are omitted.
 *
 * Dimensions not declared in any group land in a final `'other'` bucket so
 * the UI degrades gracefully if the toml gains a dimension that hasn't been
 * mapped here yet.
 */
export function groupDimensions(
  dimensions: readonly MoodDimension[],
): GroupedDimensions[] {
  const byName = new Map(dimensions.map((d) => [d.name, d]))
  const claimed = new Set<string>()
  const result: GroupedDimensions[] = []

  for (const group of MOOD_GROUPS) {
    const members: MoodDimension[] = []
    for (const name of group.members) {
      const d = byName.get(name)
      if (d !== undefined) {
        members.push(d)
        claimed.add(name)
      }
    }
    if (members.length > 0) {
      result.push({ group, members })
    }
  }

  const orphans = dimensions.filter((d) => !claimed.has(d.name))
  if (orphans.length > 0) {
    result.push({ group: OTHER_GROUP, members: orphans })
  }

  return result
}
