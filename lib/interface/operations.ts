import { z } from "zod";
import {
  ACCENTS,
  COMPONENT_TYPES,
  DENSITIES,
  PAGE_LAYOUTS,
  TASK_STATUSES,
  THEMES,
} from "./types";

const pageKey = z.string().min(1).max(40).regex(/^[a-z0-9-]+$/);
const nodeId = z.string().min(1).max(64);
const span = z.number().int().min(1).max(12);
const column = z.number().int().min(1).max(12);

const baseProps = z.record(z.string(), z.unknown()).optional();

/**
 * The complete set of changes the AI (or the visual editor) may perform.
 * Anything outside this union is rejected before it can touch a user interface.
 */
export const INTERFACE_OPERATIONS = [
  "addComponent",
  "removeComponent",
  "updateProps",
  "moveComponent",
  "setVisible",
  "renameComponent",
  "reorderComponents",
  "setTheme",
  "setAccent",
  "setDensity",
  "setNavCollapsed",
  "setNavWidth",
  "setPageLayout",
  "setDataSource",
] as const;

export type InterfaceOperationName = (typeof INTERFACE_OPERATIONS)[number];

export const operationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("addComponent"),
    page: pageKey,
    type: z.enum(COMPONENT_TYPES),
    title: z.string().max(60).optional(),
    props: baseProps,
    span: span.optional(),
    column: column.optional(),
    index: z.number().int().min(0).max(24).optional(),
    dataSource: z.string().max(30).optional(),
  }),
  z.object({ op: z.literal("removeComponent"), page: pageKey, id: nodeId }),
  z.object({
    op: z.literal("updateProps"),
    page: pageKey,
    id: nodeId,
    props: z.record(z.string(), z.unknown()),
  }),
  z.object({
    op: z.literal("moveComponent"),
    page: pageKey,
    id: nodeId,
    column: column.optional(),
    span: span.optional(),
    index: z.number().int().min(0).max(24).optional(),
  }),
  z.object({
    op: z.literal("setVisible"),
    page: pageKey,
    id: nodeId,
    visible: z.boolean(),
  }),
  z.object({
    op: z.literal("renameComponent"),
    page: pageKey,
    id: nodeId,
    title: z.string().max(60),
  }),
  z.object({
    op: z.literal("reorderComponents"),
    page: pageKey,
    ids: z.array(nodeId).min(1).max(24),
  }),
  z.object({ op: z.literal("setTheme"), theme: z.enum(THEMES) }),
  z.object({ op: z.literal("setAccent"), accent: z.enum(ACCENTS) }),
  z.object({ op: z.literal("setDensity"), density: z.enum(DENSITIES) }),
  z.object({ op: z.literal("setNavCollapsed"), collapsed: z.boolean() }),
  z.object({ op: z.literal("setNavWidth"), width: z.enum(["compact", "default"]) }),
  z.object({ op: z.literal("setPageLayout"), page: pageKey, layout: z.enum(PAGE_LAYOUTS) }),
  z.object({
    op: z.literal("setDataSource"),
    page: pageKey,
    id: nodeId,
    dataSource: z.enum(["tasks", "notes", "activity"]).nullable(),
  }),
]);

export type InterfaceOperation = z.infer<typeof operationSchema>;

export const operationsEnvelopeSchema = z.object({
  summary: z.string().max(240).default("Interface update"),
  message: z.string().max(600).default(""),
  operations: z.array(operationSchema).min(1).max(8),
});

export type OperationsEnvelope = z.infer<typeof operationsEnvelopeSchema>;

export const STATUS_VALUES = TASK_STATUSES;
