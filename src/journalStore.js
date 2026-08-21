const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const api = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "CognoDB photo sync failed.");
  return data;
};

export const saveRidePhoto = async ({ historyId, userId, file }) => {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 2.5 * 1024 * 1024) throw new Error("Photos must be smaller than 2.5 MB.");
  const { photo } = await api(`/api/riders/${encodeURIComponent(userId)}/photos`, {
    method: "POST",
    body: JSON.stringify({ historyId, name: file.name, type: file.type, dataUrl: await fileToDataUrl(file) }),
  });
  return photo;
};

export const getRidePhotos = async (historyId, userId) => {
  const { photos } = await api(`/api/riders/${encodeURIComponent(userId)}/photos?historyId=${encodeURIComponent(historyId)}`);
  return photos || [];
};

export const deleteRidePhoto = async (photoOrId, requestedUserId) => {
  const photoId = typeof photoOrId === "string" ? photoOrId : photoOrId.id;
  await api(`/api/riders/${encodeURIComponent(requestedUserId)}/photos/${encodeURIComponent(photoId)}`, { method: "DELETE" });
};
