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
import re as _re
import tempfile
from dotenv import load_dotenv
import json
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

class SelectRequest(BaseModel):
    itemId: str
    personId: str
    claimed: bool  # desired state: True = claim, False = unclaim (idempotent)

class AddItemRequest(BaseModel):
    name: str
    price: float
    qty: int = 1

@app.get("/")
async def read_root():
    return FileResponse("static/home.html")

@app.get("/split")
async def read_split():
    return FileResponse("static/bil-split.html")

@app.get("/travel")
async def read_travel():
    return FileResponse("static/travel.html")

@app.get("/shared_bill/{bill_id}")
async def read_shared_bill():
    # Make sure the path matches where you saved the file
    return FileResponse("static/shared_bill.html")

@app.post("/process-receipt", status_code=200)
@limiter.limit("5/minute")  # Allow 5 requests per minute
async def process_receipt(request: Request, receipt_request: ReceiptRequest):
    import base64
    import re
    import uuid
    import os

    # Ensure the bills_images directory exists
    IMAGES_DIR = "bills_images"
    os.makedirs(IMAGES_DIR, exist_ok=True)

    # Generate a unique filename for the image
    image_id = str(uuid.uuid4())

    # Extract the image type and the base64 data (expecting data URL: "data:image/jpeg;base64,...")
    match = re.match(r"data:image/(?P<ext>\w+);base64,(?P<data>.+)", receipt_request.image)
    if match:
        image_ext = match.group("ext")
        image_data = match.group("data")
    else:
        image_ext = "jpg"
        image_data = receipt_request.image  # fallback, but this may not work if not a plain base64 string

    image_filename = f"{image_id}.{image_ext}"
    image_path = os.path.join(IMAGES_DIR, image_filename)

    # Decode and save the image
    try:
        with open(image_path, "wb") as f:
            f.write(base64.b64decode(image_data))
    except Exception as e:
        print(f"Error saving receipt image: {str(e)}")
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

# --- Collaborative Link: storage helpers ---

def _validate_bill_id(bill_id: str) -> str:
    """Validates that bill_id is a proper UUID to prevent path traversal attacks."""
    if not _re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", bill_id, _re.IGNORECASE):
        raise HTTPException(status_code=400, detail="Invalid bill ID format.")
    return bill_id

def _bill_path(bill_id: str) -> str:
    return os.path.join(BILLS_DIR, f"{bill_id}.json")

def _atomic_write_json(filepath: str, data: Any) -> None:
    """Write JSON via a temp file + os.replace so concurrent writes can't corrupt the file."""
    directory = os.path.dirname(filepath) or "."
    fd, tmp = tempfile.mkstemp(dir=directory, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, filepath)
    except Exception:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise

def _load_bill(bill_id: str) -> Dict[str, Any]:
    """Validate the id, ensure the bill exists, and return its stored state."""
    _validate_bill_id(bill_id)
    filepath = _bill_path(bill_id)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Bill not found")
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)

# --- Item normalization (runs once, server-side, at publish time) ---

def _is_assigned_to_all(item: Dict[str, Any], people: List[Dict[str, Any]]) -> bool:
    """True when the item is claimed exactly once by every person in the bill."""
    if not people:
        return False
    total = len(people)
    assigned = item.get("assignedTo", []) or []
    return len(set(assigned)) == total and len(assigned) == total

def _expand_and_lock_items(state: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Expand multi-quantity items into individual units and lock all-assigned items.

    Doing this once at publish time means guests only ever toggle single
    assignments afterwards, which removes the fragile "first guest rewrites the
    whole document" path and the client-side id-prefix expansion hack.
    """
    people = state.get("people", []) or []
    items = state.get("items", []) or []
    result: List[Dict[str, Any]] = []

    for item in items:
        assigned = list(item.get("assignedTo", []) or [])

        # Items shared by everyone stay as a single locked line.
        if _is_assigned_to_all(item, people):
            item["isLocked"] = True
            result.append(item)
            continue

        qty = int(item.get("qty", 1) or 1)
        already_expanded = any(
            i.get("id", "").startswith(item["id"] + "_") for i in items
        )

        if qty > 1 and not already_expanded:
            units = [
                {
                    "id": f'{item["id"]}_{i}',
                    "name": item["name"],
                    "price": item["price"],
                    "qty": 1,
                    "assignedTo": [],
                    "isLocked": False,
                }
                for i in range(qty)
            ]

            # Distribute any pre-assigned people across the freshly created units,
            # mirroring the previous client-side normalization.
            assign_count = len(assigned)
            if assign_count > 0:
                if qty % assign_count == 0:
                    items_per_user = qty // assign_count
                    idx = 0
                    for uid in assigned:
                        for _ in range(items_per_user):
                            units[idx]["assignedTo"].append(uid)
                            idx += 1
                elif assign_count % qty == 0:
                    users_per_item = assign_count // qty
                    uidx = 0
                    for i in range(qty):
                        for _ in range(users_per_item):
                            units[i]["assignedTo"].append(assigned[uidx])
                            uidx += 1
                else:
                    for u in units:
                        u["assignedTo"] = list(assigned)

            result.extend(units)
        else:
            item["isLocked"] = False
            result.append(item)

    return result

# --- Collaborative Link Endpoints ---

@app.post("/api/bills/create")
async def create_bill(bill_state: Dict[str, Any]):
    """Publish a draft to the server. The server copy becomes the single source
    of truth: items are normalized once and the bill is born `live`."""
    bill_id = str(uuid.uuid4())
    bill_state["status"] = "live"
    bill_state["items"] = _expand_and_lock_items(bill_state)
    _atomic_write_json(_bill_path(bill_id), bill_state)
    return {"uuid": bill_id}

@app.get("/api/bills/{bill_id}")
async def get_bill(bill_id: str):
    """Retrieve a bill session by UUID (used for polling and the guest view)."""
    return _load_bill(bill_id)

@app.post("/api/bills/{bill_id}/select")
async def select_item(bill_id: str, req: SelectRequest):
    """Toggle a single person's claim on a single item.

    This replaces guests overwriting the whole document on every tap, so guests
    can no longer clobber each other or the organizer's added items.
    """
    state = _load_bill(bill_id)
    if state.get("status") == "closed":
        raise HTTPException(status_code=409, detail="This bill is closed.")

    if not any(p.get("id") == req.personId for p in state.get("people", [])):
        raise HTTPException(status_code=400, detail="Unknown person for this bill.")

    item = next((i for i in state.get("items", []) if i.get("id") == req.itemId), None)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.get("isLocked"):
        raise HTTPException(status_code=409, detail="Item is shared by everyone and cannot be changed.")

    assigned = item.setdefault("assignedTo", [])
    if req.claimed:
        if req.personId not in assigned:
            assigned.append(req.personId)
    else:
        item["assignedTo"] = [p for p in assigned if p != req.personId]

    _atomic_write_json(_bill_path(bill_id), state)
    return {"status": "success", "assignedTo": item["assignedTo"]}

@app.post("/api/bills/{bill_id}/items/add")
async def add_item(bill_id: str, req: AddItemRequest):
    """Organizer add-only: append a forgotten item after the bill is live.
    Editing or deleting existing items is intentionally not supported."""
    state = _load_bill(bill_id)
    if state.get("status") == "closed":
        raise HTTPException(status_code=409, detail="This bill is closed.")

    new_id = uuid.uuid4().hex[:9]
    qty = max(1, int(req.qty))

    if qty > 1:
        added = [
            {
                "id": f"{new_id}_{i}",
                "name": req.name,
                "price": req.price,
                "qty": 1,
                "assignedTo": [],
                "isLocked": False,
            }
            for i in range(qty)
        ]
    else:
        added = [
            {
                "id": new_id,
                "name": req.name,
                "price": req.price,
                "qty": 1,
                "assignedTo": [],
                "isLocked": False,
            }
        ]

    state.setdefault("items", []).extend(added)
    _atomic_write_json(_bill_path(bill_id), state)
    return {"status": "success", "items": added}

@app.post("/api/bills/{bill_id}/update")
async def update_bill(bill_id: str, bill_state: Dict[str, Any]):
    """DEPRECATED full-document overwrite. Kept only until both frontends migrate
    to /select and /items/add; remove once nothing calls it."""
    state = _load_bill(bill_id)
    if state.get("status") == "closed":
        raise HTTPException(status_code=409, detail="This bill is closed.")
    _atomic_write_json(_bill_path(bill_id), bill_state)
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
