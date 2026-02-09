# Changelog

All notable changes to this project are documented in this page.

## Version 1.0 (2026-02-09)

### Added

- Changelog page and root `CHANGELOG.md` monitoring.
- Feedback and bug reporting link in the sidebar (configured via `NEXT_PUBLIC_FEEDBACK_URL`).
- Discord forum thread support for events and automated team discussion threads.
- Confirmation modal for updating iRacing Customer ID in user profiles.
- Discord event and thread links in race details with tooltips and grayed-out state for ungenerated threads.

### Fixed

- Extra separator line appearing in the unassigned drivers group.
- Team separator visibility when no teams are assigned.
- Mobile event filter toggle behavior.

### Maintenance

- Added comprehensive unit tests for proxy, auth logic, and profile forms.
- Updated documentation for Discord integration and production deployment.
- Improved database backup frequency to hourly and optimized retention policies.
