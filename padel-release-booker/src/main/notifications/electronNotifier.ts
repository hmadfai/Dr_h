import { Notification } from 'electron';
import type { Notifier, NotifyOptions } from '../../core/notifications/notifier.js';

/**
 * Wraps Electron's cross-platform Notification API. On macOS this surfaces
 * the system's native permission prompt the first time the app tries to
 * notify; if the user denies it, `Notification.isSupported()` still returns
 * true (permission is a separate, silent failure), so we additionally track
 * failures and let the caller surface a dashboard warning when notifications
 * are not getting through.
 */
export class ElectronNotifier implements Notifier {
  private consecutiveFailures = 0;

  async notify(title: string, body: string, options?: NotifyOptions): Promise<void> {
    if (!Notification.isSupported()) {
      this.consecutiveFailures += 1;
      return;
    }
    try {
      const notification = new Notification({
        title,
        body,
        urgency: options?.urgent ? 'critical' : 'normal',
        silent: false
      });
      notification.show();
      this.consecutiveFailures = 0;
    } catch {
      this.consecutiveFailures += 1;
    }
  }

  /** Dashboard "notification health" indicator: true after several consecutive failures. */
  isUnhealthy(): boolean {
    return this.consecutiveFailures >= 3;
  }
}
