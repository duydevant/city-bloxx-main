"use client";
import { useEffect, useSyncExternalStore } from "react";
import { browserRanked } from "./browser";
import { INITIAL_RANKED } from "./coordinator";
const empty = () => () => {};
export function useRanked() {
  const ranked = typeof window === "undefined" ? null : browserRanked();
  const state = useSyncExternalStore(
    ranked?.subscribe ?? empty,
    ranked?.snapshot ?? (() => INITIAL_RANKED),
    () => INITIAL_RANKED,
  );
  useEffect(() => {
    browserRanked();
  }, []);
  return state;
}
