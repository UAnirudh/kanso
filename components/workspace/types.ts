import type { InterfaceDocument, InterfaceNode } from "@/lib/interface/types";
import type { InterfaceOperation } from "@/lib/interface/operations";
import type { Role } from "@/lib/roles";

export interface WorkspaceUser {
  id: string;
  name: string;
}

export interface WorkspaceAppInfo {
  id: string;
  name: string;
  description: string;
}

export interface AiInfo {
  provider: string;
  model: string;
  kind: "model" | "local";
}

export interface AiProposalView {
  id: string;
  summary: string;
  message: string;
  operations: InterfaceOperation[];
  warnings: string[];
  proposedDocument: InterfaceDocument;
  provider: string;
  model: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
}

export interface RevisionView {
  id: string;
  kind: string;
  label: string;
  createdAt: string;
  operations: unknown[];
}

export interface MemberView {
  userId: string;
  name: string;
  role: Role;
  createdAt: string;
}

export type ToastTone = "info" | "error" | "success";

export interface ToastState {
  message: string;
  tone: ToastTone;
}

export interface TaskDialogState {
  mode: "create" | "edit";
  task?: {
    id: string;
    title: string;
    description: string;
    status: string | null;
    priority: string | null;
    dueDate: string | null;
  };
}

export interface NodeSettingsRequest {
  node: InterfaceNode;
  page: string;
}
