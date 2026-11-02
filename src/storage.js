// Everything is stored on this device, in IndexedDB. Nothing is sent anywhere.
import { get, set } from "idb-keyval";
import { emptyData } from "./model.js";

const KEY = "stcs:data:v2";

// Returns { data, mode, fresh } where mode is "device" (saving) or "memory" (this browser won't save),
// and fresh means nothing was saved here yet (first visit: the app offers to set up classes).
export async function load() {
  try {
    const data = await get(KEY);
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    return { data: data || emptyData(), mode: "device", fresh: !data };
  } catch {
    return { data: emptyData(), mode: "memory" };
  }
}

let chain = Promise.resolve();
// Saves are queued so an older save can never land after a newer one.
export function save(data) {
  const snapshot = JSON.parse(JSON.stringify(data));
  chain = chain.catch(() => {}).then(() => set(KEY, snapshot));
  return chain;
}
