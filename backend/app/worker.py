"""A process boundary lets job cancellation also terminate blocking raster reads."""

import asyncio
import sys
import json
from app.crop_auto import AutoCropRequest, retrieve
from app.models import QueryRequest
from app.pipeline import handle_query

if __name__ == "__main__":
    payload = json.loads(sys.stdin.read())
    if payload.get("mode") == "crop_auto":
        print(json.dumps(retrieve(AutoCropRequest.model_validate(payload))))
    else:
        request = QueryRequest.model_validate(payload)
        result = asyncio.run(handle_query(request))
        print(result.model_dump_json())
