import { z } from "zod";

export type User = {
  id: string;
  email: string;
  firstName: string | null;
  city: string | null;
  timezone: string | null;
  ageConfirmed: boolean;
  createdAt: string;
};

export type Request = {
  id: string;
  userId: string;
  textTitle: string;
  textSourceId: string | null;
  pace: "slow" | "medium" | "fast";
  commitment: "casual" | "serious";
  scheduleWindows: string | null;
  language: string | null;
  status: "open" | "matched" | "closed";
  createdAt: string;
};

export type Pairing = {
  id: string;
  userAId: string;
  userBId: string;
  textTitle: string;
  textSourceId: string | null;
  textSource: string | null;
  pace: "slow" | "medium" | "fast" | null;
  startedAt: string;
  endedAt: string | null;
  status: "active" | "completed" | "dissolved";
  nextSessionAt: string | null;
  notebookContent: string;
  notebookUpdatedAt: string;
};

export type StudySession = {
  id: string;
  pairingId: string;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  recap: string | null;
  createdAt: string;
};

export type ReadingText = {
  id: string;
  ownerUserId: string;
  title: string;
  sourceKind: "upload" | "web_pdf";
  sourceUrl: string | null;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  fileSize: number | null;
  createdAt: string;
};

export type Report = {
  id: string;
  reporterId: string;
  reportedId: string;
  pairingId: string;
  reason: string;
  details: string | null;
  status: "open" | "reviewed" | "dismissed" | "actioned";
  createdAt: string;
};

export const insertUserSchema = z.object({
  email: z.string().email("Enter a valid email"),
  firstName: z.string().max(40).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  timezone: z.string().nullable().optional(),
  ageConfirmed: z.boolean().optional(),
});
export type InsertUser = z.infer<typeof insertUserSchema>;

export const insertRequestSchema = z.object({
  textTitle: z.string().min(1, "What do you want to read?").max(160),
  textSourceId: z.string().uuid().nullable().optional(),
  pace: z.enum(["slow", "medium", "fast"]),
  commitment: z.enum(["casual", "serious"]),
  scheduleWindows: z.string().nullable().optional(),
  language: z.string().default("English"),
});
export type InsertRequest = z.infer<typeof insertRequestSchema>;

export const profileSchema = z.object({
  firstName: z.string().min(1, "Required").max(40),
  city: z.string().min(1, "Required").max(80),
  timezone: z.string().default("UTC"),
  ageConfirmed: z
    .boolean()
    .refine((v) => v === true, "You must confirm you are 18 or older"),
});
export type Profile = z.infer<typeof profileSchema>;

export const claimEmailSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

export const createReadingTextSchema = z.object({
  title: z.string().min(1, "Title is required").max(180),
  sourceKind: z.enum(["upload", "web_pdf"]),
  sourceUrl: z.string().url().nullable().optional(),
  storagePath: z.string().min(1),
  fileSize: z.number().int().nonnegative().nullable().optional(),
});
export type CreateReadingText = z.infer<typeof createReadingTextSchema>;

export const fetchPdfSchema = z.object({
  url: z.string().url("Enter a PDF URL or a page with a PDF link"),
  title: z.string().max(180).optional(),
});

export const createReportSchema = z.object({
  reason: z.string().min(1, "Choose a reason").max(80),
  details: z.string().max(1000).nullable().optional(),
});
export type CreateReport = z.infer<typeof createReportSchema>;
