# Ingenzi Ledger — Full Stack

Node.js/Express + MongoDB backend, wired to your frontend pages
(`index.html` register → `middlepage.html` → `stock.html` → `sales.html`).

## 1. Set up MongoDB Atlas (free tier)

1. Go to mongodb.com/cloud/atlas and sign up (no card needed for the free M0 tier).
2. Create a free cluster (any region close to you).
3. Under **Database Access**, create a database user with a username and password — save these, you'll need them below. (This is separate from your Atlas login.)
4. Under **Network Access**, add your current IP (or `0.0.0.0/0` to allow from anywhere, simplest for development).
5. Click **Connect** on your cluster → **Drivers** → copy the connection string. It looks like:
   `mongodb+srv://your_db_user:<password>@your-cluster.mongodb.net/?retryWrites=true&w=majority`

## 2. Configure the project

```bash
npm install
cp .env.example .env
```

Edit `.env` and paste your connection string into `MONGODB_URI` (with the
real password substituted for `<password>`). `MONGODB_DB_NAME` can stay as
`ingenzi_ledger` — Mongo creates the database automatically the first time
anything is written to it, no separate "create database" step needed.

## 3. Run

```bash
npm run dev
```

On startup, the server connects to Atlas and creates the required indexes
(unique phone numbers, unique product names per user) automatically — no
schema file to run by hand. This serves **both** the API and the frontend
from `http://localhost:4000`. Open `http://localhost:4000/index.html` — no
separate frontend server needed.

If you run the frontend from a different origin/port, edit
`public/js/api.js` and change `API_BASE`, or set `window.INGENZI_API_BASE`
before that script loads on each page.

## Viewing/editing your data

Install **MongoDB Compass** (free GUI, from mongodb.com/products/compass) and
paste the same connection string from `.env` into it. You'll see your
`ingenzi_ledger` database with collections `users`, `products`,
`stockMovements`, `sales`, and `scoreState` — browse, edit, or delete
documents by clicking, same idea as a spreadsheet.

## "Remember this device" (auto-login)

This is what you asked for: once someone registers on a device, they don't
need to fill in the form again on that device.

- On successful register or login, the JWT is saved to `localStorage`
  (key `ingenzi-token`), which persists across browser restarts.
- `JWT_EXPIRES_IN` in `.env` is set to `180d` by default — long enough that
  a shop owner won't get logged out mid-use. Adjust as you like; there's a
  trade-off between convenience and how long a stolen/shared device stays
  logged in.
- `index.html` now checks for an existing valid token **before** showing
  the registration form. If found, it silently redirects straight to
  `middlepage.html` — so opening the site a second time on the same phone
  or browser skips registration entirely.
- If the token is missing or has expired, the person sees the normal
  register/login flow again. The "Login" link handles a returning person
  on a *new* device (or one who cleared their browser data).
- Logging out (via the profile panel) clears the token, so the next visit
  to `index.html` shows the register form again.

This is standard "remembered session" behavior — the same idea apps use to
avoid asking for a password every time. It only works per-browser/device;
there's no cross-device sync beyond that (nor should there be, for a PIN-
protected business ledger).

## How the flow works

1. **`index.html`** — the 3-step register form calls `POST /api/auth/register`.
   Phone number is collected as 9 digits and combined with a fixed `+250`
   prefix before being sent/stored. A JWT + account details are saved to
   `localStorage`, then you're redirected to `middlepage.html`.
2. **`middlepage.html`** — requires a valid session (redirects to
   `index.html` if not logged in). The **SALES** card checks
   `GET /api/stock/has-any` on click — if no stock is recorded yet, it
   shows the toast warning and keeps you on this page instead of
   navigating, exactly as you described. It falls back to a local
   `localStorage` check only if the backend is unreachable.
3. **`stock.html`** — Save posts valid rows to `POST /api/stock` (creates/
   updates `products`, logs a `stock_movements` row for each), then routes
   to `sales.html`.
4. **`sales.html`** — also gated: lands you back on `stock.html` if no
   stock exists yet. Every committed Credit/Debt/Income row posts to
   `POST /api/sales`, which deducts sold quantity from that product's
   stock. After each sale, the page re-fetches `GET /api/insights` and
   renders the advice cards in the sidebar — the message format you
   described (stock warning, fastest-mover, profit, slow-moving, out of
   stock) — plus refreshes the Ingenzi Score ring from the backend.

## Data model

MongoDB collections (created automatically — no schema file to run):

- **users** — the register form's 3 steps (personal, business, PIN). Login
  is by phone number (`+250XXXXXXXXX`) + 4-digit PIN (bcrypt-hashed), not
  email/password.
- **products** — one document per product name ever stocked or sold, with a
  running `quantityInStock`, last known `unitCost` and `unitPrice`.
- **stockMovements** — an audit log of every restock (from `stock.html`).
- **sales** — an audit log of every sale (from `sales.html`), tagged
  `income`/`credit`/`debt` to match your UI.
- **scoreState** — backs the Ingenzi Score ring (streak-based bankability score).

## The insights engine (`GET /api/insights`)

Runs live off `products` + the last 7 days of `sales` — no separate job
needed. Since MongoDB doesn't do SQL joins, this is computed in plain
JavaScript after fetching both collections:

| Type | Trigger |
|---|---|
| 🔴 Out of stock | `quantityInStock = 0` |
| 🟡 Stock warning | `0 < quantityInStock <= LOW_STOCK_THRESHOLD` (default 5, set in `.env`) |
| 📈 Fastest-moving | product with the most units sold in the last 7 days |
| 💚 Profit | product with the highest estimated profit `(price − cost) × qty` in the last 7 days |
| 💡 Slow-moving | in stock ≥ `SLOW_MOVING_DAYS` (default 14) with ≤1 unit sold this week |

Profit is only as accurate as the cost price entered on `stock.html` — that
feeds `unitCost` per product.

## API Reference

All routes except `/api/auth/register` and `/api/auth/login` require:
`Authorization: Bearer <token>`

### Auth
| Method | Route | Body |
|---|---|---|
| POST | `/api/auth/register` | `{ ownerName, idNumber, telNumber, businessName, regNumber, tinNumber, businessType, location, pin }` |
| POST | `/api/auth/login` | `{ telNumber, pin }` |
| GET | `/api/auth/me` | — |

### Stock
| Method | Route | Body |
|---|---|---|
| GET | `/api/stock` | — current stock levels |
| GET | `/api/stock/has-any` | — `{ hasStock: boolean }` |
| POST | `/api/stock` | `{ rows: [{ product, quantity, unitPrice }, ...] }` — `unitPrice` here is **cost** price |

### Sales
| Method | Route | Body |
|---|---|---|
| GET | `/api/sales` | Query: `from, to, mode` |
| POST | `/api/sales` | `{ product, quantity, unitPrice, mode }` — `mode` is `income`\|`credit`\|`debt`; `unitPrice` here is **selling** price |
| GET | `/api/sales/score` | Ingenzi Score state |

### Insights
| Method | Route |
|---|---|
| GET | `/api/insights` | `{ insights: [{ type, icon, title, message }, ...] }` |

## Tested in this environment

- All backend files pass `node --check` (no syntax errors).
- All inline `<script>` blocks in the 4 HTML pages parse cleanly.
- `npm install` succeeds with the `mongodb` driver in place of `mysql2`.
- The server correctly attempts to connect to MongoDB on startup and fails
  *gracefully* (clean error message, no crash) when given a placeholder
  connection string — confirming the error handling works even though this
  sandbox has no real MongoDB Atlas cluster to connect to.
- Full database-backed flows (register → stock → sales → insights) need to
  be exercised against your real Atlas cluster — test that end-to-end once
  `.env` has your actual `MONGODB_URI`.

