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
