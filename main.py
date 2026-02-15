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
import pandas as pd

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


class ReceiptItem(BaseModel):
    item: str
    quantity: str
    price: str

class ReceiptResponse(BaseModel):
    items: List[ReceiptItem]

class ReceiptRequest(BaseModel):
    image: str  # Base64 encoded image


@app.post("/calculate-debt")
async def calculate_debt(request: Request):
    data = await request.json()

    # Initialize DataFrames with float dtype to avoid dtype warnings
    df = pd.DataFrame(index=data['members'], columns=data['members'], dtype=float)
    df.fillna(0.0, inplace=True)

    df_payments = pd.DataFrame(index=data['members'], columns=data['members'], dtype=float)
    df_payments.fillna(0.0, inplace=True)

    for person_debt in data['people_debt']:
        for payed in person_debt['payed']:
            df.loc[person_debt['paidBy'], payed['member']] += payed['amount']

    if data["payments"] is not None:
        for payment in data["payments"]:
            payer = payment['from']
            receiver = payment['to']
            amount = payment['amount']
            df_payments.loc[payer, receiver] += amount


    real_debt = df.transpose() - df_payments
    print(real_debt)
    debt = real_debt - real_debt.transpose()
    debt[debt < 0] = 0

    total_debt = {}
    for member in data['members']:
        debt_to_pay = debt.loc[member]
        total_debt[member] = debt_to_pay.to_dict()

    print(total_debt)

    return JSONResponse(
        status_code=200,
        content={"debt": total_debt}
    )


@app.get("/")
async def read_root():
    return FileResponse("static/bil-split.html")


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
