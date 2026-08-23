import os
from pinecone import Pinecone
from dotenv import load_dotenv

# Load from the portfolio .env since we know it's there
load_dotenv(r"c:\Users\SUMIT\Downloads\resumemaker-frontend-master\portfolio\portfolio\.env")

pinecone_api_key = os.getenv("VITE_PINECONE_API_KEY")
pc = Pinecone(api_key=pinecone_api_key)

index_name = "portfolio-index"
index_description = pc.describe_index(index_name)
print(f"Index: {index_name}")
print(f"Dimension: {index_description.dimension}")
print(f"Metric: {index_description.metric}")

index = pc.Index(index_name)
stats = index.describe_index_stats()
print(f"Stats: {stats}")
