import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const registrationStatusEnum = pgEnum("registration_status", [
  "pending",
  "accepted",
  "rejected",
]);

export const academies = pgTable(
  "academies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    tagline: text("tagline"),
    location: text("location"),
    phone: text("phone"),
    isOnlineRegistrationAllowed: boolean("is_online_registration_allowed")
      .notNull()
      .default(true),
    isActive: boolean("is_active").notNull().default(true),
    ownerUserId: uuid("owner_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    pendingOwnerEmail: text("pending_owner_email"),
    upiQrStorageKey: text("upi_qr_storage_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("academies_slug_unique").on(table.slug),
    uniqueIndex("academies_owner_user_id_unique")
      .on(table.ownerUserId)
      .where(sql`${table.ownerUserId} is not null`),
    check(
      "academies_slug_format",
      sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
    index("academies_is_active_idx").on(table.isActive),
  ],
);

export const batches = pgTable(
  "batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    blurb: text("blurb"),
    isOpenForRegistration: boolean("is_open_for_registration")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("batches_academy_id_name_unique").on(
      table.academyId,
      sql`lower(btrim(${table.name}))`,
    ),
  ],
);

export const batchFeeOptions = pgTable(
  "batch_fee_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "restrict" }),
    daysPerWeek: integer("days_per_week").notNull(),
    termMonths: integer("term_months").notNull(),
    feePaise: integer("fee_paise").notNull(),
    label: text("label"),
    isOffered: boolean("is_offered").notNull().default(true),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("batch_fee_options_batch_id_days_per_week_term_months_unique").on(
      table.batchId,
      table.daysPerWeek,
      table.termMonths,
    ),
    check(
      "batch_fee_options_days_per_week_range",
      sql`${table.daysPerWeek} between 1 and 7`,
    ),
  ],
);

export const players = pgTable(
  "players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    fullName: text("full_name").notNull(),
    fullNameNormalized: text("full_name_normalized").notNull(),
    phone: text("phone").notNull(),
    dateOfBirth: date("date_of_birth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("players_academy_id_full_name_normalized_phone_unique").on(
      table.academyId,
      table.fullNameNormalized,
      table.phone,
    ),
  ],
);

export const registrations = pgTable(
  "registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "restrict" }),
    batchFeeOptionId: uuid("batch_fee_option_id")
      .notNull()
      .references(() => batchFeeOptions.id, { onDelete: "restrict" }),
    daysPerWeek: integer("days_per_week").notNull(),
    termMonths: integer("term_months").notNull(),
    feePaise: integer("fee_paise").notNull(),
    playerFullName: text("player_full_name").notNull(),
    playerFullNameNormalized: text("player_full_name_normalized").notNull(),
    playerDateOfBirth: date("player_date_of_birth").notNull(),
    guardianFullName: text("guardian_full_name"),
    guardianPhone: text("guardian_phone"),
    playerPhone: text("player_phone"),
    contactPhone: text("contact_phone").notNull(),
    note: text("note"),
    status: registrationStatusEnum("status").notNull().default("pending"),
    playerId: uuid("player_id").references(() => players.id, {
      onDelete: "restrict",
    }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectedByUserId: uuid("rejected_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("registrations_pending_duplicate_guard")
      .on(
        table.academyId,
        table.batchId,
        table.contactPhone,
        table.playerFullNameNormalized,
      )
      .where(sql`${table.status} = 'pending'`),
    index("registrations_academy_id_status_idx").on(
      table.academyId,
      table.status,
    ),
    check(
      "registrations_days_per_week_range",
      sql`${table.daysPerWeek} between 1 and 7`,
    ),
  ],
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "restrict" }),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => registrations.id, { onDelete: "restrict" }),
    daysPerWeek: integer("days_per_week").notNull(),
    termMonths: integer("term_months").notNull(),
    feePaisePaid: integer("fee_paise_paid").notNull(),
    validFrom: date("valid_from").notNull(),
    validUntil: date("valid_until").notNull(),
    renewedFromEnrollmentId: uuid("renewed_from_enrollment_id").references(
      (): AnyPgColumn => enrollments.id,
      { onDelete: "restrict" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "enrollments_days_per_week_range",
      sql`${table.daysPerWeek} between 1 and 7`,
    ),
  ],
);

export const brochureImages = pgTable("brochure_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  academyId: uuid("academy_id")
    .notNull()
    .references(() => academies.id, { onDelete: "restrict" }),
  storageKey: text("storage_key").notNull(),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const youtubeEmbeds = pgTable("youtube_embeds", {
  id: uuid("id").primaryKey().defaultRandom(),
  academyId: uuid("academy_id")
    .notNull()
    .references(() => academies.id, { onDelete: "restrict" }),
  videoId: text("video_id").notNull(),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const coachProfiles = pgTable("coach_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  academyId: uuid("academy_id")
    .notNull()
    .references(() => academies.id, { onDelete: "restrict" }),
  fullName: text("full_name").notNull(),
  storageKey: text("storage_key"),
  blurb: text("blurb"),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const impersonationAuditEvents = pgTable("impersonation_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  subjectUserId: uuid("subject_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  academyId: uuid("academy_id")
    .notNull()
    .references(() => academies.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
