"""A process boundary lets job cancellation also terminate blocking raster reads."""

import asyncio
import sys
from app.models import QueryRequest
from app.pipeline import handle_query

if __name__ == "__main__":
    request = QueryRequest.model_validate_json(sys.stdin.read())
    result = asyncio.run(handle_query(request))
    print(result.model_dump_json())
