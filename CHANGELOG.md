# Changelog

The most notable changes to this project are documented here.

## Version 1.2 {#version-1.2}

**Released on <time datetime="2026-02-23">February 23, 2026</time>**

[25 issues completed][Milestone 2] by **[Nathan]**, **[Steven]**, and **[Kaelan]**.

### Highlights

Version 1.2 focuses on performance, observability, and quality-of-life improvements. The biggest user-facing changes are a new calendar export feature, improved Discord event posts with per-class unassigned driver groups, and significantly faster UI response times throughout the app. Under the hood, this release introduces structured logging, OpenTelemetry tracing, and a real-database integration test suite.

### Feedback Results

Thanks to our community members for [these suggestions][Feedback 2]!

- **Zarah** - Add a calendar export button to timeslots and the registration page ([#116](https://github.com/nathanperkins/race-team-planner/issues/116) by [Nathan])

### Events

- **Calendar export** - Added "Add to Calendar" button on each race timeslot and the My Registrations page, supporting Google Calendar, Outlook, and Apple Calendar / .ics download. Button is hidden for past races. Includes a link back to the app event page and the Discord thread when available ([#116](https://github.com/nathanperkins/race-team-planner/issues/116) by [Nathan])
- **Optimistic event modal** - Event details modal now opens instantly using cached event data, eliminating the visible delay before the modal appeared ([#107](https://github.com/nathanperkins/race-team-planner/issues/107) by [Kaelan])
- **Old event link fix** - Opening a link to an older event (e.g. from My Registrations) now correctly shows the event modal instead of landing on a blank events page ([#103](https://github.com/nathanperkins/race-team-planner/issues/103) by [Kaelan])
- **Filter performance** - Events page filter controls now respond immediately without waiting for a database round-trip, and async data fetching runs in parallel ([#98](https://github.com/nathanperkins/race-team-planner/issues/98) by [Kaelan])
- **Mobile header overlap fix** - Fixed registered event pills overlapping the mobile top bar on small screens ([#122](https://github.com/nathanperkins/race-team-planner/issues/122) by [Nathan])

### Discord Notifications

- **Car class groups for unassigned drivers** - Unassigned drivers in event discussion posts are now grouped by car class with a separate header per class (e.g. **Unassigned - GT3**, **Unassigned - GTP**), sorted alphabetically by class then by name within each group. Discord mentions are used instead of real names when available ([#114](https://github.com/nathanperkins/race-team-planner/issues/114) by [Nathan])
- **Class change notifications** - Changing your own car class on a registration now sends a Discord notification to the event thread ([#91](https://github.com/nathanperkins/race-team-planner/issues/91) by [Kaelan])
- **Reduced thread inactivity** - Discord event and team threads now auto-archive after 2 days of inactivity instead of 1 week, keeping the sidebar cleaner ([#125](https://github.com/nathanperkins/race-team-planner/issues/125) by [Nathan])

### Performance

- **Faster registration actions** - Parallelized database and Discord calls across registration, team assignment, and drop flows, significantly reducing action latency ([Kaelan])
- **Refactored save flow** - Admin save team edits completely refactored to minimize sequential database round-trips ([Kaelan])

### Observability

- **Structured logging** - Replaced all `console.log` calls with a leveled structured logger (`debug`, `info`, `warn`, `error`). Log output is now JSON in production for easier querying ([#101](https://github.com/nathanperkins/race-team-planner/issues/101) by [Nathan])
- **Log level override** - Added `LOG_LEVEL` environment variable to control logging verbosity without redeploying ([#102](https://github.com/nathanperkins/race-team-planner/issues/102) by [Nathan])
- **OpenTelemetry tracing** - Added distributed tracing with OTLP export, enabling visibility into API latency across services ([#105](https://github.com/nathanperkins/race-team-planner/issues/105) by [Kaelan])

### Infrastructure

- **Integration test suite** - Added a real-database integration test runner using a separate PostgreSQL instance, enabling tests that verify actual database behavior ([#124](https://github.com/nathanperkins/race-team-planner/issues/124) by [Kaelan])
- **Cloud Run labels** - Added resource labels to Cloud Run jobs and services for easier per-service cost tracking in billing ([#99](https://github.com/nathanperkins/race-team-planner/issues/99) by [Nathan])
- **Aggressive image pruning** - Docker image cleanup policy tightened to remove unused images sooner, reducing Artifact Registry storage costs ([#100](https://github.com/nathanperkins/race-team-planner/issues/100) by [Nathan])

### Documentation

- **Onboarding video** - Published a User Guide video walkthrough explaining the app features and Discord notification settings. A link to the video appears in the sidebar when `USER_GUIDE_URL` is configured ([#17](https://github.com/nathanperkins/race-team-planner/issues/17) by [Steven], sidebar link by [Nathan])

## Version 1.1 {#version-1.1}

**Released on <time datetime="2026-02-16">February 16, 2026</time>**

[48 issues completed][Milestone 1] by **[Nathan]**, **[Steven]**, and **[Kaelan]**.

### Highlights

Version 1.1 focuses on improving the Discord notification system, enhancing race eligibility handling, and refining the team picker experience. This release includes significant improvements to notification clarity, better visual indicators for race eligibility, and numerous bug fixes.

WARNING: you may find that certain actions are slow in this release (registering, dropping, picking teams) due to high latency handling Discord notifications. We will be addressing this in future releases.

### Feedback Results

Thanks to our testers for [these suggestions and bug reports][Feedback 1]!

- **Max** - Add a badge to events in the list you are registered for ([#18](https://github.com/nathanperkins/race-team-planner/issues/18) by [Nathan])

### Discord Notifications

#### Enhanced Notification System

- **Simplified registration notifications** - Reduced notification size by consolidating event info and showing only same-class racers, making notifications easier to scan at a glance ([#85](https://github.com/nathanperkins/race-team-planner/issues/85) by [Nathan])
- **Include new registrant in member lists** - New race registrations now appear in the "Racers in Class" section of notifications ([#86](https://github.com/nathanperkins/race-team-planner/issues/86) by [Nathan])
- **Thread-based notifications** - Registration notifications are now posted in both the main channel and the event thread ([#22](https://github.com/nathanperkins/race-team-planner/issues/22) by [Steven])
- **Join Event button** - Added quick-action button to join races directly from Discord notifications and event threads ([#11](https://github.com/nathanperkins/race-team-planner/issues/11) by [Steven], [#83](https://github.com/nathanperkins/race-team-planner/issues/83) by [Nathan])
- **Roster display** - Added "Already Registered" list showing other racers in registration notifications ([#33](https://github.com/nathanperkins/race-team-planner/issues/33) by [Steven])

#### Thread Management

- **Event-level threads** - Changed from race-specific to event-level discussion threads for better organization ([#2](https://github.com/nathanperkins/race-team-planner/issues/2) by [Steven])
- **Thread recovery** - Automatically creates new discussion threads if previous ones are lost or deleted ([#20](https://github.com/nathanperkins/race-team-planner/issues/20) by [Steven])
- **Multi-timeslot support** - Event discussion posts now properly show teams for all time slots ([#60](https://github.com/nathanperkins/race-team-planner/issues/60) by [Nathan])
- **Team thread links** - Added navigation links back to main event thread from team threads ([#57](https://github.com/nathanperkins/race-team-planner/issues/57) by [Steven])
- **Thread link fixes** - Fixed team thread links to work in both Discord app and browser ([#3](https://github.com/nathanperkins/race-team-planner/issues/3) by [Nathan])

#### Notification Updates

- **Live updates** - Discussion posts are now edited in place instead of creating new replies ([#7](https://github.com/nathanperkins/race-team-planner/issues/7) by [Nathan])
- **Team updates** - Adding members to existing teams now updates the team notification ([#8](https://github.com/nathanperkins/race-team-planner/issues/8) by [Nathan])
- **Driver mentions** - Team creators are now tagged when teams are formed ([#46](https://github.com/nathanperkins/race-team-planner/issues/46) by [Nathan])
- **Thread membership** - All involved drivers are automatically added to event and team threads ([#4](https://github.com/nathanperkins/race-team-planner/issues/4), [#65](https://github.com/nathanperkins/race-team-planner/issues/65), [#66](https://github.com/nathanperkins/race-team-planner/issues/66) by [Nathan])

#### Notification Fixes

- **Drop notifications** - Fixed missing notifications when drivers drop from registrations or teams ([#61](https://github.com/nathanperkins/race-team-planner/issues/61), [#64](https://github.com/nathanperkins/race-team-planner/issues/64) by [Steven])
- **First registration** - Fixed missing notification when registering for an event with no existing registrations ([#94](https://github.com/nathanperkins/race-team-planner/issues/94) by [Nathan])
- **Discussion post updates** - Event and team discussion posts now update when drivers drop from events, and unassigned drivers are properly shown ([#92](https://github.com/nathanperkins/race-team-planner/issues/92) by [Nathan])
- **Car class changes** - Changing a team's car class now properly updates and sends notifications ([#62](https://github.com/nathanperkins/race-team-planner/issues/62) by [Nathan])
- **Empty event handling** - Fixed notification errors when teams are picked for events with no registrations ([#63](https://github.com/nathanperkins/race-team-planner/issues/63) by [Steven])

### Race Eligibility & Safety

- **Ineligibility indicators** - Added red X shield icon next to racers registered for races they're ineligible for due to license or safety rating ([#77](https://github.com/nathanperkins/race-team-planner/issues/77) by [Nathan])
- **Registration warnings** - Show warning popup when ineligible users attempt to register for a race, but allow them to proceed ([#78](https://github.com/nathanperkins/race-team-planner/issues/78) by [Nathan])
- **Eligibility tooltips** - Added tooltips explaining why racers are ineligible for specific races ([#80](https://github.com/nathanperkins/race-team-planner/issues/80) by [Nathan])
- **Safety score improvements** - Enhanced handling of races with safety score requirements - shows warnings without blocking registration ([#32](https://github.com/nathanperkins/race-team-planner/issues/32) by [Kaelan])
- **Unknown safety score handling** - Added score badges for all racers, marking those with unknown stats as ineligible with red X shield ([#79](https://github.com/nathanperkins/race-team-planner/issues/79) by [Nathan])

### Events Page

- **Registration badges** - Events you're registered for now show a clear "Registered" badge in the events list ([#18](https://github.com/nathanperkins/race-team-planner/issues/18) by [Nathan])
- **Completed event handling** - Improved visibility of completed races with dimmed styling and sorted to bottom of list ([#75](https://github.com/nathanperkins/race-team-planner/issues/75), [#82](https://github.com/nathanperkins/race-team-planner/issues/82) by [Steven])
- **Change class button** - Re-added the ability to change car class from event details page, avoiding the drop/re-add workflow and enabling better Discord notifications ([#42](https://github.com/nathanperkins/race-team-planner/issues/42) by [Steven])
- **UI refinements** - Removed dropdown triangle from "Pick Teams" button since it's now a single-click action ([#41](https://github.com/nathanperkins/race-team-planner/issues/41) by [Steven])
- **Simplified controls** - Moved complex admin controls to team picker, streamlined event page for cleaner interface ([#9](https://github.com/nathanperkins/race-team-planner/issues/9) by [Steven])

### Team Picker

- **Immutable team names** - Team names can no longer be changed after initial creation to prevent Discord thread name mismatches ([#68](https://github.com/nathanperkins/race-team-planner/issues/68) by [Nathan])
- **Remove from team** - Fixed bug preventing removal of team members when Discord threads exist - now only blocks moving between teams ([#93](https://github.com/nathanperkins/race-team-planner/issues/93) by [Nathan])
- **Confirmation dialog** - Added confirmation modal showing diff of all changes, highlighting destructive changes (team moves, class changes) and which Discord threads will be created ([#5](https://github.com/nathanperkins/race-team-planner/issues/5) by [Steven])
- **Stable class sorting** - Fixed unassigned racer class groups shifting position while dragging drivers to teams ([#74](https://github.com/nathanperkins/race-team-planner/issues/74) by [Steven])
- **Rebalance fixes** - Team rebalance button now creates the correct number of teams based on max-per-team constraint ([#6](https://github.com/nathanperkins/race-team-planner/issues/6) by [Steven])
- **Performance fix** - Resolved infinite loading when removing newly registered drivers from team assignments ([#10](https://github.com/nathanperkins/race-team-planner/issues/10) by [Steven])

### User Experience

- **My Registrations sorting** - Upcoming events now show first ([#29](https://github.com/nathanperkins/race-team-planner/issues/29) by [Nathan])
- **Lock tooltip** - Moved iRacing ID lock explanation to a tooltip for cleaner UI ([#23](https://github.com/nathanperkins/race-team-planner/issues/23) by [Steven])
- **Modal scroll fix** - Disabled background scroll when event details modal is open ([#31](https://github.com/nathanperkins/race-team-planner/issues/31) by [Steven])
- **Badge styling** - Improved appearance of race badges to look more consistent ([#76](https://github.com/nathanperkins/race-team-planner/issues/76) by [Steven])
- **Expired event labels** - Fixed confusing "Teams pending assignment" message for expired events ([#52](https://github.com/nathanperkins/race-team-planner/issues/52) by [Steven])
- **Icon alignment** - Fixed misaligned thread icon in team picker ([#51](https://github.com/nathanperkins/race-team-planner/issues/51) by [Steven])

### Project Updates

- **Public release** - Renamed project and moved to public repository ([#27](https://github.com/nathanperkins/race-team-planner/issues/27) by [Nathan])
- **Legacy app retirement** - Decommissioned the previous planner application ([#54](https://github.com/nathanperkins/race-team-planner/issues/54) by [Steven])

## Version 1.0 {#version-1.0}

**Released on <time datetime="2026-02-09">February 9, 2026</time>**

All work completed by **[Nathan]** and **[Steven]**.

### Feedback Results

Thanks to our testers for these suggestions and bug reports!

- **Jacob G** - Move driver count to the timeslot.
- **Alex V** - Redirect users to the events page after onboarding.
- **Max L** - Add a confirmation dialog when changing the iRacing ID.
- **Alex V** - Open the user profile using the profile picture in the sidebar, instead of having a separate link.
- **Chris E** - `Sort By` is broken in the events view. We have removed that feature for now.
- **Jason** - Write the event and team thread titles with pacific time instead of UTC.
- **Alex V** - Remove redundant and inaccurate "times shown in UTC" message on events page.
- **Alex V** - Fix alignment on sign out button.
- **Alex V** - Fix incorrect week numbers for events list.

### Major Views

- **Events** - List of upcoming events with sorting and filters.
- **Event Details** - Race registration and team assignments.
- **Roster** - User iRacing data and number of events.
- **Team Expectations** - Expectations for racing events.
- **My Registrations** - Registrations for the current user.
- **Profile** - User profile and expectations.
- **Changelog** - Log of changes to the application by version.
- **Report Feedback** - Report feedback and bugs.
- **(Admin only) Registration** - Register racers for an event.
- **(Admin only) Team Picker** - Assign racers to teams for a specific event.
- **(Admin only) Admin Panel** - Manage events, teams, users, and notifications.

### Notifications / Threads

- **New user onboarded** notification.
- **New race registration** notification.
- **Teams assigned** notification.
- **Weekly upcoming events** notification (sent every Wednesday at 8:00 PM PST).
- **Discussion post (or thread)** per registered event (created when teams are picked).
- **Discussion post (or thread)** per registered team (created when teams are picked).

### Features

- **Discord user login** with roles pulled from the Discord server.
- **Automated sync** with the iRacing API for event, racer, and team data.
- **Onboarding flow** for new users with expectations and profile setup.

[Kaelan]: https://github.com/klanmiko
[Nathan]: https://github.com/nathanperkins
[Steven]: https://github.com/stevencase243
[Milestone 1]: https://github.com/nathanperkins/race-team-planner/issues?q=milestone%3A1.1+is%3Aclosed+reason%3Acompleted
[Milestone 2]: https://github.com/nathanperkins/race-team-planner/issues?q=milestone%3A1.2+is%3Aclosed+reason%3Acompleted
[Feedback 1]: https://github.com/nathanperkins/race-team-planner/issues?q=milestone%3A1.1%20is%3Aclosed%20reason%3Acompleted%20label%3Afeedback
[Feedback 2]: https://github.com/nathanperkins/race-team-planner/issues?q=milestone%3A1.2%20is%3Aclosed%20reason%3Acompleted%20label%3Afeedback
