"""Google Sheets API integration and data parsing."""
import httpx
import datetime as dt
from typing import List, Dict, Any, Optional
from pathlib import Path
from google.oauth2 import service_account
from google.auth.transport.requests import Request
from urllib.parse import quote

async def fetch_sheet_values(spreadsheet_id: str, sheet_name: str, _api_key: Optional[str] = None) -> List[List[str]]:
    """Fetch values from a Google Sheet using service account credentials.

    The function reads credentials from google_sheets_credentials.json at the project root.
    """
    # Always quote sheet names to form a valid A1 range (handles spaces and special chars)
    encoded_range = quote(f"'{sheet_name}'", safe='')
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{encoded_range}"

    # Locate credentials file at project root
    project_root = Path(__file__).resolve().parents[1]
    creds_path = project_root / "google_sheets_credentials.json"

    if not creds_path.exists():
        raise FileNotFoundError(f"Google Sheets credentials not found at {creds_path}")

    scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    credentials = service_account.Credentials.from_service_account_file(str(creds_path), scopes=scopes)
    # Ensure token
    request = Request()
    credentials.refresh(request)
    headers = {"Authorization": f"Bearer {credentials.token}"}

    async with httpx.AsyncClient(timeout=30.0, headers=headers) as client:
        response = await client.get(url)
        response.raise_for_status()
        data = response.json()
        return data.get("values", [])

def arrays_to_objects(values: List[List[str]]) -> List[Dict[str, Any]]:
    """Convert 2D array to list of objects with headers as keys."""
    if not values or not values[0]:
        return []
    
    # First row is header
    header = [str(h).strip() for h in values[0]]
    objects = []
    
    for row_index, row in enumerate(values[1:], start=1):
        # Skip empty rows
        if not any((cell or "").strip() for cell in row):
            continue
        
        # Create object with header keys
        obj = {}
        for col_index in range(len(header)):
            value = row[col_index] if col_index < len(row) else None
            obj[header[col_index]] = value
        
        objects.append(obj)
    
    return objects

# Column names that should be parsed as numbers
NUMERIC_KEYS = {
    "Tot. Qty.",
    "Available Qty.",
    "Exchg. Avlb. Qty.",
    "Exchg. Tot. Qty.",
    "Volume",
    "Weight",
    "Amount"
}

# Column names that should be parsed as dates
DATE_KEYS = {
    "Inb. Date",
    "Valid Date",
    "Prod. Date"
}

def to_number(value: Any) -> Optional[float]:
    """Convert value to float, handling commas and empty values."""
    try:
        if value is None or value == "":
            return None
        # Remove commas and convert to float
        clean_value = str(value).replace(",", "")
        return float(clean_value)
    except (ValueError, TypeError):
        return None

def to_iso_date(value: Any) -> Optional[str]:
    """Convert date value to ISO format string."""
    if not value:
        return None
    
    date_str = str(value).strip()
    
    try:
        # Try ISO format first (YYYY-MM-DD)
        parsed = dt.datetime.fromisoformat(date_str)
        return parsed.date().isoformat()
    except ValueError:
        pass
    
    try:
        # Try MM/DD/YYYY format
        parts = date_str.split("/")
        if len(parts) == 3:
            month, day, year = parts
            parsed_date = dt.date(int(year), int(month), int(day))
            return parsed_date.isoformat()
    except (ValueError, IndexError):
        pass
    
    # Return original value if parsing fails
    return None

def coerce_types(obj: Dict[str, Any]) -> Dict[str, Any]:
    """Apply type coercion based on column names."""
    output = {}
    
    for key, value in obj.items():
        if key in NUMERIC_KEYS:
            output[key] = to_number(value)
        elif key in DATE_KEYS:
            output[key] = to_iso_date(value)
        else:
            # Default: clean string or None
            if value is None:
                output[key] = None
            else:
                output[key] = str(value).strip()
    
    return output

def normalize(values: List[List[str]]) -> List[Dict[str, Any]]:
    """Normalize sheet values to typed objects."""
    rows = arrays_to_objects(values)
    return [coerce_types(row) for row in rows]
