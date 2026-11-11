# Pushover Notifications Settings UI

Added a Notifications section to the Settings page for configuring Pushover push notifications.

## What changed

### Types (`types/notifications.ts`)
- `PushoverValidationStatus`, `NotificationTopic`, and API response types

### API client (`api/notifications.ts`)
- Functions for all 4 notification endpoints: topics, status, validate, test

### Pinia store (`stores/notifications.ts`)
- Credential form state (local, not persisted — secrets stay server-side)
- Validation state machine: unchecked -> validating -> valid/invalid
- Topic toggle with debounced auto-save (500ms)
- Test notification action with result feedback

### Component (`components/NotificationsSettings.vue`)
- Pushover credential inputs with show/hide toggle (password-masked by default)
- Validate + Send Test action buttons
- Validation status indicator
- Topic toggles grouped by category: Success, Failure, Admin
- Admin section only visible to admin users
- Topics disabled until valid credentials are saved
- Status badge: "Configured" / "Not configured"

### Integration
- `NotificationsSettings` added to `SettingsView.vue` between Background Jobs and Processing Pipeline
- Existing SettingsView tests updated with notification API mocks

## Tests
- 4 API client tests
- 18 store tests covering load, validate, setTopic, sendTest, computed properties, error branches
- 16 component tests covering rendering, credential visibility, validation flow, topic toggles, admin gating
- All coverage thresholds met (85%+)
