# Headless Tasks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Claude Code plugin that turns Notion into an AI-native task management tool with real-time HTML views.

**Architecture:** Skills contain domain logic and trigger Notion MCP for data ops. A local Hono view server fetches from Notion API directly and pushes updates via SSE. PostToolUse hooks bridge MCP operations to the view server.

**Tech Stack:** TypeScript, Hono, @notionhq/client, @hono/node-server, Vitest

---

## Final Plugin Structure

```
headless-tasks/
├── .claude-plugin/
│   └── plugin.json
├── .mcp.json
├── skills/
│   ├── task-setup/SKILL.md
│   ├── task-manage/SKILL.md
│   ├── task-view/SKILL.md
│   └── task-agent/SKILL.md
├── agents/
│   └── task-agent.md
├── hooks/
│   └── hooks.json
├── scripts/
│   └── notify-view.sh
├── server/
│   ├── src/
│   │   ├── index.ts
│   │   ├── app.ts
│   │   ├── notion-client.ts
│   │   ├── sse.ts
│   │   └── types.ts
│   ├── static/
│   │   ├── selector.html
│   │   ├── kanban.html
│   │   └── list.html
│   ├── test/
│   │   ├── app.test.ts
│   │   ├── notion-client.test.ts
│   │   └── sse.test.ts
│   ├── package.json
│   └── tsconfig.json
└── docs/
    └── plans/
```

## Key Reference

- **Notion MCP tools** (kebab-case): `create-a-page`, `update-page-properties`, `query-data-source`, `retrieve-a-data-source`, `search`
- **Notion MCP env var**: `NOTION_TOKEN` (format: `ntn_****`)
- **Plugin paths**: Use `${CLAUDE_PLUGIN_ROOT}` for all intra-plugin references
- **Skill format**: `skills/<name>/SKILL.md` with YAML frontmatter
- **Hook format**: `hooks/hooks.json` with event → matcher → handler structure
- **Agent format**: `agents/<name>.md` with YAML frontmatter + system prompt body

---

### Task 1: Plugin Scaffold

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.mcp.json`
- Create: `.gitignore`

**Step 1: Create plugin manifest**

Create `.claude-plugin/plugin.json`:

```json
{
  "name": "headless-tasks",
  "version": "0.1.0",
  "description": "AI-native task management powered by Notion. Natural language CRUD, real-time HTML views (kanban, list), and autonomous task execution.",
  "author": {
    "name": "kazukinagata"
  },
  "license": "MIT",
  "mcpServers": "./.mcp.json",
  "hooks": "./hooks/hooks.json"
}
```

**Step 2: Create Notion MCP config**

Create `.mcp.json`:

```json
{
  "mcpServers": {
    "notion": {
      "command": "npx",
      "args": ["-y", "@notionhq/notion-mcp-server"],
      "env": {
        "NOTION_TOKEN": "${NOTION_TOKEN}"
      }
    }
  }
}
```

**Step 3: Create .gitignore**

Create `.gitignore`:

```
node_modules/
dist/
*.js.map
.env
```

**Step 4: Commit**

```bash
git add .claude-plugin/plugin.json .mcp.json .gitignore
git commit -m "feat: scaffold plugin manifest and Notion MCP config"
```

---

### Task 2: View Server Scaffold

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/types.ts`
- Create: `server/src/app.ts`
- Create: `server/src/index.ts`

**Step 1: Create server/package.json**

```json
{
  "name": "headless-tasks-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@hono/node-server": "^1.0.0",
    "@notionhq/client": "^2.0.0",
    "hono": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 2: Create server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

**Step 3: Create server/src/types.ts**

Domain types matching the Notion DB schema v3:

```typescript
export interface Task {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  status: "Backlog" | "Ready" | "In Progress" | "In Review" | "Done";
  blockedBy: string[];
  assignees: Person[];
  reporter: Person | null;
  reviewers: Person[];
  team: string | null;
  priority: "Urgent" | "High" | "Medium" | "Low" | null;
  project: string | null;
  tags: string[];
  parentTaskId: string | null;
  dueDate: string | null;
  estimate: number | null;
  agentType: "claude-code" | "human" | "review" | null;
  agentOutput: string;
  artifacts: string;
  context: string;
  url: string;
}

export interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface TasksResponse {
  tasks: Task[];
  updatedAt: string;
}
```

**Step 4: Create server/src/app.ts**

Hono app (separated from server bootstrap for testability):

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use("*", cors());

app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default app;
```

**Step 5: Create server/src/index.ts**

```typescript
import { serve } from "@hono/node-server";
import app from "./app.js";

const PORT = parseInt(process.env.PORT || "3456", 10);

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Headless Tasks view server running on http://localhost:${info.port}`);
});

const shutdown = () => {
  server.close(() => {
    console.log("Server shut down");
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

**Step 6: Install dependencies and verify**

Run: `cd server && npm install`
Run: `cd server && npx tsx src/index.ts &`
Run: `curl http://localhost:3456/api/health`
Expected: `{"status":"ok","timestamp":"..."}`
Kill background server after verification.

**Step 7: Commit**

```bash
git add server/
git commit -m "feat: scaffold view server with Hono + health endpoint"
```

---

### Task 3: Notion Client — Fetch Tasks

**Files:**
- Create: `server/src/notion-client.ts`
- Create: `server/test/notion-client.test.ts`

**Step 1: Write the failing test**

Create `server/test/notion-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotionTaskClient } from "../src/notion-client.js";

// Mock @notionhq/client
vi.mock("@notionhq/client", () => {
  return {
    Client: vi.fn().mockImplementation(() => ({
      databases: {
        query: vi.fn(),
      },
    })),
  };
});

describe("NotionTaskClient", () => {
  let client: NotionTaskClient;

  beforeEach(() => {
    client = new NotionTaskClient({
      token: "ntn_test",
      tasksDatabaseId: "tasks-db-id",
    });
  });

  it("fetches tasks and maps Notion properties to Task type", async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      results: [
        {
          id: "page-1",
          url: "https://notion.so/page-1",
          properties: {
            Title: { title: [{ plain_text: "Implement login" }] },
            Description: { rich_text: [{ plain_text: "Add OAuth2 flow" }] },
            "Acceptance Criteria": { rich_text: [{ plain_text: "Tests pass" }] },
            Status: { status: { name: "Ready" } },
            "Blocked By": { relation: [] },
            Assignees: {
              people: [{ id: "user-1", name: "Alice", avatar_url: null }],
            },
            Reporter: { people: [{ id: "user-2", name: "Bob", avatar_url: null }] },
            Reviewers: { people: [] },
            Team: { relation: [{ id: "team-1" }] },
            Priority: { select: { name: "High" } },
            Project: { relation: [{ id: "proj-1" }] },
            Tags: { multi_select: [{ name: "backend" }] },
            "Parent Task": { relation: [] },
            "Due Date": { date: { start: "2026-03-10" } },
            Estimate: { number: 4 },
            "Agent Type": { select: { name: "claude-code" } },
            "Agent Output": { rich_text: [] },
            Artifacts: { url: null },
            Context: { rich_text: [{ plain_text: "See RFC-123" }] },
          },
        },
      ],
      has_more: false,
    });

    // Inject mock
    (client as any).notion.databases.query = mockQuery;

    const result = await client.fetchTasks();

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]).toMatchObject({
      id: "page-1",
      title: "Implement login",
      description: "Add OAuth2 flow",
      status: "Ready",
      priority: "High",
      agentType: "claude-code",
      tags: ["backend"],
      dueDate: "2026-03-10",
      estimate: 4,
    });
    expect(result.updatedAt).toBeDefined();
  });

  it("handles empty database", async () => {
    (client as any).notion.databases.query = vi.fn().mockResolvedValue({
      results: [],
      has_more: false,
    });

    const result = await client.fetchTasks();
    expect(result.tasks).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run test/notion-client.test.ts`
Expected: FAIL — `NotionTaskClient` does not exist

**Step 3: Implement NotionTaskClient**

Create `server/src/notion-client.ts`:

```typescript
import { Client } from "@notionhq/client";
import type { Task, Person, TasksResponse } from "./types.js";

export interface NotionTaskClientConfig {
  token: string;
  tasksDatabaseId: string;
}

export class NotionTaskClient {
  private notion: Client;
  private tasksDatabaseId: string;

  constructor(config: NotionTaskClientConfig) {
    this.notion = new Client({ auth: config.token });
    this.tasksDatabaseId = config.tasksDatabaseId;
  }

  async fetchTasks(): Promise<TasksResponse> {
    const pages: any[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.notion.databases.query({
        database_id: this.tasksDatabaseId,
        start_cursor: cursor,
        page_size: 100,
      });
      pages.push(...response.results);
      cursor = response.has_more ? (response as any).next_cursor : undefined;
    } while (cursor);

    const tasks = pages.map((page) => this.mapPageToTask(page));

    return {
      tasks,
      updatedAt: new Date().toISOString(),
    };
  }

  private mapPageToTask(page: any): Task {
    const props = page.properties;
    return {
      id: page.id,
      title: this.getTitle(props.Title),
      description: this.getRichText(props.Description),
      acceptanceCriteria: this.getRichText(props["Acceptance Criteria"]),
      status: this.getStatus(props.Status),
      blockedBy: this.getRelationIds(props["Blocked By"]),
      assignees: this.getPeople(props.Assignees),
      reporter: this.getFirstPerson(props.Reporter),
      reviewers: this.getPeople(props.Reviewers),
      team: this.getFirstRelationId(props.Team),
      priority: this.getSelect(props.Priority) as Task["priority"],
      project: this.getFirstRelationId(props.Project),
      tags: this.getMultiSelect(props.Tags),
      parentTaskId: this.getFirstRelationId(props["Parent Task"]),
      dueDate: this.getDate(props["Due Date"]),
      estimate: this.getNumber(props.Estimate),
      agentType: this.getSelect(props["Agent Type"]) as Task["agentType"],
      agentOutput: this.getRichText(props["Agent Output"]),
      artifacts: props.Artifacts?.url ?? "",
      context: this.getRichText(props.Context),
      url: page.url,
    };
  }

  private getTitle(prop: any): string {
    return prop?.title?.map((t: any) => t.plain_text).join("") ?? "";
  }

  private getRichText(prop: any): string {
    return prop?.rich_text?.map((t: any) => t.plain_text).join("") ?? "";
  }

  private getStatus(prop: any): Task["status"] {
    return (prop?.status?.name as Task["status"]) ?? "Backlog";
  }

  private getSelect(prop: any): string | null {
    return prop?.select?.name ?? null;
  }

  private getMultiSelect(prop: any): string[] {
    return prop?.multi_select?.map((s: any) => s.name) ?? [];
  }

  private getPeople(prop: any): Person[] {
    return (
      prop?.people?.map((p: any) => ({
        id: p.id,
        name: p.name ?? "Unknown",
        avatarUrl: p.avatar_url ?? null,
      })) ?? []
    );
  }

  private getFirstPerson(prop: any): Person | null {
    const people = this.getPeople(prop);
    return people[0] ?? null;
  }

  private getRelationIds(prop: any): string[] {
    return prop?.relation?.map((r: any) => r.id) ?? [];
  }

  private getFirstRelationId(prop: any): string | null {
    return prop?.relation?.[0]?.id ?? null;
  }

  private getDate(prop: any): string | null {
    return prop?.date?.start ?? null;
  }

  private getNumber(prop: any): number | null {
    return prop?.number ?? null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run test/notion-client.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add server/src/notion-client.ts server/test/notion-client.test.ts
git commit -m "feat: add Notion client with task property mapping"
```

---

### Task 4: API Endpoint — GET /api/tasks

**Files:**
- Modify: `server/src/app.ts`
- Create: `server/test/app.test.ts`

**Step 1: Write the failing test**

Create `server/test/app.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock notion-client before importing app
vi.mock("../src/notion-client.js", () => {
  return {
    NotionTaskClient: vi.fn().mockImplementation(() => ({
      fetchTasks: vi.fn().mockResolvedValue({
        tasks: [
          {
            id: "task-1",
            title: "Test task",
            status: "Ready",
            priority: "High",
          },
        ],
        updatedAt: "2026-03-04T00:00:00Z",
      }),
    })),
  };
});

describe("API", () => {
  let app: any;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../src/app.js");
    app = mod.default;
  });

  it("GET /api/health returns ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("GET /api/tasks returns task list", async () => {
    const res = await app.request("/api/tasks");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].title).toBe("Test task");
    expect(body.updatedAt).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run test/app.test.ts`
Expected: FAIL — `/api/tasks` returns 404

**Step 3: Add /api/tasks endpoint to app.ts**

Replace `server/src/app.ts` with:

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { NotionTaskClient } from "./notion-client.js";

let notionClient: NotionTaskClient | null = null;

function getNotionClient(): NotionTaskClient {
  if (!notionClient) {
    const token = process.env.NOTION_TOKEN;
    const dbId = process.env.NOTION_DATABASE_ID;
    if (!token || !dbId) {
      throw new Error("NOTION_TOKEN and NOTION_DATABASE_ID must be set");
    }
    notionClient = new NotionTaskClient({ token, tasksDatabaseId: dbId });
  }
  return notionClient;
}

const app = new Hono();

app.use("*", cors());

app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/tasks", async (c) => {
  const client = getNotionClient();
  const data = await client.fetchTasks();
  return c.json(data);
});

export default app;
```

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run test/app.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add server/src/app.ts server/test/app.test.ts
git commit -m "feat: add GET /api/tasks endpoint"
```

---

### Task 5: SSE + Refresh Mechanism

**Files:**
- Create: `server/src/sse.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/sse.test.ts`

**Step 1: Write the failing test**

Create `server/test/sse.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { EventBus } from "../src/sse.js";

describe("EventBus", () => {
  it("notifies subscribers on emit", async () => {
    const bus = new EventBus();
    const received: string[] = [];

    const unsubscribe = bus.subscribe((data) => {
      received.push(data);
    });

    bus.emit("update-1");
    bus.emit("update-2");

    expect(received).toEqual(["update-1", "update-2"]);

    unsubscribe();
    bus.emit("update-3");
    expect(received).toEqual(["update-1", "update-2"]);
  });

  it("supports multiple subscribers", () => {
    const bus = new EventBus();
    let count = 0;

    bus.subscribe(() => count++);
    bus.subscribe(() => count++);
    bus.emit("test");

    expect(count).toBe(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run test/sse.test.ts`
Expected: FAIL — `EventBus` does not exist

**Step 3: Implement EventBus**

Create `server/src/sse.ts`:

```typescript
type Listener = (data: string) => void;

export class EventBus {
  private listeners: Set<Listener> = new Set();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(data: string): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run test/sse.test.ts`
Expected: PASS (2 tests)

**Step 5: Add SSE and refresh endpoints to app.ts**

Add to `server/src/app.ts` — import and wire up the EventBus:

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { NotionTaskClient } from "./notion-client.js";
import { EventBus } from "./sse.js";

let notionClient: NotionTaskClient | null = null;
const eventBus = new EventBus();
let sseId = 0;

function getNotionClient(): NotionTaskClient {
  if (!notionClient) {
    const token = process.env.NOTION_TOKEN;
    const dbId = process.env.NOTION_DATABASE_ID;
    if (!token || !dbId) {
      throw new Error("NOTION_TOKEN and NOTION_DATABASE_ID must be set");
    }
    notionClient = new NotionTaskClient({ token, tasksDatabaseId: dbId });
  }
  return notionClient;
}

const app = new Hono();

app.use("*", cors());

app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/tasks", async (c) => {
  const client = getNotionClient();
  const data = await client.fetchTasks();
  return c.json(data);
});

app.get("/api/events", async (c) => {
  return streamSSE(c, async (stream) => {
    let running = true;

    stream.onAbort(() => {
      running = false;
    });

    // Send initial connection event
    await stream.writeSSE({
      data: JSON.stringify({ type: "connected" }),
      event: "connected",
      id: String(sseId++),
    });

    // Subscribe to refresh events
    const unsubscribe = eventBus.subscribe(async (data) => {
      if (!running) return;
      try {
        await stream.writeSSE({
          data,
          event: "refresh",
          id: String(sseId++),
        });
      } catch {
        running = false;
      }
    });

    // Keep connection alive with heartbeat
    while (running) {
      await stream.sleep(15000);
      if (!running) break;
      try {
        await stream.writeSSE({
          data: "",
          event: "heartbeat",
          id: String(sseId++),
        });
      } catch {
        running = false;
      }
    }

    unsubscribe();
  });
});

app.post("/api/refresh", async (c) => {
  try {
    const client = getNotionClient();
    const data = await client.fetchTasks();
    eventBus.emit(JSON.stringify(data));
    return c.json({ status: "ok", taskCount: data.tasks.length });
  } catch (e: any) {
    return c.json({ status: "error", message: e.message }, 500);
  }
});

export default app;
```

**Step 6: Update app test for new endpoints**

Add to `server/test/app.test.ts`:

```typescript
  it("POST /api/refresh triggers data fetch and returns ok", async () => {
    const res = await app.request("/api/refresh", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.taskCount).toBe(1);
  });
```

**Step 7: Run all tests**

Run: `cd server && npx vitest run`
Expected: ALL PASS

**Step 8: Commit**

```bash
git add server/src/sse.ts server/src/app.ts server/test/sse.test.ts server/test/app.test.ts
git commit -m "feat: add SSE streaming and refresh endpoint"
```

---

### Task 6: List View HTML

**Files:**
- Create: `server/static/list.html`

**Step 1: Create the list view**

Create `server/static/list.html` — a self-contained HTML file that:
- Connects to `/api/events` for SSE updates
- Fetches initial data from `/api/tasks`
- Renders a sortable, filterable table
- Click-to-copy task ID
- Dark mode
- Client-side filtering by Status, Priority, Project
- Expand/collapse for description and acceptance criteria

The HTML must be self-contained (inline CSS/JS, no external deps except the API).

Key elements:
- `<table>` with columns: Title, Status, Priority, Assignees, Due Date, Project, Tags
- Status badges with colors (Backlog=gray, Ready=blue, In Progress=yellow, In Review=purple, Done=green)
- Priority badges (Urgent=red, High=orange, Medium=blue, Low=gray)
- Filter bar at top: dropdowns for Status, Priority, text search
- SSE listener that re-renders table on `refresh` event
- `onclick` on task row copies ID to clipboard, shows toast

**Step 2: Verify manually**

Run: `cd server && NOTION_TOKEN=test NOTION_DATABASE_ID=test npx tsx src/index.ts`
Open: `http://localhost:3456/list.html` in browser
Verify: Page loads, shows "No tasks" or loading state (API will fail without real Notion, but HTML structure should render)

**Step 3: Commit**

```bash
git add server/static/list.html
git commit -m "feat: add list view HTML with SSE real-time updates"
```

---

### Task 7: Kanban View HTML

**Files:**
- Create: `server/static/kanban.html`

**Step 1: Create the kanban view**

Create `server/static/kanban.html` — a self-contained HTML file that:
- Connects to `/api/events` for SSE updates
- Fetches initial data from `/api/tasks`
- Renders columns: Backlog | Ready | In Progress | In Review | Done
- Each card shows: Title, Priority badge, Assignees, Due Date, Tags
- Click-to-copy task ID
- Dark mode
- Client-side filtering by Priority, text search

Key elements:
- 5 columns with sticky headers and scroll
- Cards with priority color accent (left border)
- Assignee initials as avatars
- Due date with overdue highlighting (red if past due)
- SSE listener that re-renders cards on `refresh` event

**Step 2: Verify manually**

Same as Task 6 — open `http://localhost:3456/kanban.html` and verify structure renders.

**Step 3: Commit**

```bash
git add server/static/kanban.html
git commit -m "feat: add kanban view HTML with SSE real-time updates"
```

---

### Task 8: View Selector + Static File Serving

**Files:**
- Create: `server/static/selector.html`
- Modify: `server/src/app.ts` — add static file serving

**Step 1: Create view selector page**

Create `server/static/selector.html` — landing page with links to each view:
- Card-based layout with preview icons for each view type
- Links to /list.html, /kanban.html
- "Coming soon" cards for Calendar, Gantt

**Step 2: Add static file serving to app.ts**

Add to `server/src/app.ts` (after API routes, before export):

```typescript
import { serveStatic } from "@hono/node-server/serve-static";

// ... existing routes ...

// Static files — AFTER API routes
app.get("/", (c) => c.redirect("/selector.html"));
app.use("*", serveStatic({ root: "./static" }));
```

Note: `serveStatic` import is from `@hono/node-server/serve-static` (Node.js adapter), not from `hono`.

**Step 3: Verify**

Run: `cd server && NOTION_TOKEN=test NOTION_DATABASE_ID=test npx tsx src/index.ts`
Open: `http://localhost:3456/`
Expected: Redirects to selector page showing view cards

**Step 4: Commit**

```bash
git add server/static/selector.html server/src/app.ts
git commit -m "feat: add view selector and static file serving"
```

---

### Task 9: PostToolUse Hook

**Files:**
- Create: `hooks/hooks.json`
- Create: `scripts/notify-view.sh`

**Step 1: Create hook configuration**

Create `hooks/hooks.json`:

```json
{
  "description": "Headless Tasks hooks — notify view server when Notion data changes",
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "mcp__notion__.*",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/notify-view.sh",
            "timeout": 5,
            "async": true,
            "statusMessage": "Refreshing task views..."
          }
        ]
      }
    ]
  }
}
```

**Step 2: Create notify script**

Create `scripts/notify-view.sh`:

```bash
#!/usr/bin/env bash
# Notify the headless-tasks view server to refresh data from Notion.
# Called by PostToolUse hook when any Notion MCP tool is used.
# Runs async — failure is silent (view server may not be running).

curl -s -X POST http://localhost:3456/api/refresh -o /dev/null 2>/dev/null || true
```

**Step 3: Make executable**

Run: `chmod +x scripts/notify-view.sh`

**Step 4: Verify hook config is valid JSON**

Run: `python3 -c "import json; json.load(open('hooks/hooks.json'))"`
Expected: No output (valid JSON)

**Step 5: Commit**

```bash
git add hooks/hooks.json scripts/notify-view.sh
git commit -m "feat: add PostToolUse hook to refresh views on Notion changes"
```

---

### Task 10: task-setup Skill

**Files:**
- Create: `skills/task-setup/SKILL.md`

**Step 1: Create the skill**

Create `skills/task-setup/SKILL.md`:

````markdown
---
name: task-setup
description: >
  Use when the user says "setup headless tasks", "initialize task management",
  "configure notion tasks", "セットアップ", "タスク管理の初期設定", or needs to
  set up Notion databases for the headless-tasks plugin.
---

# Headless Tasks — Setup Guide

You are guiding the user through the initial setup of the Headless Tasks plugin.
Follow these steps in order. Ask the user to confirm each step before proceeding.

## Prerequisites

The user needs:
- A Notion account
- Admin access to a Notion workspace

## Step 1: Create Notion Integration

Guide the user to create a Notion integration:

1. Go to https://www.notion.so/profile/integrations
2. Click "New Integration"
3. Name it "Headless Tasks"
4. Select the workspace
5. Copy the "Internal Integration Secret" (starts with `ntn_`)

## Step 2: Set Environment Variable

**Claude Code:**

Ask the user to add the token to their project's `.claude/settings.local.json`:

```json
{
  "env": {
    "NOTION_TOKEN": "ntn_PASTE_TOKEN_HERE"
  }
}
```

**Cowork:**

Guide the user to set `NOTION_TOKEN` via the Cowork admin settings UI.

## Step 3: Create Notion Databases

Use the Notion MCP tools to create three databases. First verify the MCP connection works:

1. Call `search` with query "test" to verify the connection
2. Create a parent page for the databases using `create-a-page`

Then create each database using `create-a-data-source`:

### Tasks Database

Properties:
| Property | Type | Config |
|---|---|---|
| Title | title | — |
| Description | rich_text | — |
| Acceptance Criteria | rich_text | — |
| Status | status | Groups: Not Started (Backlog, Ready), In Progress (In Progress, In Review), Complete (Done) |
| Blocked By | relation | Self-relation to Tasks DB |
| Assignees | people | — |
| Reporter | people | — |
| Reviewers | people | — |
| Team | relation | → Teams DB |
| Priority | select | Options: Urgent, High, Medium, Low |
| Project | relation | → Projects DB |
| Tags | multi_select | — |
| Parent Task | relation | Self-relation to Tasks DB |
| Due Date | date | — |
| Estimate | number | Format: number |
| Agent Type | select | Options: claude-code, human, review |
| Agent Output | rich_text | — |
| Artifacts | url | — |
| Context | rich_text | — |

### Teams Database

Properties: Name (title), Members (people), Tasks (relation → Tasks DB)

### Projects Database

Properties: Name (title), Owner (people), Team (relation → Teams DB), Status (select: Active/On Hold/Completed/Archived), Tasks (relation → Tasks DB), Due Date (date)

## Step 4: Store Database IDs

After creating the databases, store their IDs in `.claude/settings.local.json`:

```json
{
  "env": {
    "NOTION_TOKEN": "ntn_...",
    "NOTION_DATABASE_ID": "TASKS_DB_ID_HERE",
    "NOTION_TEAMS_DB_ID": "TEAMS_DB_ID_HERE",
    "NOTION_PROJECTS_DB_ID": "PROJECTS_DB_ID_HERE"
  }
}
```

## Step 5: Share Databases with Integration

Remind the user to share each database with the "Headless Tasks" integration:
1. Open each database in Notion
2. Click "..." menu → "Connections" → Add "Headless Tasks"

## Step 6: Verify

Create a test task using `create-a-page` with the Tasks database as parent:
- Title: "Test task — delete me"
- Status: Ready
- Priority: Medium

If successful, tell the user setup is complete and they can start using:
- Natural language task management (task-manage skill)
- Visual views (task-view skill)
````

**Step 2: Commit**

```bash
git add skills/task-setup/
git commit -m "feat: add task-setup skill for interactive Notion configuration"
```

---

### Task 11: task-manage Skill

**Files:**
- Create: `skills/task-manage/SKILL.md`

**Step 1: Create the skill**

Create `skills/task-manage/SKILL.md`:

````markdown
---
name: task-manage
description: >
  Use when the user wants to create, update, delete, or query tasks.
  Triggers on: "タスク追加", "タスク作成", "add task", "create task",
  "update task", "タスク更新", "done", "完了", "ステータス変更",
  "タスク一覧", "list tasks", "what's next", "次のタスク",
  "block", "ブロック", "assign", "アサイン", "prioritize", "優先度".
---

# Headless Tasks — Task Management

You are managing tasks stored in a Notion database. Use the Notion MCP tools for all data operations.

## Database Configuration

Read environment variables for database IDs:
- Tasks DB: `NOTION_DATABASE_ID`
- Teams DB: `NOTION_TEAMS_DB_ID`
- Projects DB: `NOTION_PROJECTS_DB_ID`

## Notion MCP Tool Reference

- `create-a-page` — Create a task (parent: `{ "database_id": TASKS_DB_ID }`)
- `update-page-properties` — Update task properties
- `query-data-source` — Query tasks with filters/sorts
- `search` — Full-text search across tasks
- `retrieve-a-page` — Get a single task's details
- `retrieve-comments` / `create-a-comment` — Read/write task comments

## Schema: Property Name → Notion Type

| Property | Type | Notes |
|---|---|---|
| Title | title | Task name |
| Description | rich_text | Agent-executable detail |
| Acceptance Criteria | rich_text | Verifiable completion conditions |
| Status | status | Backlog → Ready → In Progress → In Review → Done |
| Blocked By | relation | Self-relation (dependency) |
| Assignees | people | Multi-person |
| Reporter | people | Creator |
| Reviewers | people | For In Review |
| Team | relation | → Teams DB |
| Priority | select | Urgent / High / Medium / Low |
| Project | relation | → Projects DB |
| Tags | multi_select | Free tags |
| Parent Task | relation | Self-relation (hierarchy) |
| Due Date | date | ISO format |
| Estimate | number | Hours |
| Agent Type | select | claude-code / human / review |
| Agent Output | rich_text | Execution result |
| Artifacts | url | PR links, file paths |
| Context | rich_text | Background info |

## State Transition Rules

Valid transitions:
- Backlog → Ready (when description + acceptance criteria are filled)
- Ready → In Progress (when someone starts working)
- In Progress → In Review (when work is done, needs review)
- In Progress → Blocked (when blocked by another task)
- In Review → Done (when reviewers approve)
- In Review → In Progress (when changes requested)
- Any → Backlog (deprioritize)

**Never skip In Review for tasks with `Agent Type: claude-code`.** Agent outputs must be reviewed.

## "Next Task" Logic

When the user asks "what should I do next?" or "次のタスク":

1. Query tasks where Status = "Ready" AND Blocked By is empty
2. Sort by Priority: Urgent > High > Medium > Low
3. Within same priority, sort by Due Date (earliest first)
4. Present the top task with its full context

## Task Creation Best Practices

When creating a task, ensure:
- **Description** is detailed enough for an agent or team member to execute without asking questions
- **Acceptance Criteria** is verifiable (not vague like "works well")
- **Agent Type** is set — default to "human" unless the task is clearly automatable
- **Priority** is always set — ask the user if not provided
- **Project** is set if the user has active projects

## Bulk Operations

For requests like "show me all blocked tasks" or "mark all Done tasks as archived":
1. Use `query-data-source` with appropriate filters
2. Present results to user for confirmation
3. Execute updates in sequence using `update-page-properties`
````

**Step 2: Commit**

```bash
git add skills/task-manage/
git commit -m "feat: add task-manage skill for natural language task CRUD"
```

---

### Task 12: task-view Skill

**Files:**
- Create: `skills/task-view/SKILL.md`

**Step 1: Create the skill**

Create `skills/task-view/SKILL.md`:

````markdown
---
name: task-view
description: >
  Use when the user wants to visualize tasks. Triggers on:
  "カンバン", "kanban", "リスト", "list view", "タスクを見せて",
  "show tasks", "ビュー", "view", "可視化", "visualize",
  "ガントチャート", "gantt", "カレンダー", "calendar".
---

# Headless Tasks — View Server

You manage the local view server that renders task data as interactive HTML pages.

## Starting the Server

The view server runs at `http://localhost:3456`. To start it:

```bash
cd ${CLAUDE_PLUGIN_ROOT}/server && npx tsx src/index.ts &
```

Before starting, check if it's already running:

```bash
curl -s http://localhost:3456/api/health 2>/dev/null
```

If the health check succeeds, the server is already running. Do NOT start a second instance.

Required environment variables (should already be set via settings.local.json):
- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`

## Available Views

| View | URL | Status |
|---|---|---|
| View Selector | http://localhost:3456/ | Available |
| List | http://localhost:3456/list.html | Available |
| Kanban | http://localhost:3456/kanban.html | Available |
| Calendar | http://localhost:3456/calendar.html | Coming soon |
| Gantt | http://localhost:3456/gantt.html | Coming soon |

## Opening a View

After ensuring the server is running, open the appropriate URL in the user's browser:

```bash
# macOS
open http://localhost:3456/kanban.html

# Linux
xdg-open http://localhost:3456/kanban.html

# WSL
wslview http://localhost:3456/kanban.html
```

Detect the platform and use the appropriate command.

## View Features

All views support:
- **Real-time updates**: Connected to SSE at `/api/events`. Changes made via task-manage skill are reflected automatically.
- **Client-side filtering**: Filter by Status, Priority, search text
- **Click-to-copy**: Click a task to copy its ID for use in Claude Code
- **Dark mode**: Default dark theme

## Troubleshooting

If views don't update after task changes:
1. Check the server is running: `curl http://localhost:3456/api/health`
2. Manually trigger refresh: `curl -X POST http://localhost:3456/api/refresh`
3. Check server logs in the terminal where it's running
````

**Step 2: Commit**

```bash
git add skills/task-view/
git commit -m "feat: add task-view skill for view server management"
```

---

### Task 13: task-agent Skill + Agent Definition

**Files:**
- Create: `skills/task-agent/SKILL.md`
- Create: `agents/task-agent.md`

**Step 1: Create the skill**

Create `skills/task-agent/SKILL.md`:

````markdown
---
name: task-agent
description: >
  Use when the user wants autonomous task execution. Triggers on:
  "次のタスクをやって", "do the next task", "process tasks",
  "タスクを実行", "execute tasks", "auto", "自動実行",
  "ready tasks", "Readyなタスクを処理".
user-invocable: true
---

# Headless Tasks — Autonomous Task Execution

You orchestrate the autonomous execution of tasks by AI agents.

## Execution Flow

1. **Fetch actionable tasks**: Query Notion for tasks where:
   - Status = "Ready"
   - Blocked By is empty (no unresolved dependencies)
   - Agent Type = "claude-code"
2. **Sort by priority**: Urgent > High > Medium > Low, then by Due Date
3. **For each task**:
   a. Read the Description and Acceptance Criteria
   b. Present the task to the user and ask for confirmation (unless --auto mode)
   c. Spawn the `task-agent` agent to execute the task
   d. Record the result in Agent Output
   e. Update Status to "In Review"
   f. If execution failed, update Status to "Blocked" and add a note

## Spawning the Agent

Use the Agent tool with:
- `subagent_type`: "task-agent" (custom agent defined in this plugin)
- `prompt`: Include the task's Description, Acceptance Criteria, and Context
- `mode`: "plan" (requires plan approval before making changes)

## Safety

- **Default: one task at a time with user confirmation**
- Only skip confirmation if the user explicitly says "auto" or "自動"
- Always set `mode: "plan"` so the agent must get approval before code changes
- After execution, the task moves to "In Review" — never directly to "Done"
````

**Step 2: Create the agent definition**

Create `agents/task-agent.md`:

```markdown
---
name: task-agent
description: >
  Executes a single development task autonomously. Use when the task-agent
  skill delegates a Ready task for execution. Reads task description and
  acceptance criteria, plans implementation, writes code, runs tests.
model: sonnet
permissionMode: plan
tools: Read, Write, Edit, Bash, Grep, Glob, Agent
maxTurns: 30
---

You are executing a development task. You will receive:
- **Task title and description**: What to build
- **Acceptance criteria**: How to verify completion
- **Context**: Background information and constraints

## Your Process

1. Read and understand the task fully
2. Explore the relevant codebase to understand existing patterns
3. Create a plan (you are in plan mode — get approval first)
4. After plan approval, implement the solution
5. Run tests to verify acceptance criteria
6. Report results

## Rules

- Follow existing code patterns and conventions in the project
- Write tests for any new functionality
- Do not modify files outside the scope of the task
- If you encounter blockers, report them clearly instead of guessing
```

**Step 3: Commit**

```bash
git add skills/task-agent/ agents/task-agent.md
git commit -m "feat: add task-agent skill and agent for autonomous execution"
```

---

### Task 14: Final Integration — Run All Tests + Manual Verification

**Step 1: Run all server tests**

Run: `cd server && npx vitest run`
Expected: ALL PASS

**Step 2: Verify plugin structure**

Run: `find . -not -path './.git/*' -not -path '*/node_modules/*' -type f | sort`

Expected output should match the planned structure:
```
./.claude-plugin/plugin.json
./.gitignore
./.mcp.json
./agents/task-agent.md
./docs/plans/2026-03-04-headless-tasks-design.md
./docs/plans/2026-03-04-headless-tasks-implementation.md
./hooks/hooks.json
./scripts/notify-view.sh
./server/package.json
./server/src/app.ts
./server/src/index.ts
./server/src/notion-client.ts
./server/src/sse.ts
./server/src/types.ts
./server/static/kanban.html
./server/static/list.html
./server/static/selector.html
./server/test/app.test.ts
./server/test/notion-client.test.ts
./server/test/sse.test.ts
./server/tsconfig.json
./skills/task-agent/SKILL.md
./skills/task-manage/SKILL.md
./skills/task-setup/SKILL.md
./skills/task-view/SKILL.md
```

**Step 3: Verify plugin manifest**

Run: `cat .claude-plugin/plugin.json | python3 -m json.tool`
Verify all paths resolve correctly.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete headless-tasks plugin MVP"
```
