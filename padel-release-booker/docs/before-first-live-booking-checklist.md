# Before your first live (Assisted-mode) booking — checklist

This app has **no automatic live booking mode**. "Live" here means Assisted
mode: the app opens the real Playtomic page for you at the right moment and
you complete the booking yourself. Read
[`integration-feasibility.md`](./integration-feasibility.md) if you haven't
already — it explains exactly why.

Before you rely on this for a club/time you actually care about:

- [ ] **Practice in Mock mode first.** Create the same rule shape, preview
      its occurrences, arm it, and watch it run end-to-end in the sandbox so
      the wizard, review screen, and dashboard are all familiar.
- [ ] **Confirm you have the exact right club.** Similarly named venues
      exist. In the Club step, re-read the name, location, and timezone you
      entered/confirmed before continuing.
- [ ] **Re-verify the release timing yourself.** This app does not know a
      club's actual release policy; whatever you entered is labeled
      "user-entered, not verified" throughout the UI. Confirm it against
      what the club told you (ask them directly if unsure) — do not assume
      midnight, and do not assume every club uses the same N-days-before
      window.
- [ ] **Check the price cap and currency match what you expect to pay**,
      including any fees the club adds at checkout — this app cannot see
      fees added after your price cap check if the real checkout screen
      presents them differently than you assumed.
- [ ] **Read the cancellation policy yourself on the real page** before
      paying. The review screen requires a cancellation-policy summary to
      arm, but in Assisted mode this app cannot fetch it automatically — you
      are the one who must have actually read it.
- [ ] **Know your payment method will work without extra verification you
      can't complete in time.** If your card requires 3-D Secure or similar
      step-up authentication, be ready to complete it yourself immediately —
      this app will never attempt to bypass or pre-authorize that for you.
- [ ] **Turn on notifications** (System Settings → Notifications → Padel
      Release Booker) and make sure "Do Not Disturb"/Focus modes won't
      silence the one notification that matters.
- [ ] **Keep the Mac awake and the app running through the release window.**
      If you expect to be away from the keyboard, consider the optional
      sleep-prevention setting for that window — but remember it cannot
      help if the Mac is already asleep or powered off, and it does nothing
      for a lid that's physically closed while macOS decides to sleep
      anyway.
- [ ] **Arm the rule and read the authorization review screen fully**,
      including the price cap, booking-count limits, and expiry/recurrence
      end condition, before confirming.
- [ ] **Decide what "success" looks like and watch for it.** When the
      moment arrives, this app opens the page and notifies you — it is still
      you, racing other real players, on the real site. Be at the keyboard.
- [ ] **After attempting**, use the in-app outcome report (booked / not
      booked / unsure) so Booking History accurately reflects what actually
      happened on Playtomic, independent of what the app could observe.

If any of the above isn't true yet, fix that before arming — not after.
