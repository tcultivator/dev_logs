# Dev Log

Local Next.js app to replace Notepad dumps for coding notes: progress, learning, DB changes, SQL, snippets, reminders, and todos.

## Stack

- Next.js (App Router) + TypeScript
- MySQL (local) via MySQL Workbench
- `mysql2` (direct SQL, no Prisma)

---

## Manual setup (do these in order)

### 1. Install Node.js (if you don’t have it)

1. Download LTS from https://nodejs.org/
2. Install it
3. Open a **new** terminal and check:

```bash
node -v
npm -v
```

You need Node **18+** (20 LTS recommended).

---

### 2. Create DB + tables in MySQL Workbench

1. Open **MySQL Workbench**
2. Connect to your local instance (usually `localhost` / `127.0.0.1`, port `3306`, user `root`)
3. Open a new SQL tab
4. Paste everything from `sql/schema.sql`
5. Click the lightning bolt (**Execute**)

That creates:

- database `devlog`
- table `projects`
- table `entries`

---

### 3. Install project packages

In PowerShell / terminal:

```bash
cd "C:\Users\IT PC\Desktop\dev_logs"
npm install
```

---

### 4. Create your local env file

```bash
copy .env.example .env
```

Open `.env` and match your Workbench login:

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=devlog
```

Put your root password in `MYSQL_PASSWORD` if you have one.

Do **not** commit `.env` to GitHub (already in `.gitignore`).

---

### 5. Run the app

```bash
npm run dev
```

Open: http://localhost:3000

---

## Daily use

1. Create a **Project** (optional)
2. Use **Quick capture** with a type:
   - Progress / Learning / DB Change / SQL / Snippet / Reminder / Todo
3. Use **Today** for the day
4. Use **All / Search** to find old notes, SQL, snippets

---

## GitHub (when ready)

```bash
cd "C:\Users\IT PC\Desktop\dev_logs"
git init
git add .
git commit -m "Initial Dev Log app"
```

Keep `.env` local only. `.env.example` is safe to commit.

---

## Troubleshooting

**API / load error on page**
- Local MySQL service not running
- Wrong values in `.env` (especially password)
- Forgot to run `sql/schema.sql` in Workbench

**Port 3000 in use**
```bash
npm run dev -- -p 3001
```
