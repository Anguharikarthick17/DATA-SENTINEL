"""POST /chat route."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models import ChatRequest, ChatResponse
from app.services.chat_service import answer_question

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Grounded NL→Cypher→Neo4j chat. Never hallucinates."""
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    result = answer_question(req.question.strip(), dataset_id=req.dataset_id)
    return ChatResponse(**result)
