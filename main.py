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
    "You are a highly accurate receipt analyzer. Your job is to extract meal items from restaurant receipts. "
    "Each item should have:"
    "- 'item': name of the food or drink"
    "- 'quantity': number of units ordered (default to '1' if not explicitly shown)"
    "- 'price': the unit price of the item (even if only a total is shown)"
    "Important rules:"
    "1. Always extract the **unit price**, not the total price, even if the receipt shows only the total. "
    "Divide total by quantity if needed."
    "2. Only include lines that have a price (e.g., skip subtotals, taxes, or section headers)."
    "3. Normalize all numeric values as strings with 2 decimal places (e.g., '12.00')."
    "4. If the quantity is missing, assume '1'."
    "5. Do not include tips, taxes, totals, or discounts in the list."
    "6. Focus on menu items actually ordered (food or beverage)."
    """

def get_user_prompt():
    return """
    "Analyze this restaurant receipt image. Extract only the ordered items with their quantity and "
    "**unit price** (not total per line)."
    "Skip totals, taxes, and any non-item lines. Round prices to two decimals."
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