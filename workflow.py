# =============================================================================
#  workflow.py — LangGraph Pipeline
#
#  Node 1 : Preprocess  — validate + decode image
#  Node 2 : DenseNet    — classify + GradCAM
#  Node 3 : Router      — Normal/Benign → low risk | Leuko/OSCC → high risk
#  Node 4a: Report Low  — brief clinical note
#  Node 4b: Report High — detailed clinical report
#  Node 5 : Risk Score  — final score + recommendation
# =============================================================================

import io
from datetime import datetime
from typing import TypedDict, Optional

from PIL import Image
from langgraph.graph import StateGraph, END

from model import predict, CLASS_NAMES, RISK_CONFIG, CLINICAL_DESC


# ── State ─────────────────────────────────────────────────────────────────────
class State(TypedDict):
    image_bytes:       bytes
    filename:          str
    patient_id:        str

    predicted_class:   Optional[str]
    confidence:        Optional[float]
    probabilities:     Optional[dict]
    gradcam_b64:       Optional[str]

    risk_path:         Optional[str]
    risk_score:        Optional[int]
    risk_level:        Optional[str]
    recommendation:    Optional[str]
    clinical_description: Optional[str]
    report_detail:     Optional[str]   # "brief" or "detailed"

    final_report:      Optional[str]
    error:             Optional[str]


# ── Node 1: Preprocess ────────────────────────────────────────────────────────
def node_preprocess(state: State) -> dict:
    try:
        img = Image.open(io.BytesIO(state["image_bytes"])).convert("RGB")
        w, h = img.size
        return {"error": None}
    except Exception as e:
        return {"error": f"Invalid image: {e}"}


# ── Node 2: DenseNet169 classify + GradCAM ───────────────────────────────────
def node_densenet(state: State) -> dict:
    if state.get("error"):
        return {}
    try:
        result = predict(state["image_bytes"])
        return {
            "predicted_class": result["predicted_class"],
            "confidence":      result["confidence"],
            "probabilities":   result["probabilities"],
            "gradcam_b64":     result["gradcam_b64"],
        }
    except Exception as e:
        return {"error": f"Model inference failed: {e}"}


# ── Node 3: Router ────────────────────────────────────────────────────────────
def node_router(state: State) -> dict:
    if state.get("error"):
        return {"risk_path": "high_risk"}
    cls  = state.get("predicted_class", "Normal")
    path = "low_risk" if cls in ["Normal", "Benign"] else "high_risk"
    return {"risk_path": path}


def route_edge(state: State) -> str:
    return state.get("risk_path", "high_risk")


# ── Node 4a: Low Risk Report (brief) ─────────────────────────────────────────
def node_report_low(state: State) -> dict:
    cls = state.get("predicted_class", "Normal")
    return {
        "clinical_description": CLINICAL_DESC.get(cls, ""),
        "report_detail": "brief",
    }


# ── Node 4b: High Risk Report (detailed) ─────────────────────────────────────
def node_report_high(state: State) -> dict:
    cls = state.get("predicted_class", "OSCC")

    detailed_extra = {
        "Leukoplakia": (
            "\n\nDetailed Findings: Epithelial dysplasia with hyperkeratosis observed. "
            "Irregular cell arrangement and increased nuclear-cytoplasmic ratio noted. "
            "Risk of malignant transformation is 5–17% over 10 years. "
            "Immediate biopsy and histopathological confirmation is strongly recommended. "
            "Patient should avoid tobacco and alcohol during evaluation period."
        ),
        "OSCC": (
            "\n\nDetailed Findings: Malignant epithelial cells with invasive growth pattern. "
            "Stromal infiltration and disrupted basement membrane observed. "
            "Abnormal vascularity and possible necrotic regions present. "
            "TNM staging workup required including CT scan of neck and chest. "
            "Multidisciplinary team review (oncology, surgery, radiation) recommended immediately."
        ),
    }

    base_desc    = CLINICAL_DESC.get(cls, "")
    extra        = detailed_extra.get(cls, "")
    full_desc    = base_desc + extra

    return {
        "clinical_description": full_desc,
        "report_detail": "detailed",
    }


# ── Node 5: Final Risk Score + Report ────────────────────────────────────────
def node_risk_score(state: State) -> dict:
    if state.get("error"):
        return {
            "risk_score":   0,
            "risk_level":   "UNKNOWN",
            "recommendation": "Analysis failed. Please retry.",
            "final_report": f"ERROR: {state.get('error')}",
        }

    cls        = state.get("predicted_class", "Unknown")
    conf       = state.get("confidence", 0.0)
    risk       = RISK_CONFIG.get(cls, {"score": 0, "level": "UNKNOWN", "urgency": ""})
    probs      = state.get("probabilities", {})
    desc       = state.get("clinical_description", "")
    detail     = state.get("report_detail", "brief")
    patient_id = state.get("patient_id", "UNKNOWN")
    filename   = state.get("filename",   "image")
    date_str   = datetime.now().strftime("%d-%m-%Y  %H:%M")

    # Prob table
    prob_lines = ""
    for c in CLASS_NAMES:
        p    = probs.get(c, 0)
        bar  = "█" * int(p / 5)
        prob_lines += f"  {c:<14}: {p:>5.1f}%  {bar}\n"

    # Word-wrap description
    import textwrap
    desc_wrapped = textwrap.fill(desc, width=58)
    desc_block   = "\n".join(f"  {line}" for line in desc_wrapped.splitlines())

    report = f"""
╔══════════════════════════════════════════════════════════════╗
║         ORAL CANCER SCREENING REPORT                        ║
╠══════════════════════════════════════════════════════════════╣
║  Patient ID   : {patient_id:<44}║
║  File         : {filename:<44}║
║  Date         : {date_str:<44}║
╠══════════════════════════════════════════════════════════════╣
║  FINDINGS                                                   ║
║  Classification : {cls:<42}║
║  Confidence     : {conf:<5.1f}%{'':<37}║
║  Risk Score     : {risk['score']}/10  [{risk['level']} RISK]{'':<33}║
║  Report Type    : {detail.upper():<43}║
╠══════════════════════════════════════════════════════════════╣
║  CLASS PROBABILITIES                                        ║
{prob_lines}╠══════════════════════════════════════════════════════════════╣
║  VISUAL ANALYSIS (Grad-CAM)                                 ║
║  Heatmap generated — high attention regions highlighted.    ║
║  Red/yellow areas show where model focused for decision.    ║
╠══════════════════════════════════════════════════════════════╣
║  CLINICAL DESCRIPTION                                       ║
{desc_block}
╠══════════════════════════════════════════════════════════════╣
║  RECOMMENDATION                                             ║
║  {risk['urgency']:<60}║
╠══════════════════════════════════════════════════════════════╣
║  ⚠  AI screening tool only. Clinical confirmation required. ║
╚══════════════════════════════════════════════════════════════╝
"""
    return {
        "risk_score":    risk["score"],
        "risk_level":    risk["level"],
        "recommendation":risk["urgency"],
        "final_report":  report,
    }


# ── Build graph ───────────────────────────────────────────────────────────────
def build_graph():
    g = StateGraph(State)

    g.add_node("preprocess",   node_preprocess)
    g.add_node("densenet",     node_densenet)
    g.add_node("router",       node_router)
    g.add_node("report_low",   node_report_low)
    g.add_node("report_high",  node_report_high)
    g.add_node("risk_score",   node_risk_score)

    g.set_entry_point("preprocess")
    g.add_edge("preprocess", "densenet")
    g.add_edge("densenet",   "router")

    g.add_conditional_edges(
        "router",
        route_edge,
        {"low_risk": "report_low", "high_risk": "report_high"},
    )

    g.add_edge("report_low",  "risk_score")
    g.add_edge("report_high", "risk_score")
    g.add_edge("risk_score",  END)

    return g.compile()


graph = build_graph()
print("✔ LangGraph workflow compiled\n")


# ── Public runner ─────────────────────────────────────────────────────────────
def run_pipeline(image_bytes: bytes,
                 filename:    str = "image.jpg",
                 patient_id:  str = "P001") -> dict:

    initial: State = {
        "image_bytes":        image_bytes,
        "filename":           filename,
        "patient_id":         patient_id,
        "predicted_class":    None,
        "confidence":         None,
        "probabilities":      None,
        "gradcam_b64":        None,
        "risk_path":          None,
        "risk_score":         None,
        "risk_level":         None,
        "recommendation":     None,
        "clinical_description": None,
        "report_detail":      None,
        "final_report":       None,
        "error":              None,
    }

    result = graph.invoke(initial)

    return {
        "patient_id":           result.get("patient_id"),
        "filename":             result.get("filename"),
        "predicted_class":      result.get("predicted_class"),
        "confidence":           result.get("confidence"),
        "probabilities":        result.get("probabilities"),
        "gradcam_b64":          result.get("gradcam_b64"),
        "risk_score":           result.get("risk_score"),
        "risk_level":           result.get("risk_level"),
        "recommendation":       result.get("recommendation"),
        "clinical_description": result.get("clinical_description"),
        "report_detail":        result.get("report_detail"),
        "risk_path":            result.get("risk_path"),
        "final_report":         result.get("final_report"),
        "error":                result.get("error"),
    }