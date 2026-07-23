const API_KEY_STORAGE_KEY = "wa_user_api_key";
const BASE_URL_STORAGE_KEY = "wa_user_base_url";
const MODEL_STORAGE_KEY = "wa_user_model";

export type UserApiConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export function getUserApiConfig(): UserApiConfig | null {
  try {
    const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (!apiKey || !apiKey.trim()) return null;
    return {
      apiKey: apiKey.trim(),
      baseUrl: localStorage.getItem(BASE_URL_STORAGE_KEY)?.trim() || "https://openrouter.ai/api/v1",
      model: localStorage.getItem(MODEL_STORAGE_KEY)?.trim() || "deepseek/deepseek-v4-flash",
    };
  } catch {
    return null;
  }
}

export function setUserApiKey(apiKey: string) {
  if (apiKey.trim()) {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
  } else {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  }
}

export function setUserBaseUrl(baseUrl: string) {
  if (baseUrl.trim()) {
    localStorage.setItem(BASE_URL_STORAGE_KEY, baseUrl.trim());
  } else {
    localStorage.removeItem(BASE_URL_STORAGE_KEY);
  }
}

export function setUserModel(model: string) {
  if (model.trim()) {
    localStorage.setItem(MODEL_STORAGE_KEY, model.trim());
  } else {
    localStorage.removeItem(MODEL_STORAGE_KEY);
  }
}

export function clearUserApiConfig() {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
  localStorage.removeItem(BASE_URL_STORAGE_KEY);
  localStorage.removeItem(MODEL_STORAGE_KEY);
}
