from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import gc # Added for forced garbage collection if needed
import time
import uuid # Add this to your imports
from extractor import PDFExtractor

app = FastAPI(title="PDF to WebGL Extraction Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.post("/extract")
async def extract_pdf(file: UploadFile = File(...)):
    # Create a safe, unique filename to avoid space/character issues on Windows
    unique_filename = f"temp_{uuid.uuid4()}.pdf"
    temp_path = os.path.abspath(unique_filename)
    
    try:
        # 1. Save the file using the absolute path
        with open(temp_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # 2. Verify it actually exists before trying to open it
        if not os.path.exists(temp_path):
            raise HTTPException(status_code=500, detail="File failed to save to disk")

        extractor = PDFExtractor(temp_path)
        try:
            data = extractor.extract()
            
            # Save raw data for debugging as requested
            try:
                import json
                debug_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "latest_extraction.json")
                with open(debug_file, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2)
            except Exception as debug_error:
                print(f"Warning: Failed to save debug JSON: {debug_error}")

            return data
        finally:
            if extractor:
                extractor.close()
            
    except Exception as e:
        print(f"Extraction failed: {str(e)}") # Log this on your server console
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # 4. Clean up the file
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception as e:
                print(f"Cleanup error: {e}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)