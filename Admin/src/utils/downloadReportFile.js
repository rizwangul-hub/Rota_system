import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';

async function responseErrorMessage(data) {
  if (data instanceof Blob) {
    const text = await data.text();
    try {
      const payload = JSON.parse(text);
      if (payload.message) return payload.message;
    } catch {
      return text || 'The report could not be downloaded.';
    }
  }
  if (data && typeof data === 'object' && data.message) return data.message;
  return 'The report could not be downloaded.';
}

export async function downloadReportFile(path, params, fallbackFileName) {
  let response;
  try {
    response = await axios.get(`${API_BASE_URL}${path}`, {
      params,
      responseType: 'blob'
    });
  } catch (error) {
    if (error.response) {
      throw new Error(await responseErrorMessage(error.response.data));
    }
    throw new Error(`Cannot reach the API at ${API_BASE_URL}. Make sure the backend is running.`);
  }

  const contentType = response.headers['content-type'] || '';
  if (contentType.includes('application/json')) {
    throw new Error(await responseErrorMessage(response.data));
  }

  const disposition = response.headers['content-disposition'] || '';
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quotedName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  const fileName = encodedName
    ? decodeURIComponent(encodedName)
    : quotedName || fallbackFileName;
  const file = response.data instanceof Blob
    ? response.data
    : new Blob([response.data], { type: contentType });
  const objectUrl = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
