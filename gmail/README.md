# AnythingLLM Gmail Bridge

A Google Apps Script that enables AnythingLLM to read and send emails via Gmail.

## Quick Setup (5 minutes)

1. **Create a new Google Apps Script project**
   - Go to [script.google.com](https://script.google.com)
   - Click **New Project**
   - Name it "AnythingLLM Gmail Bridge"

2. **Paste the code**
   - Delete any existing code in `Code.gs`
   - Copy the entire contents of [`index.gs`](./index.gs) and paste it

3. **Set your API key**
   - Find this line near the top:
     ```js
     const API_KEY = "CHANGE_ME_TO_SOMETHING_SECURE";
     ```
   - Replace `CHANGE_ME_TO_SOMETHING_SECURE` with a random secure string
   - This key authenticates requests from AnythingLLM

4. **Deploy as a Web App**
   - Click **Deploy** → **New deployment**
   - Click the gear icon ⚙️ → Select **Web app**
   - Set **Execute as**: `Me`
   - Set **Who has access**: `Anyone`
   - Click **Deploy**
   - **Authorize** the app when prompted (review permissions)
   - Copy the **Web app URL** — this is your endpoint

5. **Use in AnythingLLM**
   - Add the Web app URL and API key to your AnythingLLM Gmail agent skill configuration

## Security

**Why "Anyone" access is safe:**

- **API key required** — Every request must include your secret API key. Without it, requests are rejected.
- **URL is unguessable** — The deployment URL contains a long random string that acts as an additional layer of obscurity.
- **Your Gmail only** — The script runs as *you* and only accesses *your* Gmail. Callers cannot access their own or anyone else's email through your endpoint.

**Best practices:**
- Use a strong, random API key (32+ characters)
- Never share your API key publicly
- If your key is compromised, change it and redeploy
- Review the [permissions](#permissions) the script requests

## Permissions

When you authorize the script, it requests these Gmail permissions:

| Permission | Why it's needed |
|------------|-----------------|
| Read emails | Search, read threads and messages |
| Send emails | Send new emails and replies |
| Manage labels | List, add, and remove labels |
| Manage drafts | Create, update, and send drafts |

The script has **full access to your Gmail**. Only deploy if you trust the code.

## Updating the Deployment

After making changes to the code:
1. Click **Deploy** → **Manage deployments**
2. Click the pencil icon ✏️ on your deployment
3. Set **Version** to "New version"
4. Click **Deploy**

The URL stays the same.

---

## Development (for contributors)

### Prerequisites
- Node 22+ (`nvm use`)
- [Enable Apps Script API](https://script.google.com/u/1/home/usersettings)

### Setup
```bash
yarn install
npx clasp login
npx clasp create --title "AnythingLLM-Gmail-Bridge" --type standalone
```

### Push & Deploy
```bash
npx clasp push                           # Push code
npx clasp deploy                         # New deployment
npx clasp deploy --deploymentId <ID>     # Update existing deployment
```

### Testing cURL Requests

Get version info:
```bash
curl -X POST \
  'https://script.google.com/macros/s/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec' \
  -H 'Content-Type: application/json' \
  -d '{"key": "YOUR_API_KEY", "action": "version"}'
```

Get mailbox stats:
```bash
curl -X POST \
  'https://script.google.com/macros/s/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec' \
  -H 'Content-Type: application/json' \
  -d '{"key": "YOUR_API_KEY", "action": "get_mailbox_stats"}'
```

Search emails:
```bash
curl -X POST \
  'https://script.google.com/macros/s/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec' \
  -H 'Content-Type: application/json' \
  -d '{"key": "YOUR_API_KEY", "action": "search", "query": "is:inbox"}'
```

Read specific email:
```bash
curl -X POST \
  'https://script.google.com/macros/s/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec' \
  -H 'Content-Type: application/json' \
  -d '{"key": "YOUR_API_KEY", "action": "read_message", "messageId": "1234567890"}'
```