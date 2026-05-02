import { useState, useEffect, useRef, useCallback } from "react";
import { Sun, Moon, Trash2, ShieldCheck } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import Avatar from "../components/Avatar.jsx";
import Toggle from "../components/Toggle.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { api } from "../lib/api.js";
import { useAuth, useTheme } from "../lib/auth.jsx";
import { useToast } from "../components/Toast.jsx";
import { COUNTRIES, YEAR_OF_STUDY_OPTIONS } from "../lib/countries.js";
import {
  isPushSupported,
  getPermission,
  getSubscription,
  subscribePush,
  unsubscribePush,
  sendTestPush,
} from "../lib/push.js";

const NOTIFY_KINDS = [
  { key: "verify",    label: "Case verifications",     hint: "When a case you submitted is approved or rejected." },
  { key: "discussion",label: "Replies & mentions",     hint: "Comments on your cases, replies in threads you joined." },
  { key: "message",   label: "Direct messages",        hint: "New private messages from other clinicians." },
  { key: "lounge",    label: "Lounge activity",        hint: "Posts and reactions in the doctor's lounge." },
  { key: "system",    label: "System & announcements", hint: "Important account and platform notices." },
];

function shortDevice(ua) {
  if (!ua) return "This device";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone / iPad";
  if (/Android/i.test(ua)) return "Android device";
  if (/Edg\//i.test(ua)) return "Edge browser";
  if (/Chrome\//i.test(ua)) return "Chrome browser";
  if (/Firefox\//i.test(ua)) return "Firefox browser";
  if (/Safari\//i.test(ua)) return "Safari browser";
  return "Web browser";
}

export default function Settings() {
  const { user, refresh } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const [confirmEl, askConfirm] = useConfirm();
  const [showScores, setShowScores] = useState(false);
  const [country, setCountry] = useState("");
  const [yearOfStudy, setYearOfStudy] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const fileRef = useRef(null);

  const supported = isPushSupported();
  const [permission, setPermission] = useState(supported ? getPermission() : "unsupported");
  const [pushOn, setPushOn] = useState(true);
  const [kinds, setKinds] = useState({});
  const [subscriptions, setSubscriptions] = useState([]);
  const [hasLocalSub, setHasLocalSub] = useState(false);
  const [busyPush, setBusyPush] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Promo code promotion
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoSuccess, setPromoSuccess] = useState(false);

  // Account deletion request
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteReqStatus, setDeleteReqStatus] = useState(null); // null | "pending" | "approved" | "rejected"
  const [deleteReqLoading, setDeleteReqLoading] = useState(false);
  const [deleteReqSubmitting, setDeleteReqSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setShowScores(!!user.show_scores);
      setCountry(user.country || "");
      setYearOfStudy(user.year_of_study || "");
      setAvatarUrl(user.avatar_url || null);
    }
  }, [user]);

  const refreshPushState = useCallback(async () => {
    if (!supported) return;
    try {
      const me = await api.get("/api/push/me");
      setPushOn(me.prefs?.push_on !== false);
      setKinds(me.prefs?.kinds || {});
      setSubscriptions(me.subscriptions || []);
      setPermission(getPermission());
      const sub = await getSubscription();
      setHasLocalSub(!!sub);
    } catch (e) { /* silent */ }
  }, [supported]);

  useEffect(() => { refreshPushState(); }, [refreshPushState]);

  // Live-watch the browser permission so the UI updates the instant the user
  // changes it in the site permissions popover (no manual reload needed).
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    let permStatus = null;
    const onChange = () => { if (!cancelled) refreshPushState(); };
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: "notifications" }).then((status) => {
        if (cancelled) return;
        permStatus = status;
        status.addEventListener("change", onChange);
      }).catch((e) => {
        // Some browsers refuse Permissions API queries for "notifications";
        // we just fall back to focus-based polling. Surface to logs.
        console.warn("Permissions.query(notifications) failed:", e?.message || e);
      });
    }
    const onFocus = () => refreshPushState();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      if (permStatus) permStatus.removeEventListener("change", onChange);
    };
  }, [supported, refreshPushState]);

  async function save() {
    setSavingProfile(true);
    try {
      await api.patch("/api/profiles/me", {
        showScores,
        country,
        ...(user?.role === "student" ? { year_of_study: yearOfStudy } : {}),
      });
      await refresh();
      toast.success("Saved");
    } catch (e) { toast.error(e.message); }
    finally { setSavingProfile(false); }
  }

  async function pickAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Pick an image file");
    if (file.size > 4 * 1024 * 1024) return toast.error("Image must be under 4 MB");
    setUploading(true);
    try {
      const r = await api.upload("/api/profiles/me/avatar", [file], "file");
      setAvatarUrl(r.avatar_url);
      await refresh();
      toast.success("Profile picture updated");
    } catch (err) { toast.error(err.message); }
    finally { setUploading(false); }
  }

  useEffect(() => {
    setDeleteReqLoading(true);
    api.get("/api/auth/account-delete-request")
      .then((r) => { setDeleteReqStatus(r.status || null); })
      .catch(() => {})
      .finally(() => setDeleteReqLoading(false));
  }, []);

  async function submitPromoCode() {
    if (!promoCode.trim()) return toast.error("Enter a promo code");
    setPromoLoading(true);
    try {
      await api.post("/api/auth/promote", { code: promoCode.trim() });
      setPromoSuccess(true);
      setPromoCode("");
      await refresh();
      toast.success("Account promoted to admin! Please refresh to see the changes.");
    } catch (e) {
      toast.error(e.message || "Invalid promo code");
    } finally {
      setPromoLoading(false);
    }
  }

  async function submitDeleteRequest() {
    const ok = await askConfirm({
      title: "Request account deletion?",
      body: "An admin will review your request. Your account will remain active until the admin approves. You can cancel at any time by contacting support.",
      confirmLabel: "Submit request",
      tone: "danger",
    });
    if (!ok) return;
    setDeleteReqSubmitting(true);
    try {
      await api.post("/api/auth/account-delete-request", { reason: deleteReason });
      setDeleteReqStatus("pending");
      setDeleteReason("");
      toast.success("Request submitted. An admin will review it shortly.");
    } catch (e) { toast.error(e.message); }
    finally { setDeleteReqSubmitting(false); }
  }

  async function removeAvatar() {
    if (!avatarUrl) return;
    const ok = await askConfirm({
      title: "Remove profile picture?",
      body: "Your initials will be shown instead. You can always upload a new picture later.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.del("/api/profiles/me/avatar");
      setAvatarUrl(null);
      await refresh();
      toast.success("Removed");
    } catch (e) { toast.error(e.message); }
  }

  async function enablePush() {
    if (!supported) return;
    setBusyPush(true);
    try {
      await subscribePush();
      await api.patch("/api/push/prefs", { push_on: true });
      setPushOn(true);
      toast.success("Notifications enabled on this device");
      await refreshPushState();
    } catch (e) {
      if (e.code === "denied") {
        toast.error("Notifications are blocked. Reset the permission from your browser's site settings, then click Recheck.");
        setPermission("denied");
      } else {
        toast.error(e.message || "Could not enable notifications");
      }
      await refreshPushState();
    } finally { setBusyPush(false); }
  }

  async function disableThisDevice() {
    setBusyPush(true);
    try {
      await unsubscribePush();
      toast.success("This device unsubscribed");
      await refreshPushState();
    } catch (e) { toast.error(e.message); }
    finally { setBusyPush(false); }
  }

  async function removeRemoteSub(endpoint) {
    try {
      await api.post("/api/push/unsubscribe", { endpoint });
      toast.success("Device removed");
      await refreshPushState();
    } catch (e) { toast.error(e.message); }
  }

  async function togglePushOn(next) {
    setPushOn(next);
    setSavingPrefs(true);
    try { await api.patch("/api/push/prefs", { push_on: next }); }
    catch (e) { toast.error(e.message); setPushOn(!next); }
    finally { setSavingPrefs(false); }
  }

  async function toggleKind(k, next) {
    const updated = { ...kinds, [k]: next };
    setKinds(updated);
    setSavingPrefs(true);
    try { await api.patch("/api/push/prefs", { kinds: updated }); }
    catch (e) { toast.error(e.message); setKinds(kinds); }
    finally { setSavingPrefs(false); }
  }

  async function test() {
    setSendingTest(true);
    try {
      const r = await sendTestPush();
      if (r.sent > 0) toast.success(`Test sent to ${r.sent} device${r.sent === 1 ? "" : "s"}`);
      else if (r.skipped) toast.error("Push is currently disabled in your preferences.");
      else toast.error("No subscribed devices yet — enable on this device first.");
    } catch (e) { toast.error(e.message); }
    finally { setSendingTest(false); }
  }

  const permBadge = (() => {
    if (!supported)        return { text: "Not supported in this browser", tone: "muted" };
    if (permission === "denied")  return { text: "Blocked by browser",   tone: "danger" };
    if (permission === "granted" && hasLocalSub) return { text: "Enabled on this device", tone: "ok" };
    if (permission === "granted") return { text: "Permission granted",   tone: "ok" };
    return { text: "Not enabled",  tone: "warn" };
  })();

  return (
    <AppShell>
      <div className="container fade-in" style={{ maxWidth: 720 }}>
        <h2>Settings</h2>
        <p className="muted" style={{ marginTop: 4 }}>Account, notifications, and visibility preferences.</p>
        <div className="spacer-7" />

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Profile</h3>
          <div className="field">
            <label className="label">Profile picture <span className="muted small">(optional)</span></label>
            <div className="row" style={{ gap: 16, alignItems: "center" }}>
              <Avatar url={avatarUrl} name={user?.full_name || user?.username} size={72} />
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <input type="file" accept="image/*" hidden ref={fileRef} onChange={pickAvatar} />
                <button type="button" className="btn btn-secondary btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? <span className="spinner" /> : (avatarUrl ? "Change" : "Upload picture")}
                </button>
                {avatarUrl && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={removeAvatar} disabled={uploading}>Remove</button>
                )}
              </div>
            </div>
            <div className="help">Square images look best · max 4 MB · PNG, JPG, WEBP, GIF, HEIC.</div>
          </div>

          <div className="field">
            <label className="label" htmlFor="settings-country">Country</label>
            <select
              id="settings-country"
              className="select"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              <option value="">— Select country —</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          {user?.role === "student" && (
            <div className="field">
              <label className="label" htmlFor="settings-yos">Year of study</label>
              <select
                id="settings-yos"
                className="select"
                value={yearOfStudy}
                onChange={(e) => setYearOfStudy(e.target.value)}
              >
                <option value="">— Select year —</option>
                {YEAR_OF_STUDY_OPTIONS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}

          {user?.role === "student" && (
            <div className="field">
              <label className="label">Show scores publicly on profile</label>
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" checked={showScores} onChange={(e) => setShowScores(e.target.checked)} />
                <span className="muted small">Off by default. Your average score will be visible to anyone viewing your profile.</span>
              </label>
            </div>
          )}

          <button className="btn btn-primary" onClick={save} disabled={savingProfile}>
            {savingProfile ? <><span className="spinner" /> Saving…</> : "Save changes"}
          </button>
        </div>

        <div className="spacer-6" />

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Appearance</h3>
          <p className="muted small" style={{ marginTop: 4 }}>Choose a theme for the app.</p>
          <div className="theme-toggle-row" role="radiogroup" aria-label="Theme">
            {[
              { v: "light", label: "Light", Icon: Sun },
              { v: "dark", label: "Dark", Icon: Moon },
            ].map((opt) => (
              <button
                key={opt.v}
                type="button"
                role="radio"
                aria-checked={theme === opt.v}
                className={`seg-btn ${theme === opt.v ? "is-active" : ""}`}
                onClick={() => setTheme(opt.v)}
              >
                <opt.Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                <span style={{ marginLeft: 6 }}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="spacer-6" />

        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <h3 style={{ margin: 0 }}>Browser notifications</h3>
              <p className="muted small" style={{ margin: "4px 0 0" }}>
                Get pinged on this device even when CrLearn isn't open.
              </p>
            </div>
            <span className={`pill pill-${permBadge.tone}`}>{permBadge.text}</span>
          </div>

          <div className="spacer-5" />

          {!supported && (
            <p className="muted small">
              Your browser doesn't support web push. Try the latest Chrome, Edge, Firefox, or Safari (iOS&nbsp;16.4+ when installed to home screen).
            </p>
          )}

          {supported && permission === "denied" && (
            <div className="callout callout-warn">
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Notifications are blocked for this site</div>
              <ol style={{ margin: "0 0 8px 18px", padding: 0 }}>
                <li>Click the lock / tune icon to the left of the URL in your address bar.</li>
                <li>Find <strong>Notifications</strong> and switch it to <strong>Allow</strong>.</li>
                <li>Come back to this tab — it will refresh on its own.</li>
              </ol>
              <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                <button className="btn btn-sm" onClick={refreshPushState}>Recheck</button>
                <button className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>Reload page</button>
              </div>
            </div>
          )}

          {supported && (
            <>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {!hasLocalSub ? (
                  <button className="btn btn-primary" onClick={enablePush} disabled={busyPush || permission === "denied"}>
                    {busyPush ? <span className="spinner" /> : "Enable on this device"}
                  </button>
                ) : (
                  <button className="btn btn-secondary" onClick={disableThisDevice} disabled={busyPush}>
                    {busyPush ? <span className="spinner" /> : "Disable on this device"}
                  </button>
                )}
                <button className="btn btn-ghost" onClick={test} disabled={sendingTest || subscriptions.length === 0}>
                  {sendingTest ? <span className="spinner" /> : "Send test notification"}
                </button>
              </div>

              <div className="spacer-6" />

              <Toggle
                checked={pushOn}
                onChange={togglePushOn}
                disabled={savingPrefs}
                label="Master switch"
                sublabel="Off pauses all push notifications across every device, without unsubscribing them."
              />

              <div className="spacer-5" />

              <div className="muted small" style={{ marginBottom: 8, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>
                Notify me about
              </div>
              <div className="stack" style={{ gap: 4 }}>
                {NOTIFY_KINDS.map((k) => (
                  <Toggle
                    key={k.key}
                    label={k.label}
                    sublabel={k.hint}
                    checked={kinds[k.key] !== false}
                    onChange={(v) => toggleKind(k.key, v)}
                    disabled={savingPrefs || !pushOn}
                  />
                ))}
              </div>

              <div className="spacer-6" />

              <div className="muted small" style={{ marginBottom: 8, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>
                Devices receiving notifications
              </div>
              {subscriptions.length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>No devices subscribed yet.</p>
              ) : (
                <ul className="device-list">
                  {subscriptions.map((s) => (
                    <li key={s.id} className="device-row">
                      <div>
                        <div style={{ fontWeight: 600 }}>{shortDevice(s.device)}</div>
                        <div className="muted small">
                          Added {new Date(s.created_at).toLocaleDateString()} · last used {new Date(s.last_used_at).toLocaleDateString()}
                        </div>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => removeRemoteSub(s.endpoint || "")}
                        title="Remove this device" disabled={!s.endpoint && true}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Promo Code — visible to student and doctor only */}
        {(user?.role === "student" || user?.role === "doctor") && (
          <>
            <div className="spacer-7" />
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <ShieldCheck size={18} strokeWidth={1.75} style={{ color: "var(--primary)" }} aria-hidden="true" />
                <h3 style={{ margin: 0 }}>Promotion code</h3>
              </div>
              <p className="muted small" style={{ marginTop: 0, marginBottom: 16 }}>
                Have a special access code? Enter it below to upgrade your account to admin.
              </p>
              {promoSuccess ? (
                <div className="callout callout-ok">
                  Your account has been promoted to admin. Refresh the page to access the admin panel.
                </div>
              ) : (
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <input
                    className="input"
                    style={{ flex: 1, minWidth: 200, letterSpacing: "0.08em", fontWeight: 600 }}
                    type="text"
                    placeholder="Enter promo code"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitPromoCode()}
                    disabled={promoLoading}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={submitPromoCode}
                    disabled={promoLoading || !promoCode.trim()}
                  >
                    {promoLoading ? <><span className="spinner" /> Verifying…</> : "Apply code"}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Account Deletion Request */}
        <div className="spacer-7" />
        <div className="card" style={{ borderColor: "var(--rose-200, #fecdd3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Trash2 size={18} strokeWidth={1.75} style={{ color: "var(--rose-700, #b91c1c)" }} aria-hidden="true" />
            <h3 style={{ margin: 0, color: "var(--rose-700, #b91c1c)" }}>Request account deletion</h3>
          </div>
          <p className="muted small" style={{ marginTop: 0, marginBottom: 16 }}>
            Submitting a request notifies an admin to permanently delete your account and all associated data.
            Your account remains active until the request is approved.
          </p>
          {deleteReqLoading ? (
            <p className="muted small">Loading...</p>
          ) : deleteReqStatus === "pending" ? (
            <div className="alert" style={{ background: "var(--yellow-50, #fefce8)", borderColor: "var(--yellow-300, #fde047)", color: "var(--yellow-800, #713f12)" }}>
              Your deletion request is <strong>pending review</strong>. An admin will process it shortly.
            </div>
          ) : deleteReqStatus === "approved" ? (
            <div className="alert" style={{ background: "var(--red-50, #fff1f2)", borderColor: "var(--rose-300, #fda4af)", color: "var(--rose-700, #b91c1c)" }}>
              Your deletion request has been <strong>approved</strong>. Your account will be deleted soon.
            </div>
          ) : (
            <>
              <label className="label" htmlFor="delete-reason">Reason (optional)</label>
              <textarea
                id="delete-reason"
                className="textarea"
                rows={3}
                placeholder="Let us know why you want to leave..."
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                style={{ marginBottom: 12, resize: "vertical" }}
              />
              <button
                className="btn"
                style={{ borderColor: "var(--rose-600, #dc2626)", color: "var(--rose-600, #dc2626)" }}
                onClick={submitDeleteRequest}
                disabled={deleteReqSubmitting}
              >
                {deleteReqSubmitting ? "Submitting..." : "Submit deletion request"}
              </button>
            </>
          )}
        </div>

      </div>
      {confirmEl}
    </AppShell>
  );
}
