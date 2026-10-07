/**
 * Narrow notification interface. The real implementation
 * (`main/notifications/electronNotifier.ts`) wraps Electron's `Notification`
 * API and macOS's native permission prompt; a no-op/recording implementation
 * is used in tests.
 */
export interface NotifyOptions {
  /** Set true for anything the user must not miss (release imminent, emergency stop fired, unknown booking outcome). Platforms may use this to pick a more persistent presentation. */
  urgent?: boolean;
  /** Logical identifier so repeated calls for the same condition can replace/coalesce rather than stacking up. */
  tag?: string;
}

export interface Notifier {
  notify(title: string, body: string, options?: NotifyOptions): Promise<void>;
}

export class RecordingNotifier implements Notifier {
  readonly sent: { title: string; body: string; options: NotifyOptions | undefined }[] = [];

  async notify(title: string, body: string, options?: NotifyOptions): Promise<void> {
    this.sent.push({ title, body, options });
  }
}
