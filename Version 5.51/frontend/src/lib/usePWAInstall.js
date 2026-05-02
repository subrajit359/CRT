import { useEffect, useState } from "react";

let _deferredPrompt = null;
const _listeners = new Set();

function notify() {
  _listeners.forEach((fn) => fn(_deferredPrompt));
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    _deferredPrompt = e;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    _deferredPrompt = null;
    notify();
  });
}

export function usePWAInstall() {
  const [prompt, setPrompt] = useState(_deferredPrompt);

  useEffect(() => {
    const handler = (p) => setPrompt(p);
    _listeners.add(handler);
    return () => _listeners.delete(handler);
  }, []);

  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      _deferredPrompt = null;
      setPrompt(null);
    }
  };

  return { canInstall: !!prompt, install };
}
