/**
 * The complete, narrow IPC surface between the renderer and the main
 * process. The renderer never gets a raw `ipcRenderer` — the preload script
 * (`src/preload/index.ts`) exposes exactly these functions via
 * `contextBridge.exposeInMainWorld`, and the main process
 * (`src/main/ipc/handlers.ts`) re-validates every argument with zod before
 * touching the database, the adapter, or the filesystem.
 */

import type {
  AdapterMode,
  AuthorizationSnapshot,
  BookingRecord,
  BookingRule,
  Club,
  CourtInfo,
  Occurrence,
  SessionInfo
} from '../core/domain/types.js';
import type { AuthorizationReviewSummary } from '../core/domain/authorization.js';
import type { BookingRuleInput } from '../core/domain/validation.js';
import type { OccurrencePlanEntry } from '../core/time/releaseSchedule.js';

export const IPC_CHANNELS = {
  getAppState: 'padel:getAppState',
  connect: 'padel:connect',
  disconnect: 'padel:disconnect',
  resolveClubByUrl: 'padel:resolveClubByUrl',
  confirmClub: 'padel:confirmClub',
  searchClubs: 'padel:searchClubs',
  listCourts: 'padel:listCourts',
  createRule: 'padel:createRule',
  updateRule: 'padel:updateRule',
  deleteRule: 'padel:deleteRule',
  previewOccurrences: 'padel:previewOccurrences',
  buildAuthorizationReview: 'padel:buildAuthorizationReview',
  armRule: 'padel:armRule',
  pauseRule: 'padel:pauseRule',
  resumeRule: 'padel:resumeRule',
  emergencyStop: 'padel:emergencyStop',
  emergencyResume: 'padel:emergencyResume',
  listOccurrences: 'padel:listOccurrences',
  listBookingHistory: 'padel:listBookingHistory',
  reportUserOutcome: 'padel:reportUserOutcome',
  exportDiagnostics: 'padel:exportDiagnostics',
  deleteAllLocalData: 'padel:deleteAllLocalData',
  openClubPage: 'padel:openClubPage',
  onHeartbeat: 'padel:onHeartbeat',
  onNotice: 'padel:onNotice'
} as const;

export interface AppStateSummary {
  mode: AdapterMode;
  session: SessionInfo;
  clubs: Club[];
  rules: (BookingRule & { isPaused: boolean })[];
  recentBookings: BookingRecord[];
  emergencyStopped: boolean;
  schedulerRunning: boolean;
  lastHeartbeatWallMs: number | null;
  platformWarnings: string[];
}

export interface ConnectRequest {
  mode: AdapterMode;
  hint?: string;
}

export interface CreateRuleResponse {
  rule: BookingRule;
  occurrences: Occurrence[];
  warnings: string[];
}

export interface ArmRuleRequest {
  ruleId: string;
  reviewedSummaryHash: string;
}

export interface ReportUserOutcomeRequest {
  occurrenceId: string;
  outcome: 'booked' | 'not-booked' | 'unknown';
  bookingReference?: string;
}

export interface HeartbeatEvent {
  nowWallMs: number;
  activeOccurrenceCount: number;
}

export interface NoticeEvent {
  level: 'info' | 'warning' | 'error';
  title: string;
  body: string;
}

/** The typed function surface the preload script exposes as `window.padelApi`. */
export interface PadelApi {
  getAppState(): Promise<AppStateSummary>;
  connect(request: ConnectRequest): Promise<SessionInfo>;
  disconnect(): Promise<void>;
  resolveClubByUrl(url: string): Promise<Club>;
  confirmClub(club: Club): Promise<void>;
  searchClubs(query: string): Promise<Club[]>;
  listCourts(clubId: string): Promise<CourtInfo[]>;
  createRule(input: BookingRuleInput): Promise<CreateRuleResponse>;
  updateRule(ruleId: string, input: BookingRuleInput): Promise<CreateRuleResponse>;
  deleteRule(ruleId: string): Promise<void>;
  previewOccurrences(input: BookingRuleInput, count: number): Promise<OccurrencePlanEntry[]>;
  buildAuthorizationReview(ruleId: string): Promise<AuthorizationReviewSummary & { _hash: string }>;
  armRule(request: ArmRuleRequest): Promise<AuthorizationSnapshot>;
  pauseRule(ruleId: string): Promise<void>;
  resumeRule(ruleId: string): Promise<void>;
  emergencyStop(): Promise<void>;
  emergencyResume(): Promise<void>;
  listOccurrences(ruleId: string): Promise<Occurrence[]>;
  listBookingHistory(limit: number): Promise<BookingRecord[]>;
  reportUserOutcome(request: ReportUserOutcomeRequest): Promise<void>;
  exportDiagnostics(): Promise<string>;
  deleteAllLocalData(): Promise<void>;
  openClubPage(url: string): Promise<void>;
  onHeartbeat(listener: (event: HeartbeatEvent) => void): () => void;
  onNotice(listener: (event: NoticeEvent) => void): () => void;
}
