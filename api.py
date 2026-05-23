# =============================================================================
#  api.py — FastAPI Backend
#  Run: uvicorn api:app --reload
# =============================================================================

from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI(
    title="Oral Cancer Detection API",
    description="4-class: Normal / Benign / Leukoplakia / OSCC",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalysisResponse(BaseModel):
    patient_id:           Optional[str]
    filename:             Optional[str]
    predicted_class:      Optional[str]
    confidence:           Optional[float]
    probabilities:        Optional[dict]
    gradcam_b64:          Optional[str]
    risk_score:           Optional[int]
    risk_level:           Optional[str]
    recommendation:       Optional[str]
    clinical_description: Optional[str]
    report_detail:        Optional[str]
    risk_path:            Optional[str]
    final_report:         Optional[str]
    error:                Optional[str]


@app.get("/")
def root():
    return {"message": "Oral Cancer Detection API ✔  (4-class multiclass)"}


@app.get("/health")
def health():
    return {
        "status":  "ok",
        "classes": ["Benign", "Leukoplakia", "Normal", "OSCC"],
        "model":   "DenseNet169 multiclass fine-tuned",
    }


@app.post("/analyse", response_model=AnalysisResponse)
async def analyse(
    file:       UploadFile = File(...),
    patient_id: str        = Form(default="P001"),
):
    from workflow import run_pipeline

    image_bytes = await file.read()
    result = run_pipeline(
        image_bytes=image_bytes,
        filename=file.filename or "image.jpg",
        patient_id=patient_id,
    )
    return AnalysisResponse(**result)
