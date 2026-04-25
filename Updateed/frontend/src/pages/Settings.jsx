import { useState, useEffect, useRef, useCallback } from "react";
import AppShell from "../components/AppShell.jsx";
import Avatar from "../components/Avatar.jsx";
import Toggle from "../components/Toggle.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { useToast } from "../components/Toast.jsx";
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
  const toast = useToast();
  const [showScores, setShowScores] = useState(false);
  const [country, setCountry] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
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

  useEffect(() => {
    if (user) {
      setShowScores(!!user.show_scores);
      setCountry(user.country || "");
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

  async function save() {
    try {
      await api.patch("/api/profiles/me", { showScores, country });
      await refresh();
      toast.success("Saved");
    } catch (e) { toast.error(e.message); }
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

  async function removeAvatar() {
    if (!avatarUrl) return;
    if (!window.confirm("Remove profile picture?")) return;
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
        toast.error("Permission denied. Enable notifications in your browser settings.");
      } else {
        toast.error(e.message || "Could not enable notifications");
      }
      setPermission(getPermission());
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
            <label className="label">Country</label>
            <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} />
          </div>

          {user?.role === "student" && (
            <div className="field">
              <label className="label">Show scores publicly on profile</label>
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" checked={showScores} onChange={(e) => setShowScores(e.target.checked)} />
                <span className="muted small">Off by default. Your average score will be visible to anyone viewing your profile.</span>
              </label>
            </div>
          )}

          <button className="btn btn-primary" onClick={save}>Save changes</button>
        </div>

        <div className="spacer-6" />

        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <h3 style={{ margin: 0 }}>Browser notifications</h3>
              <p className="muted small" style={{ margin: "4px 0 0" }}>
                Get pinged on this device even when Reasonal isn't open.
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
              Notifications are blocked. Open the site permissions in your browser address bar and set Notifications to <strong>Allow</strong>, then reload.
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
      </div>
    </AppShell>
  );
}
