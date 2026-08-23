/**
 * Global API Configuration.
 * Set VITE_API_URL to "http://localhost:8000" when running a local backend.
 */

export const url_deployed = "https://my-images-python-backend.onrender.com"
const configuredUrl = import.meta.env.VITE_API_URL || url_deployed;

export const BASE_URL2 = configuredUrl;
export const BASE_URL = configuredUrl.replace(/\/$/, "");

export const ENDPOINTS = {
    EXTRACT: "/pdf-extraction-config",
    SAVE: "/save-pdf",
    CREATE_FROM_TEXT: "/create-pdf-from-text",
    LOG: "/api/log",
    CHAT: "/chat",
    CHAT_EDIT: "/chat-edit",
    CHAT_STATUS: "/chat/status"
};
