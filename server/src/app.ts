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
