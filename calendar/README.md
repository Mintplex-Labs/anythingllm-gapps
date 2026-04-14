# AnythingLLM Google Calendar Bridge

A Google Apps Script web app that provides a REST API for interacting with Google Calendar. Designed for use with AnythingLLM and other LLM-based tools.

## Setup

1. Create a new Google Apps Script project at [script.google.com](https://script.google.com)
2. Copy the contents of `index.gs` into the script editor
3. **IMPORTANT**: Change the `API_KEY` constant to a secure random string
4. Click **Deploy** > **New Deployment** > **Web App**
5. Set **Execute as** to "Me" and **Who has access** to "Anyone"
6. Copy the deployment URL for use in your application

## Authentication

All requests must include the API key in the JSON payload:

```json
{
  "key": "YOUR_API_KEY",
  "action": "list_calendars"
}
```

## API Reference

### Calendars

#### `list_calendars`
List all calendars the user owns or is subscribed to.

```json
{
  "key": "YOUR_API_KEY",
  "action": "list_calendars"
}
```

#### `get_calendar`
Get details of a specific calendar.

```json
{
  "key": "YOUR_API_KEY",
  "action": "get_calendar",
  "calendarId": "calendar_id_here"
}
```

---

### Read Events

#### `get_event`
Get a single event by ID.

```json
{
  "key": "YOUR_API_KEY",
  "action": "get_event",
  "eventId": "event_id_here",
  "calendarId": "optional_calendar_id"
}
```

#### `get_events_for_day`
Get all events for a specific day.

```json
{
  "key": "YOUR_API_KEY",
  "action": "get_events_for_day",
  "date": "2024-12-25",
  "calendarId": "optional_calendar_id"
}
```

#### `get_events`
Get events within a date range, optionally filtered by a search query.

**Get all events in range:**
```json
{
  "key": "YOUR_API_KEY",
  "action": "get_events",
  "startDate": "2024-12-01T00:00:00Z",
  "endDate": "2024-12-31T23:59:59Z",
  "calendarId": "optional_calendar_id",
  "limit": 25
}
```

**Search events by text:**
```json
{
  "key": "YOUR_API_KEY",
  "action": "get_events",
  "startDate": "2024-12-01T00:00:00Z",
  "endDate": "2024-12-31T23:59:59Z",
  "query": "meeting",
  "calendarId": "optional_calendar_id",
  "limit": 25
}
```

---

### Write Events

#### `quick_add`
Create an event from a natural language description. Uses Google's smart parsing.

```json
{
  "key": "YOUR_API_KEY",
  "action": "quick_add",
  "description": "Meeting with John tomorrow at 3pm for 1 hour",
  "calendarId": "optional_calendar_id"
}
```

#### `create_event`
Unified event creation that handles all event types:
- Timed events (with start/end times)
- All-day events (single or multi-day)
- Recurring events (timed or all-day)

**Timed event:**
```json
{
  "key": "YOUR_API_KEY",
  "action": "create_event",
  "title": "Team Standup",
  "startTime": "2024-12-20T09:00:00-05:00",
  "endTime": "2024-12-20T09:30:00-05:00",
  "calendarId": "optional_calendar_id",
  "description": "Daily team sync",
  "location": "Conference Room A",
  "guests": ["alice@example.com", "bob@example.com"],
  "sendInvites": true
}
```

**All-day event (single day):**
```json
{
  "key": "YOUR_API_KEY",
  "action": "create_event",
  "title": "Company Holiday",
  "allDay": true,
  "date": "2024-12-25",
  "description": "Office closed"
}
```

**All-day event (multi-day):**
```json
{
  "key": "YOUR_API_KEY",
  "action": "create_event",
  "title": "Conference",
  "allDay": true,
  "date": "2024-12-10",
  "endDate": "2024-12-12"
}
```

**Recurring timed event:**
```json
{
  "key": "YOUR_API_KEY",
  "action": "create_event",
  "title": "Team Standup",
  "startTime": "2024-12-02T09:00:00-05:00",
  "endTime": "2024-12-02T09:30:00-05:00",
  "recurrence": {
    "frequency": "weekly",
    "daysOfWeek": ["MONDAY", "WEDNESDAY", "FRIDAY"],
    "count": 12
  },
  "description": "Daily sync meeting"
}
```

**Recurring all-day event:**
```json
{
  "key": "YOUR_API_KEY",
  "action": "create_event",
  "title": "Weekly Planning Day",
  "allDay": true,
  "date": "2024-12-02",
  "recurrence": {
    "frequency": "weekly",
    "daysOfWeek": ["MONDAY"],
    "count": 10
  }
}
```

**Recurrence Options:**
| Field | Type | Description |
|-------|------|-------------|
| `frequency` | string | Required. One of: `daily`, `weekly`, `monthly`, `yearly` |
| `interval` | number | Repeat every N periods (default: 1) |
| `count` | number | Total number of occurrences |
| `until` | string | ISO date to end recurrence (alternative to count) |
| `daysOfWeek` | array | For weekly: `["MONDAY", "TUESDAY", ...]` |

---

### Update Events

#### `update_event`
Update an existing event. Only provided fields are updated.

```json
{
  "key": "YOUR_API_KEY",
  "action": "update_event",
  "eventId": "event_id_here",
  "calendarId": "optional_calendar_id",
  "title": "Updated Title",
  "description": "New description",
  "location": "New Location",
  "startTime": "2024-12-20T10:00:00-05:00",
  "endTime": "2024-12-20T11:00:00-05:00",
  "guests": ["newemail@example.com"]
}
```

---

### RSVP

#### `set_my_status`
Set your RSVP status for an event.

```json
{
  "key": "YOUR_API_KEY",
  "action": "set_my_status",
  "eventId": "event_id_here",
  "status": "YES",
  "calendarId": "optional_calendar_id"
}
```

**Valid status values:** `YES`, `NO`, `MAYBE`, `INVITED`

---

### Utility

#### `version`
Get API version and list of available actions.

```json
{
  "key": "YOUR_API_KEY",
  "action": "version"
}
```

---

## Event Response Format

All event responses include `eventId` and `calendarId` for chained operations:

```json
{
  "eventId": "abc123@google.com",
  "calendarId": "primary",
  "title": "Team Meeting",
  "description": "Weekly sync",
  "location": "Conference Room",
  "isAllDayEvent": false,
  "isRecurringEvent": false,
  "isOwnedByMe": true,
  "myStatus": "OWNER",
  "startTime": "2024-12-20T09:00:00-05:00",
  "endTime": "2024-12-20T10:00:00-05:00",
  "dateCreated": "2024-12-15T10:30:00-05:00",
  "lastUpdated": "2024-12-15T10:30:00-05:00",
  "creators": ["user@example.com"],
  "guests": [
    {
      "email": "guest@example.com",
      "name": "Guest Name",
      "status": "INVITED",
      "additionalGuests": 0
    }
  ],
  "visibility": "DEFAULT",
  "transparency": "OPAQUE"
}
```

## Notes

- All date/time parameters should be ISO 8601 format strings
- If `calendarId` is omitted, the user's primary calendar is used
- Event IDs are in iCalUID format and persist across API calls
- The API does not support deleting events or calendars (by design)
- Maximum of 100 events returned per query (configurable via `limit`)

## Error Handling

Errors are returned with status "error":

```json
{
  "status": "error",
  "error": "Event not found: invalid_id",
  "timestamp": "2024-12-15T10:30:00.000Z"
}
```

## Development

This project uses `@types/google-apps-script` for type hints. Install dependencies with:

```bash
yarn install
```
