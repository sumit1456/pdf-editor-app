import os
import logging
import json
import zipfile
from adobe.pdfservices.operation.auth.service_principal_credentials import ServicePrincipalCredentials
from adobe.pdfservices.operation.pdf_services import PDFServices
from adobe.pdfservices.operation.pdf_services_media_type import PDFServicesMediaType
from adobe.pdfservices.operation.pdfjobs.params.extract_pdf.extract_pdf_params import ExtractPDFParams
from adobe.pdfservices.operation.pdfjobs.params.extract_pdf.extract_element_type import ExtractElementType
from adobe.pdfservices.operation.pdfjobs.jobs.extract_pdf_job import ExtractPDFJob
from adobe.pdfservices.operation.pdfjobs.result.extract_pdf_result import ExtractPDFResult
from adobe.pdfservices.operation.io.cloud_asset import CloudAsset
from adobe.pdfservices.operation.io.stream_asset import StreamAsset
from adobe.pdfservices.operation.exception.exceptions import ServiceApiException, ServiceUsageException, SdkException

# Initialize the logger
logging.basicConfig(level=logging.INFO)

def get_masked_input(prompt=""):
    """
    Prompts for input and masks characters with '*' on Windows.
    """
    import sys
    try:
        import msvcrt
        print(prompt, end="", flush=True)
        password = ""
        while True:
            ch = msvcrt.getch()
            if ch == b'\r' or ch == b'\n':
                print()
                return password
            elif ch == b'\x08':  # Backspace
                if len(password) > 0:
                    password = password[:-1]
                    sys.stdout.write('\b \b')
                    sys.stdout.flush()
            elif ch == b'\x03': # Ctrl+C
                raise KeyboardInterrupt
            else:
                try:
                    char = ch.decode("utf-8")
                    password += char
                    sys.stdout.write("*")
                    sys.stdout.flush()
                except:
                    pass
    except ImportError:
        import getpass
        return getpass.getpass(prompt)

class ExtractTextInfoFromPDF:
    def __init__(self, input_pdf_path, output_zip_path, client_id, client_secret):
        if not os.path.exists(input_pdf_path):
            print(f"❌ File not found: {input_pdf_path}")
            return

        try:
            print(f"🚀 Starting Extraction for: {input_pdf_path}")
            
            # Open source file
            with open(input_pdf_path, "rb") as file:
                input_stream = file.read()

            # Initial setup, create credentials instance
            credentials = ServicePrincipalCredentials(
                client_id=client_id,
                client_secret=client_secret,
            )

            # Creates a PDF Services instance
            pdf_services = PDFServices(credentials=credentials)

            # Creates an asset(s) from source file(s) and upload
            print("⬆️  Uploading asset...")
            input_asset = pdf_services.upload(
                input_stream=input_stream, mime_type=PDFServicesMediaType.PDF
            )

            # Create parameters for the job
            extract_pdf_params = ExtractPDFParams(
                elements_to_extract=[ExtractElementType.TEXT],
            )

            # Creates a new job instance
            extract_pdf_job = ExtractPDFJob(
                input_asset=input_asset, extract_pdf_params=extract_pdf_params
            )

            # Submit the job and gets the job result
            print(f"⏳ Submitting job...")
            location = pdf_services.submit(extract_pdf_job)
            
            print(f"⏳ Polling for result...")
            pdf_services_response = pdf_services.get_job_result(
                location, ExtractPDFResult
            )

            # Get content from the resulting asset(s)
            result_asset: CloudAsset = pdf_services_response.get_result().get_resource()
            stream_asset: StreamAsset = pdf_services.get_content(result_asset)

            # Creates an output stream and copy stream asset's content to it
            print(f"💾 Saving result to: {output_zip_path}")
            with open(output_zip_path, "wb") as file:
                file.write(stream_asset.get_input_stream())
            
            self.extract_json_from_zip(output_zip_path)

        except (ServiceApiException, ServiceUsageException, SdkException) as e:
            logging.exception(f"Exception encountered while executing operation: {e}")

    def extract_json_from_zip(self, zip_path):
        """Helper to extract the main JSON from the result zip"""
        try:
            zip_dir = os.path.dirname(zip_path)
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                # List all files in zip to find json
                for file in zip_ref.namelist():
                    if file.endswith(".json"):
                        target_json_path = os.path.join(zip_dir, "adobe_extraction_result.json")
                        
                        # Read, parse, and write formatted
                        with zip_ref.open(file) as zf:
                            json_data = json.load(zf)
                        
                        with open(target_json_path, "w", encoding="utf-8") as f_out:
                            json.dump(json_data, f_out, indent=4)
                            
                        print(f"✅ Extracted and Formatted JSON to: {target_json_path}")
                        break
        except Exception as e:
            print(f"⚠️ Failed to unzip result: {e}")

if __name__ == "__main__":
    # --- CONFIGURATION ---
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # tests/
    SAMPLE_PDF = os.path.join(BASE_DIR, "samples", "nable_python.pdf")
    RESULTS_DIR = os.path.join(BASE_DIR, "results")
    OUTPUT_ZIP = os.path.join(RESULTS_DIR, "extractTextInfoFromPDF.zip")
    
    os.makedirs(RESULTS_DIR, exist_ok=True)

    # --- CREDENTIALS ---
    CLIENT_ID = os.getenv("ADOBE_CLIENT_ID", "3df1f4bb1c5b426ca0e0d0b4497894c5")
    CLIENT_SECRET = os.getenv("ADOBE_CLIENT_SECRET")
    
    # Prompt for secret if missing
    if not CLIENT_SECRET or CLIENT_SECRET == "YOUR_CLIENT_SECRET_HERE":
        print(f"🔒 Client ID: {CLIENT_ID}")
        print("🔑 Enter your Adobe Client Secret:")
        try:
            CLIENT_SECRET = get_masked_input("> ")
        except Exception:
            CLIENT_SECRET = input("> ")
    
    if not CLIENT_SECRET:
         print("❌ No client secret provided. Exiting.")
         exit(1)

    # Run the SDK logic
    ExtractTextInfoFromPDF(SAMPLE_PDF, OUTPUT_ZIP, CLIENT_ID, CLIENT_SECRET)
