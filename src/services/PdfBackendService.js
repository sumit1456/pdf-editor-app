/**
 * Service to handle communication with PDF Extraction Backends.
 * Supports Java (8080) and Python (8000).
 */
export const uploadPdfToBackend = async (file, backend = 'python') => {
    const JAVA_API = "https://resumemaker-1.onrender.com";
    const PYTHON_API = "http://localhost:8000";

    // Default to Python if not specified or for the new flow
    const apiBase = (backend === 'java' ? JAVA_API : PYTHON_API);
    const endpoint = '/pdf-extraction-config';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${apiBase}${endpoint}`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Backend Error ${response.status}: ${errorText || response.statusText}`);
        }

        const json = await response.json();
        return json;
    } catch (error) {
        console.error(`${backend} PDF Upload Failed:`, error);
        throw error;
    }
};
