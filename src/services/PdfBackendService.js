import { BASE_URL, ENDPOINTS } from "./api";

/**
 * Service to handle communication with the PDF Extraction Backend.
 */
export const uploadPdfToBackend = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

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
