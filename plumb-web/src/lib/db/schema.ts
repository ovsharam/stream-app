import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", [
  "fde",
  "ae",
  "am",
  "se",
  "ce",
  "swe",
  "admin",
]);

export const caseStageEnum = pgEnum("case_stage", [
  "intake",
  "context",
  "build",
  "test",
  "deploy",
]);

export const caseTypeEnum = pgEnum("case_type", ["quickwin", "bigbet"]);

export const requirementStatusEnum = pgEnum("requirement_status", [
  "open",
  "confirmed",
  "dropped",
]);

export const eventKindEnum = pgEnum("event_kind", [
  "intake",
  "open_case",
  "stage_change",
  "classify",
  "context_score",
  "ae_sync",
  "build_kickoff",
  "ingest",
]);

export const integrationProviderEnum = pgEnum("integration_provider", [
  "gmail",
  "slack",
  "monday",
  "linkedin",
]);

export const integrationStatusEnum = pgEnum("integration_status", [
  "connected",
  "disconnected",
  "error",
  "stub",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  plan: text("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: userRoleEnum("role").notNull().default("fde"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const cases = pgTable("cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(),
  title: text("title").notNull(),
  stage: caseStageEnum("stage").notNull().default("intake"),
  type: caseTypeEnum("type"),
  contextScore: integer("context_score").notNull().default(0),
  contextGaps: jsonb("context_gaps").$type<unknown[]>().notNull().default([]),
  valueUsd: integer("value_usd").notNull().default(0),
  aeName: text("ae_name"),
  buildPrompt: text("build_prompt"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const caseRequirements = pgTable("case_requirements", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  status: requirementStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const caseEvents = pgTable("case_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  kind: eventKindEnum("kind").notNull(),
  detail: text("detail").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  provider: integrationProviderEnum("provider").notNull(),
  status: integrationStatusEnum("status").notNull().default("disconnected"),
  oauthRef: text("oauth_ref"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  clients: many(clients),
  cases: many(cases),
  integrations: many(integrations),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [clients.orgId],
    references: [organizations.id],
  }),
  cases: many(cases),
}));

export const casesRelations = relations(cases, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [cases.orgId],
    references: [organizations.id],
  }),
  client: one(clients, {
    fields: [cases.clientId],
    references: [clients.id],
  }),
  requirements: many(caseRequirements),
  events: many(caseEvents),
}));

export const caseRequirementsRelations = relations(
  caseRequirements,
  ({ one }) => ({
    case: one(cases, {
      fields: [caseRequirements.caseId],
      references: [cases.id],
    }),
  }),
);

export const caseEventsRelations = relations(caseEvents, ({ one }) => ({
  case: one(cases, {
    fields: [caseEvents.caseId],
    references: [cases.id],
  }),
  actor: one(users, {
    fields: [caseEvents.actorUserId],
    references: [users.id],
  }),
}));

export type CaseRow = typeof cases.$inferSelect;
export type CaseRequirementRow = typeof caseRequirements.$inferSelect;
export type CaseEventRow = typeof caseEvents.$inferSelect;
export type ClientRow = typeof clients.$inferSelect;
export type UserRow = typeof users.$inferSelect;
