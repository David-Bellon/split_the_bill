from fastapi import FastAPI, File, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from typing import List
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from openai import OpenAI
import os
from dotenv import load_dotenv
import json

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

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")


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
    return FileResponse("static/index.html")

@app.post("/process-receipt", status_code=200)
@limiter.limit("5/minute")  # Allow 5 requests per minute
async def process_receipt(request: Request, receipt_request: ReceiptRequest):
    try:
        # Call OpenAI API with the image
        response = client.beta.chat.completions.parse(
            model="gpt-4.1-mini",
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
            response_format=ReceiptResponse,
            max_tokens=500
        )

        # Extract the JSON response
        content = response.choices[0].message.content
        items_data = json.loads(content)

        return items_data

    except Exception as e:
        print(f"Error processing receipt: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error processing receipt: {str(e)}"}
        )
    

def get_system_prompt():
    return """
    You are a receipt analyzer. Extract items, quantities, and prices from receipt images. Always return data in the exact format specified.
    """

def get_user_prompt():
    return """
    Analyze this receipt image and extract all items with their quantities and prices. Return ONLY a JSON array of objects with 'item' (string), 'quantity' (string), and 'price' (string) fields. Only return the items that have a price.
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