import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';

let _cachedShops = null;
let _cachedShopsPromise = null;

/**
 * Returns the list of active shops.
 * Deduplicates concurrent requests and caches in memory across component unmounts.
 */
export async function getCachedShops(forceRefresh = false) {
  if (!forceRefresh && _cachedShops && Array.isArray(_cachedShops) && _cachedShops.length > 0) {
    return _cachedShops;
  }
  if (!forceRefresh && _cachedShopsPromise) {
    return _cachedShopsPromise;
  }

  _cachedShopsPromise = axios.get(`${API_BASE_URL}/shops`)
    .then(res => {
      if (res.data && res.data.success) {
        _cachedShops = res.data.shops || [];
      }
      _cachedShopsPromise = null;
      return _cachedShops || [];
    })
    .catch(err => {
      _cachedShopsPromise = null;
      throw err;
    });

  return _cachedShopsPromise;
}

/**
 * Returns currently cached shops synchronously (or empty array if not loaded yet).
 */
export function getCachedShopsSync() {
  return _cachedShops || [];
}

/**
 * Clears the shop cache (e.g. when a shop is created, updated, or toggled).
 */
export function clearShopCache() {
  _cachedShops = null;
  _cachedShopsPromise = null;
}
