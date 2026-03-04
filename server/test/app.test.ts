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
    process.env.NOTION_TOKEN = "ntn_test";
    process.env.NOTION_DATABASE_ID = "test-db-id";
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
