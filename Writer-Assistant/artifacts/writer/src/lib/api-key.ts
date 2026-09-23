const API_KEY_STORAGE_KEY = "wa_user_api_key";
const BASE_URL_STORAGE_KEY = "wa_user_base_url";
const MODEL_STORAGE_KEY = "wa_user_model";
const ENABLED_STORAGE_KEY = "wa_user_api_key_enabled";

function migrateLegacyConfigToSession() {
  try {
    for (const key of [API_KEY_STORAGE_KEY, BASE_URL_STORAGE_KEY, MODEL_STORAGE_KEY, ENABLED_STORAGE_KEY]) {
      const legacyValue = localStorage.getItem(key);
      if (legacyValue !== null && sessionStorage.getItem(key) === null) {
        sessionStorage.setItem(key, legacyValue);
      }
      if (legacyValue !== null) localStorage.removeItem(key);
    }
  } catch {
    // Storage can be disabled by browser privacy settings.
  }
}

export type UserApiConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export function getUserApiConfig(): UserApiConfig | null {
  try {
    migrateLegacyConfigToSession();
    const apiKey = sessionStorage.getItem(API_KEY_STORAGE_KEY);
    if (!apiKey || !apiKey.trim()) return null;
    return {
      apiKey: apiKey.trim(),
      baseUrl: sessionStorage.getItem(BASE_URL_STORAGE_KEY)?.trim() || "https://openrouter.ai/api/v1",
      model: sessionStorage.getItem(MODEL_STORAGE_KEY)?.trim() || "deepseek/deepseek-v4-flash",
    };
  } catch {
    return null;
  }
}

export function isUserApiKeyEnabled(): boolean {
  try {
    migrateLegacyConfigToSession();
    const val = sessionStorage.getItem(ENABLED_STORAGE_KEY);
    if (val === null) return true;
    return val === "true";
  } catch {
    return true;
  }
}

export function setUserApiKeyEnabled(enabled: boolean) {
  sessionStorage.setItem(ENABLED_STORAGE_KEY, enabled ? "true" : "false");
  window.dispatchEvent(new Event("wa:custom-api-key-change"));
}

export function setUserApiKey(apiKey: string) {
  if (apiKey.trim()) {
    sessionStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
  } else {
    sessionStorage.removeItem(API_KEY_STORAGE_KEY);
  }
}

export function setUserBaseUrl(baseUrl: string) {
  if (baseUrl.trim()) {
    sessionStorage.setItem(BASE_URL_STORAGE_KEY, baseUrl.trim());
  } else {
    sessionStorage.removeItem(BASE_URL_STORAGE_KEY);
  }
}

export function setUserModel(model: string) {
  if (model.trim()) {
    sessionStorage.setItem(MODEL_STORAGE_KEY, model.trim());
  } else {
    sessionStorage.removeItem(MODEL_STORAGE_KEY);
  }
}

export function clearUserApiConfig() {
  for (const storage of [sessionStorage, localStorage]) {
    storage.removeItem(API_KEY_STORAGE_KEY);
    storage.removeItem(BASE_URL_STORAGE_KEY);
    storage.removeItem(MODEL_STORAGE_KEY);
    storage.removeItem(ENABLED_STORAGE_KEY);
  }
}
