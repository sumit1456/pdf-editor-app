/**
 * Service to handle communication with the Java Spring Boot Backend.
 * Endpoint: POST http://localhost:8080/extract
 */
export const uploadPdfToBackend = async (file) => {

    const api = "https://resumemaker-1.onrender.com";
    const api2 = "http://localhost:8080"
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${api}/pdf-extraction-config`, {
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
