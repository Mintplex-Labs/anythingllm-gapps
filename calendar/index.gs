/// <reference path="./node_modules/@types/google-apps-script/index.d.ts" />
/**
 * LEGAL DISCLAIMER
 *
 * Copyright (c) Mintplex Labs Inc.
 *
 * This software is provided "as is", without warranty of any kind, express or
 * implied, including but not limited to the warranties of merchantability,
 * fitness for a particular purpose, and noninfringement. In no event shall
 * Mintplex Labs Inc., its affiliates, subsidiaries, officers, directors,
 * employees, agents, or any associated entities be liable for any claim,
 * damages, or other liability, whether in an action of contract, tort, or
 * otherwise, arising from, out of, or in connection with the software or the
 * use or other dealings in the software.
 *
 * Mintplex Labs Inc. and its associated entities shall not be held responsible
 * for any direct, indirect, incidental, special, exemplary, or consequential
 * damages including, but not limited to: loss of data, loss of information,
 * loss of profits, business interruption, personal injury, or any other
 * damages arising from the use or inability to use this software.
 *
 * By using this software, you acknowledge and agree that you do so at your own
 * risk and that you are solely responsible for any consequences that may arise
 * from such use.
 *
 * See the LICENSE and DISCLAIMER files in the root directory for more details.
 */

/**
 * ANYTHINGLLM GOOGLE CALENDAR BRIDGE
 * Instructions:
 * 1. Change the API_KEY below to a random string. **YOU MUST DO THIS** */
const API_KEY = "CHANGE_ME_TO_SOMETHING_SECURE";
/* 2. Click 'Deploy' > 'New Deployment' > 'Web App'.
 * 3. Set 'Execute as' to 'Me' and 'Who has access' to 'Anyone'.
 *
 * Supported actions (pass as `action` in JSON payload):
 *
 * CALENDARS
 *   list_calendars       - List all calendars the user owns or is subscribed to
 *   get_calendar         - Get details of a specific calendar by ID
 *
 * READ EVENTS
 *   get_event            - Get a single event by ID
 *                          - eventId (required)
 *                          - calendarId (optional)
 *   get_events_for_day   - Get all events for a specific day
 *                          - date (required): ISO date string
 *                          - calendarId (optional)
 *   get_events           - Get events within a date range, optionally filtered by search query
 *                          - startDate (required): ISO datetime string
 *                          - endDate (required): ISO datetime string
 *                          - query (optional): Text to search for in events
 *                          - calendarId (optional)
 *                          - limit (optional): Max results (default 25, max 100)
 *
 * WRITE EVENTS
 *   quick_add            - Create event from natural language description
 *                          - description (required): e.g. "Meeting with John tomorrow at 3pm"
 *                          - calendarId (optional)
 *   create_event         - Create a single or recurring event (timed or all-day)
 *                          - title (required): Event title
 *                          - For timed events:
 *                            - startTime (required): ISO datetime string
 *                            - endTime (required): ISO datetime string
 *                          - For all-day events:
 *                            - allDay (required): true
 *                            - date (required): ISO date string (YYYY-MM-DD)
 *                            - endDate (optional): For multi-day events
 *                          - For recurring events, add:
 *                            - recurrence (required): Object with:
 *                              - frequency: "daily", "weekly", "monthly", or "yearly"
 *                              - interval (optional): Repeat every N periods (default 1)
 *                              - count (optional): Number of occurrences
 *                              - until (optional): ISO date to end recurrence
 *                              - daysOfWeek (optional): Array for weekly, e.g. ["MONDAY", "WEDNESDAY"]
 *                          - calendarId (optional): Calendar to create in
 *                          - description (optional): Event notes
 *                          - location (optional): Event location
 *                          - guests (optional): Array of email addresses
 *                          - sendInvites (optional): Boolean to send invite emails
 *
 * UPDATE EVENTS
 *   update_event         - Update an existing event
 *                          - eventId (required): ID of event to update
 *                          - calendarId (optional)
 *                          - title, description, location (optional): New values
 *                          - startTime, endTime (optional): New times as ISO strings
 *                          - guests (optional): Replace guest list
 *
 * RSVP
 *   set_my_status        - Set your RSVP status for an event
 *                          - eventId (required)
 *                          - status (required): "YES", "NO", "MAYBE", or "INVITED"
 *                          - calendarId (optional)
 *
 * UTILITY
 *   version              - API version and available actions
 *
 * NOTES:
 * - All date/time parameters should be ISO 8601 format strings
 * - If calendarId is omitted, the user's primary calendar is used
 * - All responses include eventId and calendarId for chained operations
 * - Event IDs are iCalUID format and can be used across API calls
 */

const VERSION = "1.0.0";

const MAX_EVENTS_RESULTS = 100;
const DEFAULT_EVENTS_LIMIT = 25;

function validateApiKey(payload) {
  if (API_KEY === "CHANGE_ME_TO_SOMETHING_SECURE") {
    throw new Error(
      "API_KEY has not been configured. Please set a secure API key before deploying.",
    );
  }
  if (!payload?.key) return false;
  return String(payload.key) === String(API_KEY);
}

function createResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function parsePayload(e) {
  if (!e?.postData?.contents) return null;
  try {
    return JSON.parse(e.postData.contents);
  } catch (_) {
    return null;
  }
}

function ok(data) {
  return {
    status: "ok",
    data: data,
    timestamp: new Date().toISOString(),
  };
}

function fail(error) {
  return {
    status: "error",
    error: String(error),
    timestamp: new Date().toISOString(),
  };
}

function logRequest(action) {
  Logger.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      action: action || "unknown",
    }),
  );
}

function clamp(n, lo, hi) {
  return Math.min(Math.max(Number(n) || lo, lo), hi);
}

function parseDate(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date format: ${isoString}`);
  }
  return d;
}

function getCalendar(calendarId) {
  if (calendarId) {
    const cal = CalendarApp.getCalendarById(calendarId);
    if (!cal) throw new Error(`Calendar not found: ${calendarId}`);
    return cal;
  }
  return CalendarApp.getDefaultCalendar();
}

function serializeCalendar(cal) {
  return {
    calendarId: cal.getId(),
    name: cal.getName(),
    description: cal.getDescription(),
    timeZone: cal.getTimeZone(),
    isHidden: cal.isHidden(),
    isSelected: cal.isSelected(),
    isOwnedByMe: cal.isOwnedByMe(),
    isPrimary: cal.isMyPrimaryCalendar(),
  };
}

function serializeGuest(guest) {
  return {
    email: guest.getEmail(),
    name: guest.getName(),
    status: guest.getGuestStatus().toString(),
    additionalGuests: guest.getAdditionalGuests(),
  };
}

function serializeEvent(event) {
  const isAllDay = event.isAllDayEvent();
  const isRecurring = event.isRecurringEvent();

  const result = {
    eventId: event.getId(),
    calendarId: event.getOriginalCalendarId(),
    title: event.getTitle(),
    description: event.getDescription(),
    location: event.getLocation(),
    isAllDayEvent: isAllDay,
    isRecurringEvent: isRecurring,
    isOwnedByMe: event.isOwnedByMe(),
    myStatus: event.getMyStatus().toString(),
    dateCreated: event.getDateCreated(),
    lastUpdated: event.getLastUpdated(),
    creators: event.getCreators(),
    guests: event.getGuestList(true).map(serializeGuest),
    visibility: event.getVisibility().toString(),
    transparency: event.getTransparency().toString(),
  };

  if (isAllDay) {
    result.startDate = event.getAllDayStartDate();
    result.endDate = event.getAllDayEndDate();
  } else {
    result.startTime = event.getStartTime();
    result.endTime = event.getEndTime();
  }

  return result;
}

function serializeEventSeries(series) {
  return {
    eventSeriesId: series.getId(),
    calendarId: series.getOriginalCalendarId(),
    title: series.getTitle(),
    description: series.getDescription(),
    location: series.getLocation(),
    isOwnedByMe: series.isOwnedByMe(),
    myStatus: series.getMyStatus().toString(),
    dateCreated: series.getDateCreated(),
    lastUpdated: series.getLastUpdated(),
    creators: series.getCreators(),
    guests: series.getGuestList(true).map(serializeGuest),
    visibility: series.getVisibility().toString(),
    transparency: series.getTransparency().toString(),
  };
}

const CREATED_BY_SUFFIX = "\n\nCreated by AnythingLLM";

function appendCreatedBySuffix(description) {
  return (description || "") + CREATED_BY_SUFFIX;
}

function buildEventOptions(payload) {
  const opts = {};
  opts.description = appendCreatedBySuffix(payload.description);
  if (payload.location) opts.location = payload.location;
  if (Array.isArray(payload.guests) && payload.guests.length > 0) {
    opts.guests = payload.guests.join(",");
    opts.sendInvites = payload.sendInvites === true;
  }
  return opts;
}

function buildRecurrence(recurrenceConfig) {
  if (!recurrenceConfig || !recurrenceConfig.frequency) {
    throw new Error(
      "Recurrence requires a 'frequency' (daily, weekly, monthly, yearly)",
    );
  }

  const recurrence = CalendarApp.newRecurrence();
  let rule;

  switch (recurrenceConfig.frequency.toLowerCase()) {
    case "daily":
      rule = recurrence.addDailyRule();
      break;
    case "weekly":
      rule = recurrence.addWeeklyRule();
      break;
    case "monthly":
      rule = recurrence.addMonthlyRule();
      break;
    case "yearly":
      rule = recurrence.addYearlyRule();
      break;
    default:
      throw new Error(`Unknown frequency: ${recurrenceConfig.frequency}`);
  }

  if (recurrenceConfig.interval && recurrenceConfig.interval > 1) {
    rule.interval(recurrenceConfig.interval);
  }

  if (recurrenceConfig.count) {
    rule.times(recurrenceConfig.count);
  } else if (recurrenceConfig.until) {
    rule.until(parseDate(recurrenceConfig.until));
  }

  if (
    Array.isArray(recurrenceConfig.daysOfWeek) &&
    recurrenceConfig.daysOfWeek.length > 0
  ) {
    const weekdays = recurrenceConfig.daysOfWeek.map((day) => {
      const weekday = CalendarApp.Weekday[day.toUpperCase()];
      if (!weekday) throw new Error(`Invalid weekday: ${day}`);
      return weekday;
    });
    rule.onlyOnWeekdays(weekdays);
  }

  return recurrence;
}

function parseGuestStatus(statusStr) {
  const statusMap = {
    YES: CalendarApp.GuestStatus.YES,
    NO: CalendarApp.GuestStatus.NO,
    MAYBE: CalendarApp.GuestStatus.MAYBE,
    INVITED: CalendarApp.GuestStatus.INVITED,
  };
  const status = statusMap[statusStr?.toUpperCase()];
  if (!status) {
    throw new Error(
      `Invalid status: ${statusStr}. Use YES, NO, MAYBE, or INVITED.`,
    );
  }
  return status;
}

function hasKeys(obj) {
  return Object.keys(obj).length > 0;
}

class CalendarManager {
  listCalendars() {
    const calendars = CalendarApp.getAllCalendars();
    return {
      totalCalendars: calendars.length,
      calendars: calendars.map(serializeCalendar),
    };
  }

  getCalendarInfo(calendarId) {
    const cal = getCalendar(calendarId);
    return serializeCalendar(cal);
  }

  getEvent(eventId, calendarId) {
    if (!eventId) throw new Error("'eventId' is required");
    const cal = getCalendar(calendarId);
    const event = cal.getEventById(eventId);
    if (!event) throw new Error(`Event not found: ${eventId}`);
    return serializeEvent(event);
  }

  getEventsForDay(dateStr, calendarId) {
    if (!dateStr) throw new Error("'date' is required (ISO format)");
    const date = parseDate(dateStr);
    const cal = getCalendar(calendarId);
    const events = cal.getEventsForDay(date);

    return {
      calendarId: cal.getId(),
      date: dateStr,
      eventCount: events.length,
      events: events.map(serializeEvent),
    };
  }

  /**
   * Get events in a date range, optionally filtered by search query.
   * Consolidates getEventsInRange and searchEvents.
   */
  getEvents(startDateStr, endDateStr, calendarId, query, limit) {
    if (!startDateStr || !endDateStr) {
      throw new Error("'startDate' and 'endDate' are required (ISO format)");
    }
    const startDate = parseDate(startDateStr);
    const endDate = parseDate(endDateStr);
    const cal = getCalendar(calendarId);
    const l = clamp(limit, 1, MAX_EVENTS_RESULTS);

    let events;
    if (query) {
      events = cal.getEvents(startDate, endDate, { search: query });
    } else {
      events = cal.getEvents(startDate, endDate);
    }

    const sliced = events.slice(0, l);

    const result = {
      calendarId: cal.getId(),
      startDate: startDateStr,
      endDate: endDateStr,
      totalEvents: events.length,
      returnedEvents: sliced.length,
      events: sliced.map(serializeEvent),
    };

    if (query) {
      result.query = query;
    }

    return result;
  }

  quickAdd(description, calendarId) {
    if (!description)
      throw new Error("'description' is required for quick add");
    const cal = getCalendar(calendarId);
    const event = cal.createEventFromDescription(description);
    event.setDescription(appendCreatedBySuffix(event.getDescription()));
    return {
      created: true,
      calendarId: cal.getId(),
      event: serializeEvent(event),
    };
  }

  /**
   * Unified event creation: handles timed/all-day and single/recurring events.
   * - For timed events: provide startTime and endTime
   * - For all-day events: set allDay=true and provide date (and optionally endDate)
   * - For recurring events: provide recurrence config object
   */
  createEvent(payload, opts) {
    const { title, allDay, recurrence, calendarId } = payload;

    if (!title) throw new Error("'title' is required");
    const cal = getCalendar(calendarId);

    if (allDay) {
      return this._createAllDayEvent(cal, payload, opts, recurrence);
    } else {
      return this._createTimedEvent(cal, payload, opts, recurrence);
    }
  }

  _createTimedEvent(cal, payload, opts, recurrence) {
    const { title, startTime: startTimeStr, endTime: endTimeStr } = payload;

    if (!startTimeStr || !endTimeStr) {
      throw new Error("'startTime' and 'endTime' are required (ISO format)");
    }

    const startTime = parseDate(startTimeStr);
    const endTime = parseDate(endTimeStr);

    if (recurrence) {
      const recurrenceRule = buildRecurrence(recurrence);
      let series;
      if (hasKeys(opts)) {
        series = cal.createEventSeries(
          title,
          startTime,
          endTime,
          recurrenceRule,
          opts,
        );
      } else {
        series = cal.createEventSeries(title, startTime, endTime, recurrenceRule);
      }
      return {
        created: true,
        calendarId: cal.getId(),
        eventSeries: serializeEventSeries(series),
      };
    } else {
      let event;
      if (hasKeys(opts)) {
        event = cal.createEvent(title, startTime, endTime, opts);
      } else {
        event = cal.createEvent(title, startTime, endTime);
      }
      return {
        created: true,
        calendarId: cal.getId(),
        event: serializeEvent(event),
      };
    }
  }

  _createAllDayEvent(cal, payload, opts, recurrence) {
    const { title, date: dateStr, endDate: endDateStr } = payload;

    if (!dateStr) throw new Error("'date' is required for all-day events (ISO format YYYY-MM-DD)");
    const date = parseDate(dateStr);

    if (recurrence) {
      const recurrenceRule = buildRecurrence(recurrence);
      let series;
      if (hasKeys(opts)) {
        series = cal.createAllDayEventSeries(title, date, recurrenceRule, opts);
      } else {
        series = cal.createAllDayEventSeries(title, date, recurrenceRule);
      }
      return {
        created: true,
        calendarId: cal.getId(),
        eventSeries: serializeEventSeries(series),
      };
    } else {
      let event;
      if (endDateStr) {
        const endDate = parseDate(endDateStr);
        event = hasKeys(opts)
          ? cal.createAllDayEvent(title, date, endDate, opts)
          : cal.createAllDayEvent(title, date, endDate);
      } else {
        event = hasKeys(opts)
          ? cal.createAllDayEvent(title, date, opts)
          : cal.createAllDayEvent(title, date);
      }
      return {
        created: true,
        calendarId: cal.getId(),
        event: serializeEvent(event),
      };
    }
  }

  updateEvent(eventId, calendarId, updates) {
    if (!eventId) throw new Error("'eventId' is required");
    const cal = getCalendar(calendarId);
    const event = cal.getEventById(eventId);
    if (!event) throw new Error(`Event not found: ${eventId}`);

    if (updates.title !== undefined) {
      event.setTitle(updates.title);
    }
    if (updates.description !== undefined) {
      event.setDescription(updates.description);
    }
    if (updates.location !== undefined) {
      event.setLocation(updates.location);
    }
    if (updates.startTime && updates.endTime) {
      const startTime = parseDate(updates.startTime);
      const endTime = parseDate(updates.endTime);
      event.setTime(startTime, endTime);
    }
    if (Array.isArray(updates.guests)) {
      const currentGuests = event.getGuestList().map((g) => g.getEmail());
      currentGuests.forEach((email) => event.removeGuest(email));
      updates.guests.forEach((email) => event.addGuest(email));
    }

    return {
      updated: true,
      calendarId: cal.getId(),
      event: serializeEvent(event),
    };
  }

  setMyStatus(eventId, statusStr, calendarId) {
    if (!eventId) throw new Error("'eventId' is required");
    if (!statusStr)
      throw new Error("'status' is required (YES, NO, MAYBE, INVITED)");
    const cal = getCalendar(calendarId);
    const event = cal.getEventById(eventId);
    if (!event) throw new Error(`Event not found: ${eventId}`);

    const status = parseGuestStatus(statusStr);
    event.setMyStatus(status);

    return {
      updated: true,
      eventId: eventId,
      calendarId: cal.getId(),
      newStatus: statusStr.toUpperCase(),
    };
  }
}

/**
 * Handle the POST request.
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  const payload = parsePayload(e);
  if (!payload) return createResponse(fail("Invalid or missing JSON payload"));

  const action = payload.action;
  logRequest(action);

  if (!validateApiKey(payload)) return createResponse(fail("Unauthorized"));

  const m = new CalendarManager();
  const opts = buildEventOptions(payload);

  try {
    switch (action) {
      case "list_calendars":
        return createResponse(ok(m.listCalendars()));
      case "get_calendar":
        return createResponse(ok(m.getCalendarInfo(payload.calendarId)));

      case "get_event":
        return createResponse(
          ok(m.getEvent(payload.eventId, payload.calendarId)),
        );
      case "get_events_for_day":
        return createResponse(
          ok(m.getEventsForDay(payload.date, payload.calendarId)),
        );
      case "get_events":
        return createResponse(
          ok(
            m.getEvents(
              payload.startDate,
              payload.endDate,
              payload.calendarId,
              payload.query,
              payload.limit || DEFAULT_EVENTS_LIMIT,
            ),
          ),
        );

      case "quick_add":
        return createResponse(
          ok(m.quickAdd(payload.description, payload.calendarId)),
        );
      case "create_event":
        return createResponse(ok(m.createEvent(payload, opts)));

      case "update_event":
        return createResponse(
          ok(
            m.updateEvent(payload.eventId, payload.calendarId, {
              title: payload.title,
              description: payload.description,
              location: payload.location,
              startTime: payload.startTime,
              endTime: payload.endTime,
              guests: payload.guests,
            }),
          ),
        );

      case "set_my_status":
        return createResponse(
          ok(
            m.setMyStatus(payload.eventId, payload.status, payload.calendarId),
          ),
        );

      case "version":
        return createResponse(
          ok({
            version: VERSION,
            availableActions: [
              "list_calendars",
              "get_calendar",
              "get_event",
              "get_events_for_day",
              "get_events",
              "quick_add",
              "create_event",
              "update_event",
              "set_my_status",
              "version",
            ],
          }),
        );

      default:
        return createResponse(
          fail(
            `Unknown action: '${action}'. Send action 'version' to list available actions.`,
          ),
        );
    }
  } catch (err) {
    Logger.log(`[ERROR] action=${action} error=${err}`);
    return createResponse(fail(err.toString()));
  }
}
