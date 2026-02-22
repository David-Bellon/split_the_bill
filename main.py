from fastapi import FastAPI, File, UploadFile, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from typing import List, Dict, Any
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from openai import OpenAI
import os
from dotenv import load_dotenv
import json
import pandas as pd
import uuid

# Load environment variables
load_dotenv()

OPEN_AI_KEY = os.getenv("OPEN_AI_KEY")

# Configure OpenAI
client = OpenAI(api_key=OPEN_AI_KEY)

def get_client_ip(request: Request):
    # X-Forwarded-For may contain multiple IPs; use the first one
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host

app = FastAPI()

# Initialize rate limiter
limiter = Limiter(key_func=get_client_ip)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

origins = [
    "https://bill-splitter.odblabs.com"
]

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # In production, replace with your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Ensure the bills directory exists
BILLS_DIR = "bills_data"
os.makedirs(BILLS_DIR, exist_ok=True)

class ReceiptItem(BaseModel):
    item: str
    quantity: str
    price: str

class ReceiptResponse(BaseModel):
    items: List[ReceiptItem]

class ReceiptRequest(BaseModel):
    image: str  # Base64 encoded image

@app.get("/")
async def read_root():
    return FileResponse("static/bil-split.html")

@app.get("/shared_bill/{bill_id}")
async def read_shared_bill():
    # Make sure the path matches where you saved the file
    return FileResponse("static/shared_bill.html")

@app.post("/process-receipt", status_code=200)
@limiter.limit("5/minute")  # Allow 5 requests per minute
async def process_receipt(request: Request, receipt_request: ReceiptRequest):
    try:
        # Call OpenAI API with the image
        response = client.beta.chat.completions.parse(
            model="gpt-4.1-mini", # Make sure to use 'gpt-4o-mini' instead of 'gpt-4.1-mini'
            messages=[
                {
                    "role": "system",
                    "content": get_system_prompt()
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": get_user_prompt()
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": receipt_request.image
                            }
                        }
                    ]
                }
            ],
            response_format=ReceiptResponse
        )

        # Extract the JSON response
        content = response.choices[0].message.content
        items_data = json.loads(content)
        print(items_data)
        return items_data

    except Exception as e:
        print(f"Error processing receipt: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error processing receipt: {str(e)}"}
        )

# --- Collaborative Link Endpoints ---

@app.post("/api/bills/create")
async def create_bill(bill_state: Dict[str, Any]):
    """Creates a new bill session and returns a UUID."""
    bill_id = str(uuid.uuid4())
    filepath = os.path.join(BILLS_DIR, f"{bill_id}.json")
    
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(bill_state, f, ensure_ascii=False)
        
    return {"uuid": bill_id}

@app.get("/api/bills/{bill_id}")
async def get_bill(bill_id: str):
    """Retrieves an existing bill session by UUID."""
    filepath = os.path.join(BILLS_DIR, f"{bill_id}.json")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Bill not found")
        
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)

@app.post("/api/bills/{bill_id}/update")
async def update_bill(bill_id: str, bill_state: Dict[str, Any]):
    """Updates an existing bill session with new user selections."""
    filepath = os.path.join(BILLS_DIR, f"{bill_id}.json")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Bill not found")
        
    # Write the updated state back to the JSON file
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(bill_state, f, ensure_ascii=False)
        
    return {"status": "success"}

# --- Prompts ---

def get_system_prompt():
    return """
    You are a receipt analyzer. Extract items, quantities, and prices from receipt images. Always return data in the exact format specified.
    """

def get_user_prompt():
    return """
    Analyze the image of a restaurant receipt and extract only the purchased items that have prices.
    Return a JSON array of objects, each with:
    - 'item' (string): the name or description of the item
    - 'quantity' (string): the quantity ordered
    - 'price' (string): the unit price of the item (not the total)

    Important rules:
    - If an item shows quantity x unit price = total (e.g., 2 x $5.00 = $10.00), return only the unit price ($5.00).
    - Do NOT include totals or extended prices.
    - Skip items without a clear price.

    Respond only with the JSON array. No explanations or extra text.
    """

@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Try again later."}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9292)