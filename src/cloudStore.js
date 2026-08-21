const jsonRequest = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "CognoDB sync failed.");
  return data;
};

export const loadRiderData = async (user) => {
  const data = await jsonRequest(`/api/riders/${encodeURIComponent(user.id)}/state`);
  return {
    savedTrips: data.savedTrips || [],
    groupMembers: data.groupMembers?.length
      ? data.groupMembers
      : [{ id: user.id, name: user.name, contact: user.email, bike: "Adventure motorcycle", organizer: true }],
    expenses: data.expenses || [],
    history: data.history || [],
    settings: data.settings || null,
  };
};

export const saveRiderData = async (user, data) => {
  await jsonRequest(`/api/riders/${encodeURIComponent(user.id)}/state`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
};
