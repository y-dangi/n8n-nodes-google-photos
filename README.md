# n8n-nodes-google-photos

A full-featured [n8n](https://n8n.io/) community node for Google Photos.

Communicates **directly** with the Google Photos REST APIs — no intermediate server required. Authentication is handled by n8n's built-in OAuth2 flow.

---

## Features

### 📷 Media Items (Library API)
> ⚠️ The Library API only returns content **uploaded by this app** (since March 31 2025, Google removed broad read access). To access a user's full personal library, use the Picker resource.

| Operation | Description |
|---|---|
| **Get** | Fetch a single media item by ID |
| **List** | List all media items this app has uploaded |
| **Search** | Search by date range, media type, or album — with optional archived-media inclusion |
| **Upload** | Upload a photo or video from an n8n binary property (two-step raw upload + create) |

### 🗂️ Albums (Library API)
| Operation | Description |
|---|---|
| **Get** | Fetch an album by ID |
| **List** | List all albums this app has created |
| **Create** | Create a new album |
| **Add Items** | Add media items to an album (up to 50 at a time) |
| **Add Enrichment** | Add a text caption or GPS location enrichment to an album |
| **Set Cover Photo** | Change the cover photo of an album |

### 🖼️ Picker (Picker API)
Full user-library access — the user selects which photos to share.

| Operation | Description |
|---|---|
| **Create Session** | Returns a `pickerUri` for the user to open and choose photos (supports `maxItemCount` & `mediaTypeFilter`) |
| **Get Session** | Poll the session — when `mediaItemsSet` is `true`, the user is done |
| **List Session Items** | Retrieve the media items selected by the user |
| **Delete Session** | Delete a completed or abandoned picker session to clean up resources |

> ℹ️ **Picker & Library API Notes:**
> - `pickerUri` expires over time and stops working once the user taps **Done**.
> - Google recommends calling **Delete Session** after retrieving media items (or when abandoned).
> - **Automatic Batching**: Adding media items to an album automatically splits item IDs into batches of 50 to respect Google's batch limits.
> - **60-Minute Expiry**: `baseUrl` property on media item objects expires after 60 minutes. Process or download binary data within your workflow immediately.
> - If `Create Session` returns a 403 or insufficient scope error, reconnect your Google OAuth2 API credential in n8n to grant the `photospicker.mediaitems.readonly` scope. (Existing credential metadata cannot verify if the scope was accepted during initial auth).

---

## API Scope Notes (March 2025 Changes)

Google deprecated several broad Library API scopes on **March 31, 2025**. This node uses the three scopes that remain available:

| Scope | Purpose |
|---|---|
| `photoslibrary.appendonly` | Upload new media and create albums |
| `photoslibrary.readonly.appcreateddata` | Read media and albums this app created |
| `photospicker.mediaitems.readonly` | Full-library access via the Picker API |

---

## Prerequisites

- n8n ≥ 1.0
- A **Google Cloud project** with the **Photos Library API** enabled
- An **OAuth 2.0 Web application** credential in Google Cloud Console

---

## Installation

### In n8n (recommended)

1. Go to **Settings → Community Nodes → Install**
2. Enter `n8n-nodes-google-photos`
3. Click **Install**

### Manual (self-hosted n8n)

```bash
# In the n8n root or custom extensions directory:
npm install n8n-nodes-google-photos
```

Restart n8n after installation.

---

## Setup

### 1. Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the **Photos Library API**:
   - Navigate to **APIs & Services → Library**
   - Search for "Photos Library API" and enable it
4. Create OAuth 2.0 credentials:
   - Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Add your n8n instance's OAuth callback URL as an **Authorized redirect URI**:
     ```
     https://your-n8n-instance.com/rest/oauth2-credential/callback
     ```
     (For local n8n: `http://localhost:5678/rest/oauth2-credential/callback`)
5. Copy your **Client ID** and **Client Secret**

### 2. Configure Credentials in n8n

1. In n8n, open any workflow and add a **Google Photos** node
2. Click **Create New Credential** → select **Google OAuth2 API**
3. Enter your **Client ID** and **Client Secret**
4. In the **Scope** field, paste all three scopes (space-separated):
   ```
   https://www.googleapis.com/auth/photoslibrary.appendonly https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata https://www.googleapis.com/auth/photospicker.mediaitems.readonly
   ```
5. Click **Connect** — a Google OAuth consent window will open
6. Sign in and grant the requested permissions
7. You're connected ✅

> **Why these scopes?** Google removed broad library access on March 31 2025.
> - `photoslibrary.appendonly` — upload photos and create albums
> - `photoslibrary.readonly.appcreateddata` — read back content this app uploaded
> - `photospicker.mediaitems.readonly` — Picker API: full library access via user selection
---

## Usage Examples

### Upload a photo to Google Photos

```
[Read Binary File] → [Google Photos: Media Item → Upload]
```

In the Upload node:
- **Binary Property**: `data`
- **Description**: `Uploaded from n8n`
- **Album ID**: *(optional — add to an existing album)*

### Create an album and add photos

1. **Google Photos** — Resource: `Album`, Operation: `Create`, Title: `My n8n Album`
2. **Google Photos** — Resource: `Media Item`, Operation: `Upload`, Album ID: `{{ $json.id }}`

### Access the user's full library via Picker

Use a Wait node between steps 1 and 3 — the user needs time to make their selection.

1. **Google Photos** — Resource: `Picker`, Operation: `Create Session`
   → Output includes `pickerUri` (send this URL to the user) and `id` (the session ID)
2. *(User opens `pickerUri` in their browser and selects photos)*
3. **Google Photos** — Resource: `Picker`, Operation: `Get Session`, Session ID: `{{ $json.id }}`
   → Poll until `mediaItemsSet` is `true`
4. **Google Photos** — Resource: `Picker`, Operation: `List Session Items`, Session ID: `{{ $json.id }}`
   → Returns the selected media items
5. **Google Photos** — Resource: `Picker`, Operation: `Delete Session`, Session ID: `{{ $json.id }}`
   → Clean up session resources

---

## Development

```bash
git clone https://github.com/fartbomb/gphotos-n8n-node.git
cd gphotos-n8n-node
npm install
npm run build      # compile TypeScript → dist/
npm run dev        # watch mode
npm test           # run tests (vitest)
```

### Linking to a local n8n instance

```bash
# In this repo:
npm link

# In your n8n installation directory:
npm link n8n-nodes-google-photos
```

Restart n8n and the node will appear under **Google Photos**.

### Publishing to npm

To publish or release a new version to the npm registry:

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Log in to npm**:
   ```bash
   npm login
   ```

3. **Publish package**:
   ```bash
   npm publish --access public
   ```

4. **Updating versions**:
   ```bash
   npm version patch   # Bump version (0.1.0 -> 0.1.1)
   npm publish
   ```

---

## Project Structure

```
nodes/
  GooglePhotos/
    GooglePhotos.node.ts   ← Main node (all operations)
    googlePhotos.svg       ← Node icon
```

---

## License

MIT
