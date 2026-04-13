/**
 * Display-only normalisation for entity names.
 *
 * Rules:
 *  1. Replace hyphens and underscores with spaces; collapse whitespace.
 *  2. Title-case every word (first letter upper, rest lower).
 *  3. Preserve well-known acronyms in ALL CAPS.
 *  4. Apply special-case spelling for brand names (iPhone, GitHub, …).
 *  5. If a word is already fully uppercase and longer than one character,
 *     keep it uppercase (catches acronyms not in the explicit set).
 */

const ACRONYMS: ReadonlySet<string> = new Set([
  // Data & markup
  'SQL',
  'JSON',
  'XML',
  'CSV',
  'PDF',
  'YAML',
  'TOML',
  'HTML',
  'CSS',
  // Web / networking
  'HTTP',
  'HTTPS',
  'URL',
  'URI',
  'REST',
  'GRPC',
  'SSH',
  'SSL',
  'TLS',
  'TCP',
  'UDP',
  'DNS',
  'API',
  'JWT',
  'OAUTH',
  // Languages & runtimes
  'JS',
  'TS',
  // Hardware
  'CPU',
  'GPU',
  'RAM',
  'SSD',
  'HDD',
  'USB',
  'HDMI',
  // AI / ML
  'AI',
  'ML',
  'NLP',
  'LLM',
  'GPT',
  'OCR',
  // Cloud & DevOps
  'AWS',
  'GCP',
  'CI',
  'CD',
  'IDE',
  'CLI',
  'GUI',
  'SDK',
  'MCP',
  // Geography
  'UK',
  'US',
  'USA',
  'EU',
  'NZ',
  // Roles
  'IT',
  'VP',
  'CEO',
  'CTO',
  'CFO',
  'HR',
])

const SPECIAL_WORDS: ReadonlyMap<string, string> = new Map([
  // Apple
  ['iphone', 'iPhone'],
  ['ipad', 'iPad'],
  ['imac', 'iMac'],
  ['ios', 'iOS'],
  ['ipod', 'iPod'],
  ['macos', 'macOS'],
  // Tech brands & tools
  ['github', 'GitHub'],
  ['gitlab', 'GitLab'],
  ['linkedin', 'LinkedIn'],
  ['youtube', 'YouTube'],
  ['postgresql', 'PostgreSQL'],
  ['mysql', 'MySQL'],
  ['mongodb', 'MongoDB'],
  ['graphql', 'GraphQL'],
  ['devops', 'DevOps'],
  ['chatgpt', 'ChatGPT'],
  ['openai', 'OpenAI'],
  ['wifi', 'WiFi'],
  ['javascript', 'JavaScript'],
  ['typescript', 'TypeScript'],
  // Fast food etc.
  ["mcdonald's", "McDonald's"],
  ['mcdonalds', "McDonald's"],
])

/**
 * Normalise a single entity name for display.
 * Returns the original string if it is empty/whitespace-only.
 */
export function displayName(name: string): string {
  if (!name || !name.trim()) return name

  const cleaned = name.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()

  return cleaned
    .split(' ')
    .map((word) => {
      const upper = word.toUpperCase()
      if (ACRONYMS.has(upper)) return upper

      const lower = word.toLowerCase()
      const special = SPECIAL_WORDS.get(lower)
      if (special !== undefined) return special

      // Preserve words that are already all-uppercase (likely acronyms
      // not in our explicit set).
      if (word.length > 1 && word === upper) return word

      // Title-case
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

/**
 * Normalise an array of alias strings for display.
 * Returns a comma-separated string ready for rendering.
 */
export function displayAliases(aliases: string[]): string {
  return aliases.map(displayName).join(', ')
}
