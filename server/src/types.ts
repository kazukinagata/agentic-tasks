export interface Task {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  status: "Backlog" | "Ready" | "In Progress" | "In Review" | "Done" | "Blocked";
  blockedBy: string[];
  priority: "Urgent" | "High" | "Medium" | "Low" | null;
  executor: "claude-code" | "cowork" | "antigravity" | "human" | null;
  requiresReview: boolean;
  executionPlan: string;
  workingDirectory: string;
  sessionReference: string;
  dispatchedAt: string | null;
  agentOutput: string;
  errorMessage: string;
  // Extended fields (optional)
  context: string;
  artifacts: string;
  repository: string | null;
  dueDate: string | null;
  tags: string[];
  parentTaskId: string | null;
  project: string | null;
  team: string | null;
  assignees: Person[];
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
