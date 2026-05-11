"use client";

import { useEffect, useState } from "react";
import { initialState } from "@/lib/seed";
import { loadBrainpressState, resetBrainpressState, saveBrainpressState } from "@/lib/storage";
import type { BrainpressState } from "@/lib/types";

export function useBrainpress() {
  const [state, setState] = useState<BrainpressState>(initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(loadBrainpressState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveBrainpressState(state);
  }, [hydrated, state]);

  function replaceState(nextState: BrainpressState) {
    setState(nextState);
  }

  function reset() {
    setState(resetBrainpressState());
  }

  return {
    state,
    hydrated,
    setState,
    replaceState,
    reset,
  };
}
