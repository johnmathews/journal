// Settings and health types. The `/api/settings`, `/api/settings/runtime`,
// `/api/settings/pricing`, `/api/health` and `/api/stats` response shapes
// are generated from the server's API contract
// (server/src/journal/api/contract/schemas.py).
//
// - `HealthResponse` is the authenticated `GET /api/health` body. Its
//   `ingestion` block is `IngestionStatsError` (`{ error }`) when the
//   server's stats query fails; narrow with `'error' in ingestion`.
// - `ServerSettings.features.strava_enabled` is false while Strava is
//   mothballed (2026-07); the webapp then hides all Strava UI.
export type {
  ChunkingSettings,
  ComponentCheck,
  EmbeddingSettings,
  EntityExtractionSettings,
  FeatureSettings,
  FitnessSourceHealth,
  HealthResponse,
  HealthStatus,
  IngestionStats,
  IngestionStatsError,
  LatencyPercentiles,
  OcrSettings,
  PricingCategory,
  PricingEntry,
  PricingListResponse,
  PricingUpdateResponse,
  QueryStats,
  QueryTypeStats,
  RuntimeSetting,
  RuntimeSettingsListResponse,
  RuntimeSettingsUpdateResponse,
  SearchSettings,
  ServerSettings,
  TranscriptFormattingSettings,
  TranscriptionSettings,
} from './generated/api'
