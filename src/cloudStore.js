import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  get as getRealtime,
  ref as realtimeRef,
  serverTimestamp as realtimeTimestamp,
  set as setRealtime,
} from "firebase/database";
import { firebaseConfigured, firestore, realtimeDatabase } from "./firebase";

const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
};

const legacyUserId = (user) => {
  const session = readJson("rove-session-v1", null);
  return session?.email?.toLowerCase() === user.email?.toLowerCase()
    ? session.id
    : user.id;
};

const localData = (user) => {
  const id = legacyUserId(user);
  return {
    savedTrips: readJson(`rove-saved-trips-${id}`, []),
    groupMembers: readJson(`rove-group-${id}`, [
      {
        id: user.id,
        name: user.name,
        contact: user.email,
        bike: "Adventure motorcycle",
        organizer: true,
      },
    ]),
    expenses: readJson(`rove-expenses-${id}`, []),
    history: readJson(`rove-history-${id}`, []),
    settings: readJson(`rove-settings-${id}`, null),
  };
};

export const loadRiderData = async (user) => {
  const local = localData(user);
  if (!firebaseConfigured) return local;
  if (realtimeDatabase) {
    const reference = realtimeRef(realtimeDatabase, `riderData/${user.id}`);
    const snapshot = await getRealtime(reference);
    if (snapshot.exists()) return { ...local, ...snapshot.val() };
    await setRealtime(reference, {
      ...local,
      ownerId: user.id,
      createdAt: realtimeTimestamp(),
      updatedAt: realtimeTimestamp(),
    });
    return local;
  }
  const reference = doc(firestore, "riderData", user.id);
  const snapshot = await getDoc(reference);
  if (snapshot.exists()) return { ...local, ...snapshot.data() };
  await setDoc(reference, {
    ...local,
    ownerId: user.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return local;
};

export const saveRiderData = async (user, data) => {
  if (!firebaseConfigured) {
    localStorage.setItem(
      `rove-saved-trips-${user.id}`,
      JSON.stringify(data.savedTrips || []),
    );
    localStorage.setItem(
      `rove-group-${user.id}`,
      JSON.stringify(data.groupMembers || []),
    );
    localStorage.setItem(
      `rove-expenses-${user.id}`,
      JSON.stringify(data.expenses || []),
    );
    localStorage.setItem(
      `rove-history-${user.id}`,
      JSON.stringify(data.history || []),
    );
    localStorage.setItem(
      `rove-settings-${user.id}`,
      JSON.stringify(data.settings || null),
    );
    return;
  }
  if (realtimeDatabase) {
    await setRealtime(realtimeRef(realtimeDatabase, `riderData/${user.id}`), {
      ...data,
      ownerId: user.id,
      updatedAt: realtimeTimestamp(),
    });
    return;
  }
  await setDoc(
    doc(firestore, "riderData", user.id),
    {
      ...data,
      ownerId: user.id,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};
