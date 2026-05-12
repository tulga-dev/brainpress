"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStateFromStore, saveStateToStore, selectBrainpressStore, type BrainpressStoreMode } from "@/lib/brainpress-store";
import { initialState } from "@/lib/seed";
import { loadBrainpressState, resetBrainpressState, saveBrainpressState } from "@/lib/storage";
import {
  isSupabaseConfigured,
  requestSupabaseMagicLink,
  restoreSupabaseSession,
  signOutSupabase,
  type SupabaseSession,
} from "@/lib/supabase-browser";
import type { BrainpressState } from "@/lib/types";

export function useBrainpress() {
  const [state, setState] = useState<BrainpressState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const storeSelection = useMemo(() => selectBrainpressStore(session), [session]);
  const storageMode: BrainpressStoreMode = storeSelection.store.mode;

  useEffect(() => {
    setState(loadBrainpressState());
    setHydrated(true);

    let cancelled = false;
    restoreSupabaseSession()
      .then(async (restoredSession) => {
        if (cancelled || !restoredSession) return;
        setSession(restoredSession);
        const cloudSelection = selectBrainpressStore(restoredSession);
        const cloudState = await loadStateFromStore(cloudSelection.store);
        if (!cancelled) {
          setState(cloudState);
          setCloudReady(true);
          setAuthMessage("Cloud sync is active.");
        }
      })
      .catch(() => {
        if (!cancelled) setAuthMessage("Cloud sync could not start. Brainpress is using local mode.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveBrainpressState(state);
    if (storageMode === "cloud" && cloudReady) {
      saveStateToStore(storeSelection.store, state).catch(() => {
        setAuthMessage("Cloud sync hit a save error. Local fallback is still preserved.");
      });
    }
  }, [cloudReady, hydrated, state, storageMode, storeSelection.store]);

  function replaceState(nextState: BrainpressState) {
    setState(nextState);
  }

  function reset() {
    setState(resetBrainpressState());
  }

  async function signIn(email: string) {
    setAuthLoading(true);
    try {
      await requestSupabaseMagicLink(email, typeof window !== "undefined" ? window.location.href : undefined);
      setAuthMessage("Check your email for the Brainpress sign-in link.");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function signOut() {
    setAuthLoading(true);
    try {
      await signOutSupabase(session);
      setSession(null);
      setCloudReady(false);
      setState(loadBrainpressState());
      setAuthMessage("Signed out. Brainpress is using local mode on this device.");
    } finally {
      setAuthLoading(false);
    }
  }

  return {
    state,
    hydrated,
    cloudReady,
    session,
    storageMode,
    storageSourceLabel: storeSelection.sourceLabel,
    storageSourceReason: storeSelection.reason,
    supabaseConfigured: isSupabaseConfigured(),
    authMessage,
    authLoading,
    setState,
    replaceState,
    reset,
    signIn,
    signOut,
  };
}
