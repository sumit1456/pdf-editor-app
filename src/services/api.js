/**
 * Global API Configuration.
 * Configure VITE_API_URL in the frontend environment (for example, in pdf-editor-app/.env).
 */

const configuredUrl = import.meta.env.VITE_API_URL;
if (!configuredUrl) {
    throw new Error('VITE_API_URL is required. Set it in the frontend environment before starting or building the app.');
}

export const BASE_URL2 = configuredUrl;
export const BASE_URL = configuredUrl.trim().replace(/\/$/, "");

export const ENDPOINTS = {
    EXTRACT: "/pdf-extraction-config",
    SAVE: "/save-pdf",
    CREATE_FROM_TEXT: "/create-pdf-from-text",
    LOG: "/api/log",
    CHAT: "/chat",
    CHAT_EDIT: "/chat-edit",
    CHAT_STATUS: "/chat/status"
};
