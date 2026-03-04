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
