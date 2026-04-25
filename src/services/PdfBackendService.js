import { BASE_URL, ENDPOINTS } from "./api";

/**
 * Service to handle communication with the PDF Extraction Backend.
 */
export const uploadPdfToBackend = async (file, sessionId) => {
    const formData = new FormData();
    formData.append('file', file);
    if (sessionId) formData.append('session_id', sessionId);

    try {
        const response = await fetch(`${BASE_URL}${ENDPOINTS.EXTRACT}`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Backend Error ${response.status}: ${errorText || response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("PDF Extraction Failed:", error);
        throw error;
    }
};

/**
 * Service to save/export the reconstructed PDF.
 */
export const savePdfToBackend = async (payload) => {
    console.log("===============================================");
    console.log(payload);
    console.log("===============================================");



    try {
        const response = await fetch(`${BASE_URL}${ENDPOINTS.SAVE}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Export Error ${response.status}: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("PDF Export Failed:", error);
        throw error;
    }
};

/**
 * Service to create a PDF from raw text input.
 */
export const createPdfFromText = async (text) => {
    try {
        const response = await fetch(`${BASE_URL}${ENDPOINTS.CREATE_FROM_TEXT}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Creation Error ${response.status}: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("PDF Creation Failed:", error);
        throw error;
    }
};

/**
 * Diagnostic Logging for Font Matching
 * Sends original vs frontend-refined mapping to diagnostic_render.log
 */
export const logFontMapping = async (diagData) => {
    try {
        await fetch(`${BASE_URL}${ENDPOINTS.LOG}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(diagData),
        });
    } catch (error) {
        console.warn('[BackendService] Failed to log font mapping:', error);
    }
};

/**
 * Service to chat with the AI Assistant about the PDF.
 */
export const sendChatMessage = async (message, sessionId, history = []) => {
    try {
        const response = await fetch(`${BASE_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message, session_id: sessionId, history }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Chat Error ${response.status}: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("AI Chat Failed:", error);
        throw error;
    }
};

/**
 * Streaming version of chat message sending.
 * Returns a readable stream reader.
 */
export const sendChatMessageV2 = async (message, sessionId, history = []) => {
    const response = await fetch(`${BASE_URL}/chat-v2`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, session_id: sessionId, history }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Chat Streaming Error ${response.status}: ${errorText}`);
    }

    return response.body.getReader();
};

/**
 * Service to send a dedicated edit request to the AI.
 */
export const sendEditMessage = async (message, sessionId, history = []) => {
    try {
        const response = await fetch(`${BASE_URL}/chat-edit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message, session_id: sessionId, history }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Edit Error ${response.status}: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("AI Edit Failed:", error);
        throw error;
    }
};

/**
 * Streaming version of AI edit requests.
 */
export const sendEditMessageV2 = async (message, sessionId, history = []) => {
    const response = await fetch(`${BASE_URL}/chat-edit-v2`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, session_id: sessionId, history }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Edit Streaming Error ${response.status}: ${errorText}`);
    }

    return response.body.getReader();
};

/**
 * Service to explicitly clear a session and its vector data.
 */
export const deleteSession = async (sessionId) => {
    if (!sessionId) return;
    try {
        await fetch(`${BASE_URL}/chat/session/${sessionId}`, {
            method: 'DELETE',
            // use keepalive to ensure request completes even if tab is closing
            keepalive: true
        });
    } catch (error) {
        console.warn("[BackendService] Failed to clear session:", error);
    }
};
/**
 * Service to check the indexing status of a document for AI chat.
 */
export const checkIndexingStatus = async (sessionId) => {
    try {
        const response = await fetch(`${BASE_URL}${ENDPOINTS.CHAT_STATUS}/${sessionId}`);
        if (!response.ok) return { success: false, status: 'error' };
        return await response.json();
    } catch (error) {
        console.error("Status Check Failed:", error);
        return { success: false, status: 'error' };
    }
};
