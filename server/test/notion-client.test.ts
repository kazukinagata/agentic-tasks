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
