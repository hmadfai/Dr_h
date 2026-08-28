import type { Anomaly, DropoutCase, Learner, Organisation, Programme } from "@prisma/client";
import { decrypt } from "./crypto";

export function revealOrganisation(org: Organisation) {
  return {
    ...org,
    addressLine1: decrypt(org.addressLine1),
    postcode: decrypt(org.postcode),
    dasAccountId: decrypt(org.dasAccountId),
    dasHolderEmail: decrypt(org.dasHolderEmail),
    dasHolderPhone: decrypt(org.dasHolderPhone),
  };
}

export function revealLearner(learner: Learner) {
  return {
    ...learner,
    email: decrypt(learner.email),
    phone: decrypt(learner.phone),
    dateOfBirth: decrypt(learner.dateOfBirth),
    nationalInsurance: decrypt(learner.nationalInsurance),
    uln: decrypt(learner.uln),
    addressLine1: decrypt(learner.addressLine1),
    postcode: decrypt(learner.postcode),
    lineManagerEmail: decrypt(learner.lineManagerEmail),
    lineManagerPhone: decrypt(learner.lineManagerPhone),
  };
}

export type LearnerWithOrg = Learner & {
  organisation: Organisation;
  programme: Programme | null;
  anomalies?: Anomaly[];
  dropouts?: DropoutCase[];
};

export function fullName(person: { firstName: string; lastName: string; preferredName?: string | null }) {
  const display = person.preferredName || person.firstName;
  return `${display} ${person.lastName}`.trim();
}

export function otjPercent(learner: { otjHoursLogged: number; otjHoursRequired: number }) {
  if (!learner.otjHoursRequired) return 0;
  return Math.min(100, Math.round((learner.otjHoursLogged / learner.otjHoursRequired) * 100));
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function daysUntil(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const diff = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
}
