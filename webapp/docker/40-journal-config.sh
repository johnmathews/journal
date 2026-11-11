#!/bin/sh
# This script previously injected JOURNAL_API_TOKEN into config.js for
# bearer-token authentication. Since the app now uses cookie-based
# sessions, no runtime token injection is needed. This script is kept
# as a no-op so existing Docker images with the entrypoint hook don't
# fail if the file is missing.

echo "40-journal-config: no-op (cookie-based auth, no token injection needed)"
