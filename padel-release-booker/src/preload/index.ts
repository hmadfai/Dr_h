import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc.js';
import type {
  AppStateSummary,
  ArmRuleRequest,
  ConnectRequest,
  CreateRuleResponse,
  HeartbeatEvent,
  NoticeEvent,
  PadelApi,
  ReportUserOutcomeRequest
} from '../shared/ipc.js';
import type { AuthorizationSnapshot, Club, CourtInfo, Occurrence, SessionInfo, BookingRecord } from '../core/domain/types.js';
import type { BookingRuleInput } from '../core/domain/validation.js';
import type { AuthorizationReviewSummary } from '../core/domain/authorization.js';
import type { OccurrencePlanEntry } from '../core/time/releaseSchedule.js';

/**
 * The only bridge between the sandboxed renderer and the main process.
 * Nothing here exposes `ipcRenderer`, `require`, or any Node API directly —
 * only these specific, typed async functions, matching `PadelApi` exactly so
 * the renderer and main process cannot silently drift out of sync.
 */
const api: PadelApi = {
  getAppState: (): Promise<AppStateSummary> => ipcRenderer.invoke(IPC_CHANNELS.getAppState),
  connect: (request: ConnectRequest): Promise<SessionInfo> => ipcRenderer.invoke(IPC_CHANNELS.connect, request),
  disconnect: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.disconnect),
  resolveClubByUrl: (url: string): Promise<Club> => ipcRenderer.invoke(IPC_CHANNELS.resolveClubByUrl, { url }),
  confirmClub: (club: Club): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.confirmClub, club),
  searchClubs: (query: string): Promise<Club[]> => ipcRenderer.invoke(IPC_CHANNELS.searchClubs, query),
  listCourts: (clubId: string): Promise<CourtInfo[]> => ipcRenderer.invoke(IPC_CHANNELS.listCourts, clubId),
  createRule: (input: BookingRuleInput): Promise<CreateRuleResponse> => ipcRenderer.invoke(IPC_CHANNELS.createRule, input),
  updateRule: (ruleId: string, input: BookingRuleInput): Promise<CreateRuleResponse> => ipcRenderer.invoke(IPC_CHANNELS.updateRule, ruleId, input),
  deleteRule: (ruleId: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.deleteRule, ruleId),
  previewOccurrences: (input: BookingRuleInput, count: number): Promise<OccurrencePlanEntry[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.previewOccurrences, input, count),
  buildAuthorizationReview: (ruleId: string): Promise<AuthorizationReviewSummary & { _hash: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.buildAuthorizationReview, ruleId),
  armRule: (request: ArmRuleRequest): Promise<AuthorizationSnapshot> => ipcRenderer.invoke(IPC_CHANNELS.armRule, request),
  pauseRule: (ruleId: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.pauseRule, ruleId),
  resumeRule: (ruleId: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.resumeRule, ruleId),
  emergencyStop: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.emergencyStop),
  emergencyResume: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.emergencyResume),
  listOccurrences: (ruleId: string): Promise<Occurrence[]> => ipcRenderer.invoke(IPC_CHANNELS.listOccurrences, ruleId),
  listBookingHistory: (limit: number): Promise<BookingRecord[]> => ipcRenderer.invoke(IPC_CHANNELS.listBookingHistory, limit),
  reportUserOutcome: (request: ReportUserOutcomeRequest): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.reportUserOutcome, request),
  exportDiagnostics: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.exportDiagnostics),
  deleteAllLocalData: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.deleteAllLocalData),
  openClubPage: (url: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.openClubPage, url),
  onHeartbeat: (listener: (event: HeartbeatEvent) => void): (() => void) => {
    const handler = (_e: unknown, payload: HeartbeatEvent): void => listener(payload);
    ipcRenderer.on(IPC_CHANNELS.onHeartbeat, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.onHeartbeat, handler);
  },
  onNotice: (listener: (event: NoticeEvent) => void): (() => void) => {
    const handler = (_e: unknown, payload: NoticeEvent): void => listener(payload);
    ipcRenderer.on(IPC_CHANNELS.onNotice, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.onNotice, handler);
  }
};

contextBridge.exposeInMainWorld('padelApi', api);
