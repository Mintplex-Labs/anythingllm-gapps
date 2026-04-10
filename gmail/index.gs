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
 * ANYTHINGLLM GMAIL BRIDGE
 * Instructions:
 * 1. Change the API_KEY below to a random string. **YOU MUST DO THIS** */
const API_KEY = "CHANGE_ME_TO_SOMETHING_SECURE";
/* 2. Click 'Deploy' > 'New Deployment' > 'Web App'.
 * 3. Set 'Execute as' to 'Me' and 'Who has access' to 'Anyone'.
 *
 * Supported actions (pass as `action` in JSON payload):
 *
 * SEARCH & READ
 *   search              - Search emails using Gmail query syntax
 *                         (use queries like "is:inbox", "is:starred", "is:spam", "in:trash", "is:important")
 *   read_thread         - Read full thread by ID (includes attachments as base64)
 *   read_message        - Read a single message by ID (includes attachments as base64)
 *
 * DRAFTS
 *   create_draft        - Create a new draft email (supports attachments)
 *   create_draft_reply  - Create a draft reply to an existing thread (supports attachments)
 *   update_draft        - Update an existing draft (supports attachments)
 *   get_draft           - Retrieve a specific draft by ID
 *   list_drafts         - List all drafts
 *   delete_draft        - Delete a draft
 *   send_draft          - Send an existing draft
 *
 * SEND & REPLY
 *   send_email          - Send an email immediately (supports attachments)
 *   reply_to_thread     - Reply to a thread (sends immediately, supports attachments)
 *
 * ATTACHMENTS
 *   When reading: attachments are returned as { name, contentType, size, hash, data (base64) }
 *   When sending: pass attachments as array of { name, contentType, data (base64) }
 *
 * THREAD MANAGEMENT
 *   mark_read           - Mark a thread as read
 *   mark_unread         - Mark a thread as unread
 *   move_to_trash       - Move a thread to trash
 *   move_to_archive     - Archive a thread
 *   move_to_inbox       - Move a thread to inbox
 *
 * ACCOUNT
 *   get_mailbox_stats   - Unread counts for inbox, priority, starred, spam
 *   version             - API version info
 */

const VERSION = "1.0.0";

const MAX_SEARCH_RESULTS = 50;
const MAX_DRAFT_LIST = 100;
const DEFAULT_LIMIT = 10;

/************ HELPER FUNCTIONS ************/

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

function getQuotaInfo() {
  try {
    return { emailQuotaRemaining: MailApp.getRemainingDailyQuota() };
  } catch (_) {
    return { emailQuotaRemaining: "unavailable" };
  }
}

function ok(data) {
  return {
    status: "ok",
    data: data,
    quota: getQuotaInfo(),
    timestamp: new Date().toISOString(),
  };
}

function fail(error, includeQuota = true) {
  const response = {
    status: "error",
    error: String(error),
    timestamp: new Date().toISOString(),
  };
  if (includeQuota) {
    response.quota = getQuotaInfo();
  }
  return response;
}

/**
 * Log every inbound request for audit.
 * Note: GAS web apps cannot access HTTP headers (including X-AnythingLLM-UA) or caller IP.
 */
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

/************ SERIALIZERS ************/

/**
 * Lightweight thread summary — avoids loading messages so search stays fast.
 */
function threadSummary(t) {
  return {
    id: t.getId(),
    subject: t.getFirstMessageSubject(),
    lastMessageDate: t.getLastMessageDate(),
    messageCount: t.getMessageCount(),
    permalink: t.getPermalink(),
    isUnread: t.isUnread(),
    isImportant: t.isImportant(),
    hasStarredMessages: t.hasStarredMessages(),
  };
}

/**
 * Full thread detail — includes messages.
 */
function threadDetail(t) {
  const messages = t.getMessages();
  return {
    id: t.getId(),
    subject: t.getFirstMessageSubject(),
    lastMessageDate: t.getLastMessageDate(),
    messageCount: t.getMessageCount(),
    permalink: t.getPermalink(),
    isUnread: t.isUnread(),
    isImportant: t.isImportant(),
    isInInbox: t.isInInbox(),
    isInSpam: t.isInSpam(),
    isInTrash: t.isInTrash(),
    isInPriorityInbox: t.isInPriorityInbox(),
    hasStarredMessages: t.hasStarredMessages(),
    messages: messages.map(serializeMessage),
  };
}

const ATTACHMENT_WHITELIST = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.presentation",
  "application/json",
  "application/epub+zip",
  "application/mbox",
  "text/plain",
  "text/html",
  "text/csv",
];

function isAttachmentAllowed(att) {
  const contentType = att.getContentType();
  return ATTACHMENT_WHITELIST.some((allowed) =>
    contentType.startsWith(allowed),
  );
}

function serializeAttachment(att) {
  return {
    name: att.getName(),
    contentType: att.getContentType(),
    size: att.getSize(),
    hash: att.getHash(),
    data: Utilities.base64Encode(att.getBytes()),
  };
}

function serializeMessage(m) {
  const attachments = m.getAttachments().filter(isAttachmentAllowed);
  return {
    id: m.getId(),
    threadId: m.getThread().getId(),
    from: m.getFrom(),
    to: m.getTo(),
    cc: m.getCc(),
    bcc: m.getBcc(),
    replyTo: m.getReplyTo(),
    date: m.getDate(),
    subject: m.getSubject(),
    body: m.getPlainBody(),
    isUnread: m.isUnread(),
    isStarred: m.isStarred(),
    isDraft: m.isDraft(),
    attachments: attachments.map(serializeAttachment),
  };
}

function serializeDraft(d) {
  const msg = d.getMessage();
  return {
    draftId: d.getId(),
    messageId: d.getMessageId(),
    to: msg.getTo(),
    cc: msg.getCc(),
    bcc: msg.getBcc(),
    subject: msg.getSubject(),
    body: msg.getPlainBody(),
    date: msg.getDate(),
  };
}

/**
 * Convert a base64-encoded attachment object to a Blob.
 * Expected format: { name: string, contentType: string, data: string (base64) }
 */
function attachmentToBlob(att) {
  if (!att.data) throw new Error("Attachment missing 'data' (base64)");
  const bytes = Utilities.base64Decode(att.data);
  const blob = Utilities.newBlob(bytes);
  if (att.contentType) blob.setContentType(att.contentType);
  if (att.name) blob.setName(att.name);
  return blob;
}

/**
 * Build an options object from the payload, picking only supported keys.
 */
function buildEmailOptions(payload) {
  const opts = {};
  if (payload.cc) opts.cc = payload.cc;
  if (payload.bcc) opts.bcc = payload.bcc;
  if (payload.htmlBody) opts.htmlBody = payload.htmlBody;
  if (payload.from) opts.from = payload.from;
  if (payload.name) opts.name = payload.name;
  if (payload.replyTo) opts.replyTo = payload.replyTo;
  if (payload.noReply === true) opts.noReply = true;
  if (Array.isArray(payload.attachments) && payload.attachments.length > 0) {
    opts.attachments = payload.attachments.map(attachmentToBlob);
  }
  return opts;
}

function hasKeys(obj) {
  return Object.keys(obj).length > 0;
}

/************ MAIL MANAGER ************/

class MailManager {
  /* ──────────── SEARCH & READ ──────────── */

  search(query = "is:inbox", limit = DEFAULT_LIMIT, start = 0) {
    const l = clamp(limit, 1, MAX_SEARCH_RESULTS);
    const s = Math.max(Number(start) || 0, 0);
    const threads = GmailApp.search(query, s, l);
    return {
      query,
      resultCount: threads.length,
      start: s,
      limit: l,
      threads: threads.map(threadSummary),
    };
  }

  readThread(threadId) {
    if (!threadId) throw new Error("'threadId' is required");
    const thread = GmailApp.getThreadById(threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    return threadDetail(thread);
  }

  readMessage(messageId) {
    if (!messageId) throw new Error("'messageId' is required");
    const msg = GmailApp.getMessageById(messageId);
    if (!msg) throw new Error(`Message not found: ${messageId}`);
    return serializeMessage(msg);
  }

  /* ──────────── DRAFT MANAGEMENT ──────────── */

  createDraft(to, subject, body, opts) {
    if (!to || !subject) throw new Error("'to' and 'subject' are required");
    const draft = hasKeys(opts)
      ? GmailApp.createDraft(to, subject, body || "", opts)
      : GmailApp.createDraft(to, subject, body || "");
    return serializeDraft(draft);
  }

  createDraftReply(threadId, body, replyAll, opts) {
    if (!threadId) throw new Error("'threadId' is required");
    if (!body) throw new Error("'body' is required");
    const thread = GmailApp.getThreadById(threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    const draft = replyAll
      ? hasKeys(opts)
        ? thread.createDraftReplyAll(body, opts)
        : thread.createDraftReplyAll(body)
      : hasKeys(opts)
        ? thread.createDraftReply(body, opts)
        : thread.createDraftReply(body);
    return serializeDraft(draft);
  }

  updateDraft(draftId, to, subject, body, opts) {
    if (!draftId) throw new Error("'draftId' is required");
    if (!to || !subject) throw new Error("'to' and 'subject' are required");
    const draft = GmailApp.getDraft(draftId);
    const updated = hasKeys(opts)
      ? draft.update(to, subject, body || "", opts)
      : draft.update(to, subject, body || "");
    return serializeDraft(updated);
  }

  getDraft(draftId) {
    if (!draftId) throw new Error("'draftId' is required");
    return serializeDraft(GmailApp.getDraft(draftId));
  }

  listDrafts(limit = 25) {
    const drafts = GmailApp.getDrafts();
    const l = clamp(limit, 1, MAX_DRAFT_LIST);
    const sliced = drafts.slice(0, l);
    return {
      totalDrafts: drafts.length,
      returned: sliced.length,
      drafts: sliced.map(serializeDraft),
    };
  }

  deleteDraft(draftId) {
    if (!draftId) throw new Error("'draftId' is required");
    GmailApp.getDraft(draftId).deleteDraft();
    return { deleted: true, draftId };
  }

  sendDraft(draftId) {
    if (!draftId) throw new Error("'draftId' is required");
    const sent = GmailApp.getDraft(draftId).send();
    return {
      sent: true,
      messageId: sent.getId(),
      threadId: sent.getThread().getId(),
    };
  }

  /* ──────────── SEND & REPLY ──────────── */

  sendEmail(to, subject, body, opts) {
    if (!to || !subject) throw new Error("'to' and 'subject' are required");
    hasKeys(opts)
      ? GmailApp.sendEmail(to, subject, body || "", opts)
      : GmailApp.sendEmail(to, subject, body || "");
    return { sent: true, to, subject };
  }

  replyToThread(threadId, body, replyAll, opts) {
    if (!threadId) throw new Error("'threadId' is required");
    if (!body) throw new Error("'body' is required");
    const thread = GmailApp.getThreadById(threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    replyAll
      ? hasKeys(opts)
        ? thread.replyAll(body, opts)
        : thread.replyAll(body)
      : hasKeys(opts)
        ? thread.reply(body, opts)
        : thread.reply(body);
    return { replied: true, threadId, replyAll: !!replyAll };
  }

  /* ──────────── THREAD MANAGEMENT ──────────── */

  markRead(threadId) {
    if (!threadId) throw new Error("'threadId' is required");
    const thread = GmailApp.getThreadById(threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    thread.markRead();
    return { threadId, markedRead: true };
  }

  markUnread(threadId) {
    if (!threadId) throw new Error("'threadId' is required");
    const thread = GmailApp.getThreadById(threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    thread.markUnread();
    return { threadId, markedUnread: true };
  }

  moveToTrash(threadId) {
    if (!threadId) throw new Error("'threadId' is required");
    const thread = GmailApp.getThreadById(threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    thread.moveToTrash();
    return { threadId, movedToTrash: true };
  }

  moveToArchive(threadId) {
    if (!threadId) throw new Error("'threadId' is required");
    const thread = GmailApp.getThreadById(threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    thread.moveToArchive();
    return { threadId, archived: true };
  }

  moveToInbox(threadId) {
    if (!threadId) throw new Error("'threadId' is required");
    const thread = GmailApp.getThreadById(threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    thread.moveToInbox();
    return { threadId, movedToInbox: true };
  }

  /* ──────────── ACCOUNT ──────────── */

  getMailboxStats() {
    return {
      inboxUnreadCount: GmailApp.getInboxUnreadCount(),
      priorityInboxUnreadCount: GmailApp.getPriorityInboxUnreadCount(),
      starredUnreadCount: GmailApp.getStarredUnreadCount(),
      spamUnreadCount: GmailApp.getSpamUnreadCount(),
    };
  }
}

/************ MAIN ENTRY POINT ************/

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

  if (!validateApiKey(payload))
    return createResponse(fail("Unauthorized", false));

  const m = new MailManager();
  const opts = buildEmailOptions(payload);

  try {
    switch (action) {
      /* ── Search & Read ── */
      case "search":
        return createResponse(
          ok(m.search(payload.query, payload.limit, payload.start)),
        );
      case "read_thread":
        return createResponse(ok(m.readThread(payload.threadId)));
      case "read_message":
        return createResponse(ok(m.readMessage(payload.messageId)));

      /* ── Drafts ── */
      case "create_draft":
        return createResponse(
          ok(m.createDraft(payload.to, payload.subject, payload.body, opts)),
        );
      case "create_draft_reply":
        return createResponse(
          ok(
            m.createDraftReply(
              payload.threadId,
              payload.body,
              payload.replyAll === true,
              opts,
            ),
          ),
        );
      case "update_draft":
        return createResponse(
          ok(
            m.updateDraft(
              payload.draftId,
              payload.to,
              payload.subject,
              payload.body,
              opts,
            ),
          ),
        );
      case "get_draft":
        return createResponse(ok(m.getDraft(payload.draftId)));
      case "list_drafts":
        return createResponse(ok(m.listDrafts(payload.limit)));
      case "delete_draft":
        return createResponse(ok(m.deleteDraft(payload.draftId)));
      case "send_draft":
        return createResponse(ok(m.sendDraft(payload.draftId)));

      /* ── Send & Reply ── */
      case "send_email":
        return createResponse(
          ok(m.sendEmail(payload.to, payload.subject, payload.body, opts)),
        );
      case "reply_to_thread":
        return createResponse(
          ok(
            m.replyToThread(
              payload.threadId,
              payload.body,
              payload.replyAll === true,
              opts,
            ),
          ),
        );

      /* ── Thread Management ── */
      case "mark_read":
        return createResponse(ok(m.markRead(payload.threadId)));
      case "mark_unread":
        return createResponse(ok(m.markUnread(payload.threadId)));
      case "move_to_trash":
        return createResponse(ok(m.moveToTrash(payload.threadId)));
      case "move_to_archive":
        return createResponse(ok(m.moveToArchive(payload.threadId)));
      case "move_to_inbox":
        return createResponse(ok(m.moveToInbox(payload.threadId)));

      /* ── Account ── */
      case "get_mailbox_stats":
        return createResponse(ok(m.getMailboxStats()));
      case "version":
        return createResponse(
          ok({
            version: VERSION,
            availableActions: [
              "search",
              "read_thread",
              "read_message",
              "create_draft",
              "create_draft_reply",
              "update_draft",
              "get_draft",
              "list_drafts",
              "delete_draft",
              "send_draft",
              "send_email",
              "reply_to_thread",
              "mark_read",
              "mark_unread",
              "move_to_trash",
              "move_to_archive",
              "move_to_inbox",
              "get_mailbox_stats",
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
