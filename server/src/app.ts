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
