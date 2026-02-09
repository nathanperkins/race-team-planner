# Changelog

The most notable changes to this project are documented here.

## Version 1.0 {#version-1.0}

**Released on <time datetime="2026-02-09">February 9, 2026</time>**

All work completed by **Nathan Perkins** and **Steven Case**.

### Feedback Results

Thanks to our testers for these suggestions and bug reports!

- **Jacob G** - Move driver count to the timeslot.
- **Alex V** - Redirect users to the events page after onboarding.
- **Max L** - Add a confirmation dialog when changing the iRacing ID.
- **Alex V** - Open the user profile using the profile picture in the sidebar, instead of having a separate link.
- **Chris E** - `Sort By` is broken in the events view. We have removed that feature for now.

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
