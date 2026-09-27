# TickTock

**Name:** TickTock  
**Type:** Personal coding/study time tracker  
**Platform:** Responsive web application  
**Primary user:** Single user, initially personal use  
**Stack:** Next.js, TypeScript, SQLite, Drizzle ORM, Tailwind CSS, shadcn/ui  
**Design direction:** Minimal SaaS + playful productivity tool

---

# 1. Product Overview

TickTock is a lightweight personal time-tracking web application designed specifically for coding and technical exam preparation.

The application helps the user:

1. Start focused coding sessions.
2. Track exactly what they are studying.
3. Record how much time they actually spend.
4. Review previous sessions.
5. Understand where their study time is going.
6. Maintain consistency without turning studying into a gamification-heavy productivity game.

The core philosophy is:

> **Track the work. Don't turn tracking the work into the work.**

The application should feel fast, calm, minimal, and slightly playful.

---

# 2. Problem

During exam preparation, "I studied for 5 hours" is often misleading.

A user may spend five hours at their computer but only spend three hours actually coding, revising, or solving problems.

The application should therefore distinguish between:

- Time spent at the desk
- Active focused time
- Subject
- Topic
- Session
- Actual outcome

The goal is not to maximize hours.

The goal is to make the user's study behavior visible.

---

# 3. Product Goals

## Primary goals

### G1. Start tracking within seconds

The user should be able to open the application and start a session almost immediately.

### G2. Make coding time measurable

Every completed session should provide:

- Subject
- Topic
- Start time
- End time
- Duration
- Optional outcome
- Optional notes

### G3. Provide useful historical data

The user should be able to understand:

- How much they studied today
- How much they studied this week
- Which subjects received the most time
- Which topics were studied
- How many sessions were completed
- Average session duration

### G4. Keep the interface distraction-free

The application itself must not become a distraction.

### G5. Make the product enjoyable

Use subtle playful interactions, microanimations, encouraging states, and personality without turning the interface into a cartoon.

---

# 4. Non-Goals

The following are explicitly outside the initial scope:

- Social features
- Leaderboards
- Public profiles
- Team collaboration
- Calendar synchronization
- AI study coach
- AI-generated study plans
- Mobile native application
- Complex notification system
- Subscription billing
- Multi-tenant SaaS architecture
- Advanced authentication
- Browser activity monitoring
- Automatic detection of coding activity
- Productivity scoring

These may be considered later, but they should not exist in V1.

---

# 5. Target User

The initial user is a technical student preparing for exams.

Typical workflow:

```text
Open TickTock
      ↓
Choose subject
      ↓
Choose topic
      ↓
Start session
      ↓
Study / code
      ↓
Pause when distracted or taking a break
      ↓
Resume
      ↓
Finish session
      ↓
Record outcome
      ↓
Continue studying
```

---

# 6. Core Product Concept

The fundamental entity is a **Study Session**.

Everything revolves around sessions.

```text
Subject
   ↓
Topic
   ↓
Study Session
   ├── Start
   ├── Pause
   ├── Resume
   ├── Stop
   ├── Duration
   ├── Outcome
   └── Notes
```

The timer is simply the interface for creating and managing a session.

---

# 7. Information Architecture

The application should have a very small navigation system.

```text
TickTock

├── Dashboard
├── Sessions
├── Analytics
└── Settings
```

### Dashboard

Primary working screen.

### Sessions

Historical session list.

### Analytics

Study patterns and statistics.

### Settings

Application preferences and data management.

---

# 8. Dashboard

The dashboard is the most important screen.

It should immediately answer:

> "What am I doing right now, and how much have I done today?"

## Layout

Desktop:

```text
┌───────────────────────────────────────────────────────┐
│ TickTock                           Today · 4h 32m     │
├────────────┬──────────────────────────────────────────┤
│            │                                          │
│ Dashboard  │              CURRENT SESSION             │
│ Sessions   │                                          │
│ Analytics  │              01:24:36                    │
│ Settings   │                                          │
│            │              DSA                         │
│            │              Binary Search               │
│            │                                          │
│            │       [ Pause ] [ Finish ]               │
│            │                                          │
├────────────┴──────────────────────────────────────────┤
│                                                      │
│ Today                                                │
│                                                      │
│ 4h 32m focused        6 sessions       +12%          │
│                                                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│ Recent sessions                                      │
│                                                      │
│ DSA · Binary Search              52m                 │
│ DBMS · Normalization             38m                 │
│ OS · Processes                    44m                 │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

# 9. Active Session UI

The active timer should dominate the interface.

Avoid a traditional giant stopwatch aesthetic.

Instead:

```text
DSA

Binary Search

01:42:36

Focused time

[ Pause ]      [ Finish ]
```

Use large typography.

The timer should be visually calm.

### Timer states

#### Idle

```text
Ready to code?

[ Start session ]
```

#### Running

```text
01:42:36

[ Pause ] [ Finish ]
```

#### Paused

```text
Paused

01:42:36

[ Resume ] [ Finish ]
```

#### Completed

Show a short completion state:

```text
Nice.

You focused for
1h 42m

[ Save session ]
```

The completion state should disappear quickly and return the user to the dashboard.

---

# 10. Starting a Session

Clicking "Start session" opens a compact modal or command-style sheet.

```text
Start session

Subject
[ DSA                         ▼ ]

Topic
[ Binary Search                 ]

Optional goal
[ Solve 5 problems              ]

                 [ Start ]
```

Subject should be selectable quickly.

The user should not be forced to fill unnecessary fields.

### Required

- Subject

### Optional

- Topic
- Goal

If topic is omitted, the session can still start.

---

# 11. Pause Behavior

Pause means the timer stops accumulating focused time.

Example:

```text
10:00 Start
10:45 Pause

Focused duration = 45 minutes
```

After:

```text
11:05 Resume
11:40 Finish
```

Final duration:

```text
80 minutes
```

The 20-minute pause should not count toward focused time.

The backend should store enough information to accurately calculate this.

---

# 12. Session Completion

When the user clicks Finish, open a small completion dialog.

```text
Session complete

1h 18m focused

What did you accomplish?

○ Learned
○ Revised
○ Solved problems
○ Built something
○ Practiced
○ Nothing specific

Notes
[ __________________________ ]

        [ Save session ]
```

Outcome should be optional.

The user should never be forced to write a journal entry.

---

# 13. Today's Summary

Dashboard should show a compact summary.

Example:

```text
Today

4h 32m
focused

6 sessions
3 subjects
```

Additional small metric:

```text
Longest session
1h 14m
```

Avoid excessive KPI cards.

Three or four metrics are enough.

---

# 14. Daily Progress

The dashboard should have a lightweight daily progress visualization.

Example:

```text
TODAY

██████████████████░░░░
4h 32m / 6h goal
```

The daily goal should be configurable.

Default:

```text
4 hours
```

The progress indicator must never feel punitive.

If the user misses the goal:

```text
2h 18m / 4h

Still 2h 18m of real work.
```

Avoid red warning states.

---

# 15. Recent Sessions

Show the latest sessions directly on the dashboard.

Example:

```text
Recent

DSA
Binary Search
52m                         Today

DBMS
Normalization
38m                         Today

Operating Systems
Processes
44m                         Yesterday
```

Each session can be clicked to view details.

---

# 16. Sessions Page

The Sessions page is the complete history.

Desktop layout:

```text
Sessions

[ All subjects ▼ ] [ This week ▼ ] [ Search ]

────────────────────────────────────

Today

DSA
Binary Search
52m                    10:20 AM

DBMS
Normalization
38m                    11:30 AM

DSA
Trees
1h 04m                 1:10 PM
```

Sessions should be grouped by date.

Example:

```text
Today
Yesterday
Monday
Sunday
```

---

# 17. Session Detail

Clicking a session opens a detail panel.

```text
DSA

Binary Search

52 minutes

Today · 10:20 AM

Outcome
Solved problems

Goal
Solve 5 problems

Notes
Implemented binary search variations
and solved 6 problems.
```

Actions:

```text
[ Edit ]
[ Delete ]
```

Deleting should require confirmation.

---

# 18. Analytics

Analytics should answer useful questions, not produce decorative charts.

## Main metrics

```text
This week

23h 18m focused
31 sessions
45m average session
6h 42m longest day
```

## Daily activity

A simple bar chart:

```text
Mon  ███████       3h 20m
Tue  ██████████    4h 45m
Wed  █████         2h 18m
Thu  ████████      3h 57m
Fri  ███████████   5h 02m
Sat  ███            1h 36m
Sun  ██             1h 02m
```

## Time by subject

```text
DSA                  11h 42m
DBMS                   5h 20m
Operating Systems      4h 03m
Networking              2h 13m
```

## Time by topic

Only show this when enough data exists.

```text
Trees                   4h 32m
Binary Search            2h 10m
Normalization            1h 42m
Processes                1h 20m
```

---

# 19. Useful Analytics

Avoid vanity statistics.

Useful:

- Total focused time
- Average session length
- Sessions completed
- Longest session
- Longest study day
- Subject distribution
- Topic distribution
- Daily consistency
- Focused vs paused time

Not useful:

- Productivity score
- "Brain power"
- XP
- Fake productivity percentage
- Random badges
- "You are 87% productive"

The application should show data, not pretend to scientifically measure productivity.

---

# 20. Playful UX

The visual design should be minimal but have personality.

Use micro-interactions rather than excessive illustrations.

Examples:

### Start

Button subtly expands when hovered.

### Timer

Very subtle pulse while running.

### Completion

Small celebratory animation.

Example:

```text
✓

1h 42m focused

Good work.
```

### Daily goal completed

```text
Daily goal complete.

You can stop guilt-free.
```

### No sessions today

Instead of:

```text
No data available.
```

Use:

```text
Nothing tracked yet.

Ready when you are.
```

### Empty history

```text
Your history is empty.

Future-you is going to appreciate this page.
```

Playful copy should be subtle and occasional.

---

# 21. Visual Design

## Design personality

The UI should combine:

- SaaS dashboard structure
- Minimal typography
- Generous whitespace
- Soft borders
- Slightly rounded components
- Subtle motion
- Playful microcopy

Think:

**Linear + Raycast + modern indie productivity app**

rather than:

**Duolingo + generic Pomodoro app**

---

# 22. Color System

Use a restrained neutral base.

Example:

```text
Background
#FAFAFA / dark equivalent

Foreground
near-black / near-white

Muted
gray

Border
very subtle gray

Accent
one playful accent color
```

Only one primary accent should be used.

Do not turn every component into a colorful card.

Dark mode should be supported.

---

# 23. Typography

Recommended:

### Primary

Inter / Geist / Manrope

### Timer

Use the same family with:

- large size
- heavy weight
- tight tracking

Avoid decorative fonts.

Typography should carry most of the visual personality.

---

# 24. Component Design

Use a consistent component system.

Core components:

```text
Button
Card
Dialog
Select
Input
Textarea
Dropdown
Tabs
Progress
Badge
Tooltip
Calendar
Chart
```

Avoid creating custom components when shadcn/ui already solves the problem.

---

# 25. Responsive Design

The application must work well on:

- Desktop
- Laptop
- Tablet
- Mobile

Mobile dashboard:

```text
TickTock

Today
4h 32m

01:24:36

DSA
Binary Search

[ Pause ]

Today
────────────

6 sessions

DSA             2h 10m
DBMS             1h 02m
OS                 30m
```

Navigation can become a bottom navigation or compact menu.

---

# 26. Keyboard Shortcuts

Because the target user codes frequently, keyboard shortcuts are valuable.

Initial shortcuts:

```text
Space       Pause / Resume
S           Start session
F           Finish session
M           Full page focus mode
T           Toggle light / dark theme
Esc         Close modal
```

Shortcuts should not interfere with text inputs.

A small keyboard shortcut help dialog can be available through:

```text
?
```

---

# 27. Database

Use SQLite with Drizzle ORM.

Initial schema:

```text
subjects
────────────
id
name
created_at

topics
────────────
id
subject_id
name
created_at

sessions
────────────
id
subject_id
topic_id
started_at
ended_at
duration_seconds
paused_seconds
outcome
goal
notes
created_at
updated_at
```

Potential future tables:

```text
daily_goals
settings
session_pauses
```

Do not create these unless they are actually required.

---

# 28. Session State

The frontend should maintain the live timer state.

Possible states:

```text
idle
running
paused
completed
```

The server/database stores the durable session information.

The timer should not depend on continuously sending requests every second.

Bad:

```text
Browser
 ↓
API every second
 ↓
Database
```

Good:

```text
Start
 ↓
Store session start
 ↓
Timer runs locally
 ↓
Pause / Resume events
 ↓
Finish
 ↓
Persist final session
```

---

# 29. Timer Accuracy

Never increment the timer with:

```ts
seconds++
```

as the source of truth.

Browser timers can drift.

Instead calculate elapsed time from timestamps.

Conceptually:

```text
elapsed =
currentTime
-
startTime
-
totalPausedDuration
```

The UI may update every second, but elapsed time should be derived from actual timestamps.

---

# 30. Data Integrity

If the browser is refreshed while a session is running, the application should recover the active session.

Example:

```text
Session running

Refresh browser

        ↓

TickTock detects active session

        ↓

Restore timer
```

The server should therefore know whether an active session exists.

There should be no accidental loss of a 2-hour session because the user refreshed the page.

---

# 31. Error Handling

Errors should be understandable.

Bad:

```text
500 Internal Server Error
```

Better:

```text
Couldn't save the session.

Your timer is still safe.
Try again.
```

The UI should never silently lose session data.

---

# 32. Offline Consideration

V1 can be primarily local/self-hosted.

However, the architecture should avoid making the timer dependent on network latency.

The timer must continue working if the API temporarily becomes unavailable.

Future enhancement:

- Offline session queue
- Sync when connection returns

Not required for V1.

---

# 33. Settings

Keep Settings extremely small.

### General

- Daily focus goal
- Theme
- Default subject

### Timer

- Default session mode
- Optional sound
- Optional completion animation

### Data

- Export data
- Import data
- Delete all sessions

Export format:

```text
JSON
CSV
```

Data export is especially useful because this is a personal tracking application.

---

# 34. Data Export

Example JSON:

```json
{
  "exportedAt": "...",
  "subjects": [],
  "topics": [],
  "sessions": []
}
```

CSV:

```text
date,subject,topic,duration,outcome,notes
```

This should be implemented before any unnecessary feature.

Your data belongs to you.

---

# 35. Authentication

V1 does not require authentication if the application is purely local/personal.

If deployed publicly later, authentication can be added.

Do not introduce authentication merely because "real SaaS apps have auth."

---

# 36. API Structure

Potential API structure:

```text
/api/subjects
/api/topics
/api/sessions
/api/sessions/active
/api/analytics/daily
/api/analytics/subjects
/api/analytics/topics
```

Use Server Actions instead where they make the code cleaner.

Do not create APIs purely for architectural decoration.

---

# 37. Core User Stories

## Session tracking

**As a user**, I want to start a coding session quickly so I can begin studying without friction.

**As a user**, I want to pause a session so breaks do not count toward my focused time.

**As a user**, I want to resume a paused session.

**As a user**, I want to finish a session and record what I accomplished.

---

## History

**As a user**, I want to see my previous sessions so I can understand how I spent my time.

**As a user**, I want to edit incorrect session information.

**As a user**, I want to delete accidental sessions.

---

## Analytics

**As a user**, I want to see my daily focused time.

**As a user**, I want to see how much time I spend on each subject.

**As a user**, I want to see my weekly study pattern.

---

## Data

**As a user**, I want to export my data so I am not locked into the application.

---

# 38. V1 Feature Set

The first release should contain exactly:

### Core

- Dashboard
- Start session
- Pause
- Resume
- Finish
- Subject
- Topic
- Session history
- Session details
- Edit session
- Delete session

### Statistics

- Today's total
- Weekly total
- Subject totals
- Session count
- Average session
- Daily chart

### UX

- Dark mode
- Responsive layout
- Keyboard shortcuts
- Subtle animations
- Empty states

### Data

- SQLite
- Drizzle
- JSON export
- CSV export

That's enough.

---

# 39. V2 Ideas

Only consider these after using V1 for at least several days.

Potential features:

- Pomodoro mode
- Custom timer presets
- Study goals
- Topic completion
- Calendar heatmap
- Focus streaks
- Distraction tracking
- Session templates
- Browser notifications
- PWA
- Offline support

---

# 40. Features to Avoid Unless There Is a Real Need

Do not add:

- AI coach
- Motivational quotes
- Avatar
- XP
- Coins
- Level system
- Leaderboards
- Social feed
- Friends
- Public profiles
- Complex badges
- Productivity score

These would shift the product away from its core purpose.

---

# 41. Success Metrics

Because this is a personal application, success should not be measured by users or revenue.

The meaningful metrics are:

```text
Can I start a session in <10 seconds?

Can I reliably recover an active session?

Can I understand today's work in <5 seconds?

Can I understand this week's work in <30 seconds?

Can I record a completed session in <15 seconds?

Does the app make me want to study rather than configure the app?
```

The final question is the most important.

---

# 42. UX Principle

Every screen should pass this test:

> **Does this help me study, understand my study, or recover useful information about my study?**

If not, remove it.

---

# 43. Definition of Done

V1 is complete when:

- User can create subjects.
- User can create/select topics.
- User can start a session.
- Timer accurately tracks focused time.
- User can pause/resume.
- Refreshing the page does not destroy an active session.
- User can finish a session.
- Session is persisted in SQLite.
- User can add an outcome and notes.
- Dashboard shows today's data.
- History shows previous sessions.
- Analytics show useful weekly information.
- User can edit/delete sessions.
- User can export data.
- Dark mode works.
- Mobile layout works.
- Keyboard shortcuts work.
- No major interaction requires unnecessary navigation.
- The UI remains visually minimal.

---

# 44. Final Product Philosophy

TickTock should not feel like another productivity system demanding that the user maintain it.

It should feel like a **quiet instrument sitting beside the code editor**.

Open it.

Choose what you're working on.

Start.

Code.

Stop.

See what you actually accomplished.

That's the product.