# Form Builder

A web app that lets you paste questions with answer keys and instantly generate a Google Form. Just sign in with Google and go.

**Live app:** https://form-builder-three-gules.vercel.app

---

## What it does

- Paste questions in plain text with options and correct answers
- Preview parsed questions in real time before generating
- Automatically detects question type:
  - One correct answer → Multiple choice
  - Multiple correct answers → Checkboxes
  - No options, just an answer → Short answer
- Creates the form directly in your Google Drive via the Google Forms API
- Supports quiz mode with answer keys and scoring

---

## How to use

### 1. Sign in
Visit the app and click **Sign in with Google**. Use any Google account that has been added as a test user (see Setup below). Your forms will be created in your own Google Drive.

### 2. Fill in form details
- **Form Title** — required
- **Description** — optional, shown to respondents
- **Quiz mode** — toggle on to enable answer keys and scoring
- **Points per question** — optional, defaults to 1

### 3. Paste your questions

Use this format in the text box:

```
1. What is the capital of France?
a) London
b) Paris ✓
c) Berlin
d) Rome

2. Which of these are prime numbers?
a) 2 ✓
b) 4
c) 7 ✓
d) 9

3. What is the chemical symbol for water?
Answer: H2O

4. Multiple choice using Answer line:
a) Option A
b) Option B
c) Option C
Answer: b
```

**Marking correct answers — three ways:**
- Put `✓` or `*` after the option: `b) Paris ✓`
- Add `Answer: b` on a new line
- Both work the same way

**Question types are auto-detected:**
- Options with one correct answer → Multiple choice
- Options with two or more correct answers → Checkboxes
- No options + `Answer: text` → Short answer

### 4. Generate
Click **Generate Form**. The app calls the Google Forms API and creates the form in your account. You get two links:
- **Respondent link** — share this with people to fill out the form
- **Edit link** — opens the form in Google Forms to make changes

---

## Format reference

| Format | Example |
|---|---|
| Question | `1. Question text?` |
| Option with correct mark | `b) Paris ✓` or `b) Paris *` |
| Answer line | `Answer: b` or `Answer: 1889` |
| Option prefixes supported | `a)` `A.` `a.` `A)` `1.` `1)` |

---

## Setup (developer — one time)

### Requirements
- Google Cloud project with **Google Forms API** and **Google Drive API** enabled
- OAuth 2.0 Client ID (Web application type)
- Vercel account for hosting

### Google Cloud Console
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project
3. Enable **Google Forms API** and **Google Drive API** under APIs & Services → Library
4. Go to **OAuth consent screen** → External → fill in app name and email
5. Under **Test users** → add the Gmail addresses of everyone who will use the app (up to 100)
6. Go to **Credentials** → Create OAuth 2.0 Client ID → Web application
7. Add your Vercel URL under **Authorized JavaScript origins** (no trailing slash)
8. Copy the **Client ID**

### Add Client ID to code
In `index.html`, find this line and replace with your actual Client ID:
```javascript
const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
```

### Deploy to Vercel
1. Push `index.html` to a GitHub repo
2. Connect the repo to [vercel.com](https://vercel.com)
3. Vercel deploys automatically on every push

### Adding new users
Go to Google Cloud Console → OAuth consent screen → Test users → Add users. No redeployment needed. Users are not notified — share the link with them manually.

---

## Notes

- Forms are created in the **user's own** Google Drive, not a shared account
- The app stores nothing — no database, no backend, no user data
- The OAuth Client ID is public and safe to commit — it is protected by the authorized domain restriction in Google Cloud Console
- The Client Secret is never used and should never be in the code
- Users on Testing mode will see a Google "unverified app" warning on first sign-in — they click **Advanced → Go to Form Builder** to proceed. This only appears once.
- DuckDuckGo browser may block the app with a phishing warning — use Safari or Chrome instead
- Access tokens expire after 1 hour. The app will prompt re-login automatically

---

## Tech stack

- Vanilla HTML/CSS/JavaScript — no frameworks, no build step
- [Google Identity Services](https://developers.google.com/identity/oauth2/web) for OAuth
- [Google Forms API v1](https://developers.google.com/forms/api) for form creation
- Hosted on Vercel (free tier)
