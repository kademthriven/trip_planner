import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import {
  firebaseAuth,
  firebaseConfigured,
  firebaseStorage,
  firestore,
} from "./firebase";

const DB_NAME = "rove-ride-media";
const STORE_NAME = "photos";

const openDatabase = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE_NAME, {
        keyPath: "id",
      });
      store.createIndex("historyId", "historyId", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const validatePhoto = (file) => {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Photos must be smaller than 10 MB.");
};

export const saveRidePhoto = async ({ historyId, userId, file }) => {
  validatePhoto(file);
  const id = crypto.randomUUID?.() || `photo-${Date.now()}`;
  if (firebaseConfigured) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const storagePath = `ride-photos/${userId}/${historyId}/${id}-${safeName}`;
    const storageReference = ref(firebaseStorage, storagePath);
    await uploadBytes(storageReference, file, { contentType: file.type });
    const url = await getDownloadURL(storageReference);
    const photo = {
      id,
      historyId,
      userId,
      name: file.name,
      type: file.type,
      url,
      dataUrl: url,
      storagePath,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(firestore, "users", userId, "ridePhotos", id), photo);
    return photo;
  }
  const database = await openDatabase();
  const photo = {
    id,
    historyId,
    userId,
    name: file.name,
    type: file.type,
    dataUrl: await fileToDataUrl(file),
    createdAt: new Date().toISOString(),
  };
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(photo);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  return photo;
};

export const getRidePhotos = async (historyId, userId) => {
  if (firebaseConfigured) {
    const snapshot = await getDocs(
      query(
        collection(firestore, "users", userId, "ridePhotos"),
        where("historyId", "==", historyId),
      ),
    );
    return snapshot.docs
      .map((item) => item.data())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const database = await openDatabase();
  const photos = await new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME)
      .objectStore(STORE_NAME)
      .index("historyId")
      .getAll(historyId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return photos
    .filter((photo) => photo.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const deleteRidePhoto = async (photoOrId, requestedUserId) => {
  const photoId = typeof photoOrId === "string" ? photoOrId : photoOrId.id;
  if (firebaseConfigured) {
    const userId = requestedUserId || firebaseAuth.currentUser?.uid;
    if (!userId) throw new Error("Sign in again to remove this photo.");
    const photoReference = doc(
      firestore,
      "users",
      userId,
      "ridePhotos",
      photoId,
    );
    const storedPhoto =
      typeof photoOrId === "string"
        ? (await getDoc(photoReference)).data()
        : photoOrId;
    if (storedPhoto?.storagePath)
      await deleteObject(ref(firebaseStorage, storedPhoto.storagePath));
    await deleteDoc(photoReference);
    return;
  }
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(photoId);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
};
