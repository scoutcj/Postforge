// In dev mode, use empty string to proxy to localhost:3001
// In production, use the Render URL
const API_BASE_URL = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_BASE_URL || 'https://emailparser-m3fr.onrender.com');

async function fetchWithAuth(endpoint, token, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'ngrok-skip-browser-warning': '1'
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error ?? `Request failed with ${response.status}`);
  }

  return response.json();
}

export async function getEmails(token, limit = 50, offset = 0) {
  const { data } = await fetchWithAuth(`/api/emails?limit=${limit}&offset=${offset}`, token);
  return data;
}

export async function getDailyPosts(token, limit = 30, offset = 0) {
  const { data } = await fetchWithAuth(`/api/daily-posts?limit=${limit}&offset=${offset}`, token);
  return data;
}


export async function getUserOrganization(token) {
  const { data } = await fetchWithAuth('/api/organizations/me', token);
  return data;
}

export async function createOrganization(token, { name, recipientEmail }) {
  const { data } = await fetchWithAuth('/api/organizations', token, {
    method: 'POST',
    body: JSON.stringify({ name, recipientEmail })
  });
  return data;
}

export async function joinOrganization(token, { recipientEmail }) {
  const { data } = await fetchWithAuth('/api/organizations/join', token, {
    method: 'POST',
    body: JSON.stringify({ recipientEmail })
  });
  return data;
}

export async function checkEmailAvailability(token, recipientEmail) {
  const { available } = await fetchWithAuth('/api/organizations/check-email', token, {
    method: 'POST',
    body: JSON.stringify({ recipientEmail })
  });
  return available;
}

export async function generatePost(token, selectedImages = []) {
  const response = await fetchWithAuth('/api/daily-posts/generate', token, {
    method: 'POST',
    body: JSON.stringify({ selectedImages })
  });
  return response;
}

// Delete operations for posts
export async function deletePost(token, postId) {
  return await fetchWithAuth(`/api/daily-posts/${postId}`, token, {
    method: 'DELETE'
  });
}

export async function deletePosts(token, postIds) {
  return await fetchWithAuth('/api/daily-posts/bulk/delete', token, {
    method: 'DELETE',
    body: JSON.stringify({ postIds })
  });
}

export async function deleteAllPosts(token, startDate = null, endDate = null) {
  let url = '/api/daily-posts/all';
  if (startDate && endDate) {
    url += `?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
  }
  return await fetchWithAuth(url, token, {
    method: 'DELETE'
  });
}

// Delete operations for images
export async function deleteImage(token, emailId, index) {
  return await fetchWithAuth(`/api/emails/${emailId}/images/${index}`, token, {
    method: 'DELETE'
  });
}

export async function deleteImages(token, images) {
  return await fetchWithAuth('/api/emails/images/bulk', token, {
    method: 'DELETE',
    body: JSON.stringify({ images })
  });
}

export async function deleteAllImages(token, startDate = null, endDate = null) {
  let url = '/api/emails/images/all';
  if (startDate && endDate) {
    url += `?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
  }
  return await fetchWithAuth(url, token, {
    method: 'DELETE'
  });
}
