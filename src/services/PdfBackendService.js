/**
 * Service to handle communication with the Java Spring Boot Backend.
 * Endpoint: POST http://localhost:8080/extract
 */
export const uploadPdfToBackend = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('http://localhost:8080/pdf-extraction-config', {
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
        console.error("PDF Upload Failed:", error);
        throw error;
    }
};
